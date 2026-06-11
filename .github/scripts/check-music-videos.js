#!/usr/bin/env node
// .github/scripts/check-music-videos.js
//
// Runs daily via GitHub Actions. Does three things:
//   1. Reads your artist + video data from Supabase
//   2. Checks the YouTube API for new official music videos since the last check
//   3. Writes any new finds back to Supabase, then generates music-videos-rss.xml

'use strict';

const fs   = require('fs');
const path = require('path');

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_EMAIL,
  SUPABASE_PASS,
  YT_API_KEY,
} = process.env;

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_EMAIL', 'SUPABASE_PASS', 'YT_API_KEY'];
const missing  = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing required environment variables:', missing.join(', '));
  console.error('Add them as secrets under Settings > Secrets and variables > Actions in your GitHub repo.');
  process.exit(1);
}

const YT_BASE  = 'https://www.googleapis.com/youtube/v3';
const RSS_PATH = path.join(process.cwd(), 'music-videos-rss.xml');

// ── YouTube helpers ────────────────────────────────────────────────────────

// Mirrors the isMusicVideo filter in music-videos.html exactly.
function isMusicVideo(title) {
  const t = title.toLowerCase();
  const exclude = [
    '(official lyric video)', '(lyric video)',
    '(official audio)',        '(audio)',
    '(official visualizer)',   '(visualizer)',
    '(official live video)',   '(live video)',
    '(behind the scenes)',     '(making of)',
  ];
  if (exclude.some(p => t.includes(p))) return false;
  return ['(official video)', '(official music video)', '(official hd video)'].some(p => t.includes(p));
}

async function ytFetch(endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set('key', YT_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res  = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `YouTube API HTTP ${res.status}`);
  return data;
}

