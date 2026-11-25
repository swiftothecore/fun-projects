// TV series search, API preferences, and background metadata.
const tmdbSearchCache = new Map();
const tmdbDetailCache = new Map();
let searchController;
let metadataTimer;
let metadataQueue = Promise.resolve();
let omdbKey = tvStorageGet('omdb_api_key') || '';
const DAY_MS = 86400000;

function formatAirDate(value) {
  return new Date(value).toLocaleDateString('en-AU', { dateStyle:'medium', timeZone:'UTC' });
}

function cacheRecent(cache, key, value) {
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

async function tmdbFetch(path, params = {}, { key = tmdbKey, signal } = {}) {
  const query = new URLSearchParams({ api_key: key, ...params });
  const url = `https://api.themoviedb.org/3/${path}?${query}`;
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { signal });
    if (response.status !== 429 || attempt === 3) return response;
    const retryAfter = response.headers?.get('Retry-After');
    const seconds = Number(retryAfter);
    const wait = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(retryAfter) - Date.now() || 1000);
    await new Promise(resolve => setTimeout(resolve, Math.min(60000, Math.max(250, wait))));
    signal?.throwIfAborted();
  }
}

async function runSeriesPool(items, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

function updateBanner() {
  document.getElementById('apiBanner').classList.toggle('hidden', !!tmdbKey);
}
function updateSearchSection() {
  document.getElementById('searchOrNotice').style.display = tmdbKey ? 'block' : 'none';
  document.getElementById('noApiNotice').style.display = tmdbKey ? 'none' : 'block';
}
function saveApiKey() {
  const value = document.getElementById('apiKeyInput').value.trim();
  if (!value) return;
  tmdbKey = value;
  tvStorageSet('tmdb_api_key', tmdbKey);
  resetShowSearch();
  document.getElementById('searchResults').classList.remove('open');
  updateBanner();
  updateSearchSection();
  scheduleMetadata();
}
function saveOmdbKey() {
  omdbKey = document.getElementById('omdbKeyInput').value.trim();
  tvStorageSet('omdb_api_key', omdbKey);
  document.getElementById('omdbKeyStatus').textContent = omdbKey ? 'OMDb key saved.' : 'OMDb key removed.';
  scheduleMetadata();
}
function showApiSettings() {
  const banner = document.getElementById('apiBanner');
  if (!banner.classList.contains('hidden')) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  document.getElementById('apiKeyInput').value = tmdbKey;
  document.getElementById('omdbKeyInput').value = omdbKey;
  document.getElementById('apiKeyInput').focus();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function normalizeSeriesTitle(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

async function searchSeries(query, { year, key = tmdbKey, signal } = {}) {
  const normalized = query.replace(/[-\u2010-\u2015]/g, ' ').replace(/\s+/g, ' ').trim();
  const cacheKey = JSON.stringify([key, normalized.toLowerCase(), year]);
  if (tmdbSearchCache.has(cacheKey)) return tmdbSearchCache.get(cacheKey);

  const alias = normalized.toLowerCase();
  const aliasId = [alias, alias.replace(/\s+/g, '')]
    .map(name => Object.hasOwn(TMDB_SEARCH_ALIASES, name) ? TMDB_SEARCH_ALIASES[name] : null).find(Boolean);
  const params = { query: normalized, include_adult: 'false' };
  if (year) params.first_air_date_year = year;
  const [response, aliasShow] = await Promise.all([
    tmdbFetch('search/tv', params, { key, signal }),
    aliasId ? tmdbFetch(`tv/${aliasId}`, {}, { key, signal })
      .then(result => result.ok ? result.json() : null).catch(() => null) : null,
  ]);
  if (!response.ok) throw Object.assign(new Error('TMDB search failed'), { status: response.status });
  const body = await response.json();
  const results = (Array.isArray(body.results) ? body.results : [])
    .filter(show => positiveInteger(show?.id) && typeof (show.name || show.title) === 'string');
  if (positiveInteger(aliasShow?.id) && (!year || aliasShow.first_air_date?.startsWith(year))) {
    results.splice(0, results.length, aliasShow, ...results.filter(show => show.id !== aliasShow.id));
  }
  signal?.throwIfAborted();
  cacheRecent(tmdbSearchCache, cacheKey, results);
  return results;
}

function matchSeries(results, title, year) {
  const normalized = normalizeSeriesTitle(title);
  return results.find(show => [show.name, show.original_name, show.title].some(
    name => typeof name === 'string' && normalizeSeriesTitle(name) === normalized
  ) && (!year || show.first_air_date?.slice(0, 4) === String(year)));
}

function findSavedSeries(id, title, year) {
  const normalized = normalizeSeriesTitle(title);
  return shows.find(show => {
    if (id && show.tmdbId) return String(show.tmdbId) === String(id);
    return normalizeSeriesTitle(show.title) === normalized && (!year || !show.year || String(show.year) === String(year));
  });
}

function getSeriesDetails(id, key = tmdbKey) {
  const cacheKey = JSON.stringify([key, String(id)]);
  if ((tmdbDetailCache.get(cacheKey)?.expires || 0) <= Date.now()) {
    const request = tmdbFetch(`tv/${encodeURIComponent(id)}`, { append_to_response: 'external_ids' }, { key })
      .then(response => {
        if (!response.ok) throw Object.assign(new Error('TMDB details failed'), { status: response.status });
        return response.json();
      })
      .catch(error => {
        if (tmdbDetailCache.get(cacheKey)?.request === request) tmdbDetailCache.delete(cacheKey);
        throw error;
      });
    cacheRecent(tmdbDetailCache, cacheKey, { request, expires: Date.now() + 5 * 60 * 1000 });
  }
  return tmdbDetailCache.get(cacheKey).request;
}

function preloadSeries(id) {
  if (tmdbKey) getSeriesDetails(id).catch(() => {});
}

function onSearchKeyDown(event) {
  if (event.isComposing) return;
  const results = document.getElementById('searchResults');
  const items = results.querySelectorAll('[data-show-id]');
  if (results.classList.contains('open') && items.length) {
    if (event.key === 'ArrowDown') searchHighlightIndex = Math.min(searchHighlightIndex + 1, items.length - 1);
    else if (event.key === 'ArrowUp') searchHighlightIndex = Math.max(searchHighlightIndex - 1, -1);
    else if (event.key === 'Enter') {
      event.preventDefault();
      selectShow(Number(items[Math.max(0, searchHighlightIndex)].dataset.showId));
      return;
    } else return;
    event.preventDefault();
    items.forEach((item, index) => {
      item.classList.toggle('keyboard-active', index === searchHighlightIndex);
      if (index === searchHighlightIndex) item.scrollIntoView({ block:'nearest' });
    });
  } else if (event.key === 'Enter' && event.currentTarget.value.trim()) {
    event.preventDefault();
    clearTimeout(searchTimer);
    searchTMDB(event.currentTarget.value.trim());
  }
}

function resetShowSearch() {
  clearTimeout(searchTimer);
  searchController?.abort();
  searchSequence++;
  selectionSequence++;
  document.getElementById('searchSpinner').classList.remove('active');
}

function onSearchInput(value) {
  resetShowSearch();
  const results = document.getElementById('searchResults');
  results.classList.remove('open');
  results.replaceChildren();
  document.getElementById('searchHint').classList.remove('visible');
  searchHighlightIndex = -1;
  if (value.trim()) {
    document.getElementById('searchSpinner').classList.add('active');
    searchTimer = setTimeout(() => searchTMDB(value.trim()), 300);
  }
}

async function searchTMDB(query) {
  searchController?.abort();
  searchController = new AbortController();
  const sequence = ++searchSequence;
  const spinner = document.getElementById('searchSpinner');
  const results = document.getElementById('searchResults');
  spinner.classList.add('active');
  try {
    const found = await searchSeries(query, { signal: searchController.signal });
    if (sequence !== searchSequence) return;
    results.innerHTML = found.slice(0, 8).map(show => {
      const year = dateOnly(show.first_air_date).slice(0, 4);
      const name = show.name || show.title;
      const saved = findSavedSeries(show.id, name, year);
      const thumb = show.poster_path
        ? `<img class="result-thumb" src="${TMDB_SM}${esc(show.poster_path)}" alt="" loading="lazy">`
        : '<div class="result-thumb-placeholder">📺</div>';
      return `<div class="search-result-item${saved ? ' already-added' : ''}" data-show-id="${Number(show.id)}"
        onclick="selectShow(${Number(show.id)})" onmouseenter="preloadSeries(${Number(show.id)})">
        ${thumb}<div class="result-info"><div class="result-title">${esc(name)}</div>
        <div class="result-meta">${year || '?'}${Number.isFinite(Number(show.vote_average)) && Number(show.vote_average) > 0 ? ' · ★ ' + Number(show.vote_average).toFixed(1) : ''}</div>
        ${show.overview ? `<div class="result-overview">${esc(show.overview)}</div>` : ''}
        ${saved ? '<div class="result-in-list">✓ In your list</div>' : ''}</div></div>`;
    }).join('') || `<div class="search-no-results">No results for "${esc(query)}"</div>`;
    if (found.length) preloadSeries(found[0].id);
  } catch (error) {
    if (sequence !== searchSequence) return;
    results.innerHTML = error.status === 401
      ? '<div class="search-no-results">Invalid TMDB key. Update it under API Keys.</div>'
      : '<div class="search-no-results">Search failed. Try again or enter the show manually.</div>';
  } finally {
    if (sequence === searchSequence) {
      searchHighlightIndex = -1;
      results.classList.add('open');
      spinner.classList.remove('active');
    }
  }
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function imdbSeriesId(value) {
  return typeof value === 'string' && /^tt\d+$/.test(value) ? value : '';
}

function seriesMetadata(details) {
  const episode = details.next_episode_to_air;
  const nextAirDate = dateOnly(episode?.air_date);
  return {
    firstAirDate: dateOnly(details.first_air_date),
    nextEpisode: nextAirDate ? {
      airDate: nextAirDate,
      season: positiveInteger(episode.season_number),
      episode: positiveInteger(episode.episode_number),
    } : null,
    imdbId: imdbSeriesId(details.external_ids?.imdb_id),
    episodeRuntime: positiveInteger(details.episode_run_time?.[0]) || positiveInteger(details.last_episode_to_air?.runtime),
    episodeCount: positiveInteger(details.number_of_episodes),
    tmdbCheckedAt: new Date().toISOString(),
  };
}

function showFromTmdb(details, id) {
  const metadata = seriesMetadata(details);
  return {
    ...metadata,
    tmdbId: id,
    title: details.name || details.title || '',
    year: metadata.firstAirDate.slice(0, 4),
    genre: (details.genres || []).map(genre => genre.name).filter(Boolean).join(', '),
    creator: (details.created_by || []).map(creator => creator.name).filter(Boolean).join(', '),
    rating: Number(details.vote_average) ? Number(details.vote_average).toFixed(1) + '/10' : '',
    seasons: positiveInteger(details.number_of_seasons) || '',
    poster: details.poster_path ? TMDB_IMG + details.poster_path : '',
    notes: details.overview || '',
    tmdbOverview: details.overview || '',
  };
}

async function selectShow(id) {
  resetShowSearch();
  const sequence = selectionSequence;
  const isCurrent = () => sequence === selectionSequence && document.getElementById('addModal').classList.contains('open');
  const results = document.getElementById('searchResults');
  const hint = document.getElementById('searchHint');
  const spinner = document.getElementById('searchSpinner');
  results.classList.remove('open');
  spinner.classList.add('active');
  try {
    const details = await getSeriesDetails(id);
    if (!isCurrent()) return;
    const show = showFromTmdb(details, id);
    pendingShowMetadata = show;
    _pendingTmdbId = id;
    for (const [field, value] of Object.entries({
      fTitle: show.title, fYear: show.year, fFirstAirDate: show.firstAirDate, fGenre: show.genre,
      fCreator: show.creator, fRating: show.rating, fSeasons: show.seasons, fEpisodeRuntime: show.episodeRuntime,
      fEpisodeCount: show.episodeCount, fPoster: show.poster,
    })) document.getElementById(field).value = value ?? '';
    updatePosterPreview(show.poster);
    const notes = document.getElementById('fNotes');
    if (!notes.value || notes.value === notes.dataset.tmdbOverview) {
      notes.value = show.notes;
      notes.dataset.tmdbOverview = show.notes;
    }
    const searchInput = document.getElementById('searchInput');
    searchInput.value = '';
    if (addModalMobile.matches) searchInput.blur();
    const saved = findSavedSeries(id, show.title, show.year);
    hint.textContent = saved && saved.id !== editingId ? 'This show is already in your list.' : `Filled from TMDB: "${show.title}".`;
    updateModalJustWatch();
    collapseMovieDetails();
  } catch {
    if (isCurrent()) hint.textContent = 'Could not load details. Fill in manually.';
  } finally {
    if (isCurrent()) {
      spinner.classList.remove('active');
      hint.classList.add('visible');
    }
  }
}

function recentlyChecked(value, days) {
  const age = Date.now() - Date.parse(value);
  return age >= 0 && age < days * DAY_MS;
}

async function fetchSeriesRatings(show, key) {
  const params = new URLSearchParams({ apikey: key, type: 'series' });
  if (imdbSeriesId(show.imdbId)) params.set('i', show.imdbId);
  else {
    params.set('t', show.title);
    if (show.year) params.set('y', show.year);
  }
  const response = await fetch(`https://www.omdbapi.com/?${params}`);
  if (!response.ok) throw Object.assign(new Error('OMDb request failed'), { status: response.status });
  const data = await response.json();
  if (data.Response === 'False' && /key|limit/i.test(data.Error || '')) {
    throw Object.assign(new Error(data.Error), { status: 401 });
  }
  const score = data.Ratings?.find(rating => rating.Source === 'Rotten Tomatoes')?.Value;
  return {
    rtRating: typeof score === 'string' && /^\d{1,3}%$/.test(score) ? score : '',
    rtCheckedAt: new Date().toISOString(),
    imdbId: imdbSeriesId(show.imdbId) || imdbSeriesId(data.imdbID),
  };
}

async function averageEpisodeRuntime(id, key) {
  const response = await tmdbFetch(`tv/${encodeURIComponent(id)}/season/1`, {}, { key });
  if (response.status === 404) return null;
  if (!response.ok) throw Object.assign(new Error('TMDB season details failed'), { status:response.status });
  const data = await response.json();
  const runtimes = (data.episodes || []).map(episode => positiveInteger(episode.runtime)).filter(Boolean);
  return runtimes.length ? Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / runtimes.length) : null;
}

async function backfillBingeData() {
  const seriesKey = tmdbKey;
  const ratingsKey = omdbKey;
  if (!seriesKey && !ratingsKey) return;
  let changed = false;
  let stopTmdb = false;
  let stopRatings = false;
  const today = localDateStr(new Date());
  await runSeriesPool(shows.slice(), async show => {
    if (show.graveyard) return;
    const original = JSON.stringify(show);
    const metadata = {};
    const due = !recentlyChecked(show.tmdbCheckedAt, show.watching || show.watchStatus === 'more_to_come' ? 1 : 30)
      || (show.nextEpisode?.airDate && show.nextEpisode.airDate < today && !recentlyChecked(show.tmdbCheckedAt, 1));
    const runtimeDue = !!show.tmdbId && !positiveInteger(show.episodeRuntime)
      && !show.metadataOmissions?.includes('episodeRuntime') && !recentlyChecked(show.tmdbRuntimeCheckedAt, 30);
    if (seriesKey && !stopTmdb && (due || runtimeDue)) {
      try {
        let id = show.tmdbId;
        if (!id) {
          const hits = await searchSeries(show.title, { year: show.year, key: seriesKey });
          id = matchSeries(hits, show.title, show.year)?.id;
        }
        if (id) {
          const details = await getSeriesDetails(id, seriesKey);
          const fill = seriesMetadata(details);
          metadata.tmdbId = id;
          metadata.tmdbCheckedAt = fill.tmdbCheckedAt;
          metadata.nextEpisode = fill.nextEpisode;
          for (const field of ['firstAirDate', 'imdbId', 'episodeRuntime', 'episodeCount']) {
            if (!show[field] && fill[field] && !show.metadataOmissions?.includes(field)) metadata[field] = fill[field];
          }
          if (!show.episodeRuntime && !fill.episodeRuntime && !show.metadataOmissions?.includes('episodeRuntime')
              && !recentlyChecked(show.tmdbRuntimeCheckedAt, 30)) {
            const runtime = details.number_of_seasons >= 1 ? await averageEpisodeRuntime(id, seriesKey) : null;
            if (runtime) metadata.episodeRuntime = runtime;
            metadata.tmdbRuntimeCheckedAt = new Date().toISOString();
          }
        } else metadata.tmdbCheckedAt = new Date().toISOString();
      } catch (error) {
        if (error.status === 401 || error.status === 403) stopTmdb = true;
      }
    }
    if (ratingsKey && !stopRatings && (show.rtRating == null
        || (show.rtRating === '' && !recentlyChecked(show.rtCheckedAt, 30)))) {
      try {
        const ratings = await fetchSeriesRatings({ ...show, ...metadata }, ratingsKey);
        Object.assign(metadata, ratings);
      } catch (error) {
        if ([401, 403, 429].includes(error.status)) stopRatings = true;
      }
    }
    if (shows.includes(show) && JSON.stringify(show) === original && seriesKey === tmdbKey && ratingsKey === omdbKey
        && Object.keys(metadata).length) {
      Object.assign(show, metadata);
      changed = true;
    }
  });
  if (changed) {
    save(true);
    render();
  }
}

function scheduleMetadata(delay = 1000) {
  clearTimeout(metadataTimer);
  metadataTimer = setTimeout(() => {
    metadataQueue = metadataQueue.then(backfillBingeData).catch(console.warn);
  }, delay);
}

async function openTrailer(id, button) {
  if (!tmdbKey) {
    showInfoToast('Add a TMDB key to load trailers.');
    return;
  }
  button.disabled = true;
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const response = await tmdbFetch(`tv/${encodeURIComponent(id)}/videos`);
    if (!response.ok) throw new Error('Trailer request failed');
    const data = await response.json();
    const videos = (data.results || []).filter(video => video.site === 'YouTube' && /^[\w-]{11}$/.test(video.key));
    const trailer = videos.find(video => video.official && video.type === 'Trailer')
      || videos.find(video => video.type === 'Trailer')
      || videos.find(video => video.official && video.type === 'Teaser')
      || videos.find(video => video.type === 'Teaser');
    if (!trailer) {
      tab?.close();
      showInfoToast('No trailer is available for this series.');
      return;
    }
    const url = `https://www.youtube.com/watch?v=${trailer.key}`;
    if (tab && !tab.closed) tab.location.replace(url);
    else {
      const link = document.createElement('a');
      link.className = button.className;
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Play trailer';
      button.replaceWith(link);
    }
  } catch {
    tab?.close();
    showInfoToast('Could not load the trailer. Try again.');
  } finally {
    button.disabled = false;
  }
}