// Mirrors fetchPlaylistSince in music-videos.html exactly.
// Walks the uploads playlist newest-first and stops as soon as it reaches
// content older than cutoffDate, so it only pages through recent uploads.
async function fetchPlaylistSince(playlistId, artistId, artistName, cutoffDate) {
  const found    = {};
  let pageToken  = null;

  do {
    const params = { part: 'snippet', playlistId, maxResults: 50 };
    if (pageToken) params.pageToken = pageToken;
    const data = await ytFetch('playlistItems', params);
    let done   = false;

    for (const item of (data.items || [])) {
      const id    = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;
      const pub   = item.snippet?.publishedAt;

      if (!id || !title || title === 'Private video' || title === 'Deleted video') continue;
      if (cutoffDate && new Date(pub) <= cutoffDate) { done = true; break; }
      if (!isMusicVideo(title)) continue;

      const thumbs = item.snippet?.thumbnails || {};
      const thumb  = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url
                   || thumbs.default?.url || `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

      found[id] = {
        videoId:     id,
        artistId,
        artistName,
        title,
        publishedAt: pub || new Date().toISOString(),
        thumbnail:   thumb,
        watched:     false,
        discoveredAt: new Date().toISOString(),
      };
    }

    if (done) break;
    pageToken = data.nextPageToken;
  } while (pageToken);

  return found;
}

// ── RSS generation ─────────────────────────────────────────────────────────

function escXml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function buildRss(videos) {
  const allVids = Object.values(videos).sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );

  const items = allVids.map(v => {
    const ytUrl = `https://www.youtube.com/watch?v=${v.videoId}`;
    const thumb = v.thumbnail || `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
    const pub   = new Date(v.publishedAt).toUTCString();
    // Title as "Artist - Video Title" for clarity in the RSS reader
    const itemTitle = escXml(`${v.artistName} - ${v.title}`);
    return `    <item>
      <title>${itemTitle}</title>
      <link>${escXml(ytUrl)}</link>
      <guid isPermaLink="false">${escXml(v.videoId)}</guid>
      <pubDate>${pub}</pubDate>
      <description><![CDATA[
        <a href="${ytUrl}">
          <img src="${thumb}" alt="${escXml(v.title)}" style="max-width:100%;border-radius:4px;">
        </a>
        <p style="margin:8px 0 0;font-family:sans-serif;">${escXml(v.artistName)}</p>
      ]]></description>
    </item>`;
  }).join('\n');

  const buildDate = new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Music Videos</title>
    <link>https://swiftothecore.github.io/fun-projects/music-videos</link>
    <description>Official music videos from your tracked artists</description>
    <lastBuildDate>${buildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Authenticate with Supabase ──────────────────────────────────────
  console.log('Authenticating with Supabase...');
  const authRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method:  'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: SUPABASE_EMAIL, password: SUPABASE_PASS }),
    }
  );

  if (!authRes.ok) {
    const err = await authRes.json().catch(() => ({}));
    throw new Error('Supabase auth failed: ' + (err.error_description || err.msg || authRes.status));
  }

  const { access_token, user } = await authRes.json();
  console.log('Authenticated as', user.email);

  const sbHeaders = {
    apikey:        SUPABASE_KEY,
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
  };

  // ── 2. Read current data from Supabase ─────────────────────────────────
  console.log('Reading data from Supabase...');
  const readRes = await fetch(
    `${SUPABASE_URL}/rest/v1/music_videos?user_id=eq.${encodeURIComponent(user.id)}&select=data`,
    { headers: sbHeaders }
  );

  if (!readRes.ok) {
    throw new Error('Supabase read failed: HTTP ' + readRes.status);
  }

  const rows = await readRes.json();

  if (!rows.length || !rows[0].data) {
    console.log('No data in Supabase yet. Writing an empty RSS feed and exiting.');
    console.log('Open the app and add some artists first, then re-run this workflow.');
    fs.writeFileSync(RSS_PATH, buildRss({}), 'utf8');
    return;
  }

  let { artists = [], videos = {}, lastFetch = {} } = rows[0].data;
  console.log(`Found ${artists.length} artist(s) and ${Object.keys(videos).length} existing video(s).`);

  // ── 3. Check YouTube for new videos ────────────────────────────────────
  let totalNew = 0;

  for (const artist of artists) {
    process.stdout.write(`Checking ${artist.name}... `);

    // Find the newest video we already have for this artist so we know where to stop.
    const artistVids = Object.values(videos).filter(v => v.artistId === artist.id);
    let cutoff = null;
    if (artistVids.length > 0) {
      const newest = artistVids.reduce((a, b) =>
        new Date(a.publishedAt) > new Date(b.publishedAt) ? a : b
      );
      cutoff = new Date(newest.publishedAt);
    }

    try {
      const newVids = await fetchPlaylistSince(
        artist.uploadsPlaylistId, artist.id, artist.name, cutoff
      );

      let added = 0;
      for (const [id, v] of Object.entries(newVids)) {
        if (!videos[id]) { videos[id] = v; added++; }
      }

      lastFetch[artist.id] = new Date().toISOString();
      totalNew += added;
      console.log(added > 0 ? `${added} new video(s).` : 'Up to date.');
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }

  // ── 4. Write new videos back to Supabase ───────────────────────────────
  if (totalNew > 0) {
    console.log(`Writing ${totalNew} new video(s) back to Supabase...`);
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/music_videos`, {
      method:  'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates' },
      body:    JSON.stringify({
        user_id:    user.id,
        data:       { artists, videos, lastFetch },
        updated_at: new Date().toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const body = await upsertRes.text();
      // Non-fatal — the RSS feed will still be generated with the in-memory data
      console.warn('Supabase upsert warning:', body);
    } else {
      console.log('Supabase updated successfully.');
    }
  } else {
    console.log('No new videos found across all artists.');
  }

  // ── 5. Generate and write RSS feed ─────────────────────────────────────
  const xml = buildRss(videos);
  fs.writeFileSync(RSS_PATH, xml, 'utf8');
  console.log(`RSS feed written to ${RSS_PATH} (${Object.keys(videos).length} total item(s)).`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
