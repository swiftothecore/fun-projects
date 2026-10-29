// TMDB search/details, OMDb scores, API settings, and background metadata fills.
// Classic scripts intentionally expose handler functions to inline HTML events.

function updateBanner() {
  document.getElementById('apiBanner').classList.toggle('hidden', !!state.tmdbKey);
}

function updateSearchSection() {
  const h = !!state.tmdbKey;
  document.getElementById('searchOrNotice').style.display = h ? 'block' : 'none';
  document.getElementById('noApiNotice').style.display = h ? 'none' : 'block';
}

function saveApiKey() {
  const v = document.getElementById('apiKeyInput').value.trim();
  if (!v) return;
  state.tmdbKey = v;
  writeStorage('tmdb_api_key', state.tmdbKey);
  updateBanner();
  updateSearchSection();
  scheduleBackfills(500);
}

function saveOmdbKey() {
  const v = document.getElementById('omdbKeyInput').value.trim();
  if (!v) return;
  state.omdbKey = v;
  writeStorage('omdb_api_key', state.omdbKey);
  document.getElementById('apiBanner').classList.toggle('hidden', !!state.tmdbKey);
  scheduleBackfills(300, [backfillRtRatings]);
}

function showApiSettings() {
  const banner = document.getElementById('apiBanner');
  if (!banner.classList.contains('hidden')) {
    banner.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  document.getElementById('apiKeyInput').value = state.tmdbKey;
  document.getElementById('omdbKeyInput').value = state.omdbKey;
  document.getElementById('apiKeyInput').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onSearchKeyDown(e) {
  const r = document.getElementById('searchResults');
  if (!r.classList.contains('open')) return;
  const items = r.querySelectorAll('.search-result-item[data-movie-id]');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.searchHighlightIndex = Math.min(state.searchHighlightIndex + 1, items.length - 1);
    updateSearchHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.searchHighlightIndex = Math.max(state.searchHighlightIndex - 1, -1);
    updateSearchHighlight(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    const idx = state.searchHighlightIndex >= 0 ? state.searchHighlightIndex : 0;
    if (items[idx]) selectMovie(parseInt(items[idx].dataset.movieId));
  }
}

function updateSearchHighlight(items) {
  items.forEach((el, i) => {
    el.classList.toggle('keyboard-active', i === state.searchHighlightIndex);
    if (i === state.searchHighlightIndex) {
      el.scrollIntoView({ block: 'nearest' });
      preloadMovie(parseInt(el.dataset.movieId));
    }
  });
}

function onSearchInput(val) {
  clearTimeout(state.searchTimer);
  state._preloadId = null;
  state._preloadPromise = null;
  const r = document.getElementById('searchResults'),
    h = document.getElementById('searchHint');
  if (!val.trim()) {
    state._searchSeq++;
    r.classList.remove('open');
    h.classList.remove('visible');
    document.getElementById('searchSpinner').classList.remove('active');
    state.searchHighlightIndex = -1;
    return;
  }
  document.getElementById('searchSpinner').classList.add('active');
  state.searchTimer = setTimeout(() => searchTMDB(val.trim()), 400);
}

async function searchTMDB(q) {
  const sp = document.getElementById('searchSpinner'),
    r = document.getElementById('searchResults');
  // Drop responses that arrive after a newer search has started
  const seq = ++state._searchSeq;
  // TMDB's search tokeniser treats hyphens as separators and some titles use
  // a middle-dot (e.g. WALL·E) rather than a hyphen, so normalise to a space
  // before querying — otherwise hyphenated queries return irrelevant results.
  const normalisedQ = q
    .replace(/[-\u2010-\u2015]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Alias lookup: route known-broken queries directly to a movie ID. Try both
  // the normalised form ("wall e") and a fully-stripped form ("walle").
  const aliasKey = normalisedQ.toLowerCase();
  const aliasKeyStripped = aliasKey.replace(/\s+/g, '');
  const aliasId = TMDB_SEARCH_ALIASES[aliasKey] || TMDB_SEARCH_ALIASES[aliasKeyStripped] || null;
  try {
    const fetches = [
      fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(state.tmdbKey)}&query=${encodeURIComponent(normalisedQ)}&include_adult=false`
      ),
    ];
    if (aliasId)
      fetches.push(
        fetch(
          `https://api.themoviedb.org/3/movie/${aliasId}?api_key=${encodeURIComponent(state.tmdbKey)}`
        )
      );
    const [res, aliasRes] = await Promise.all(fetches);
    if (seq !== state._searchSeq || !document.getElementById('searchInput').value.trim()) return;
    if (!res.ok) {
      r.innerHTML =
        res.status === 401
          ? `<div class="search-no-results">Invalid API key. <a class="text-gold" href="#" onclick="showApiSettings();return false;">Update it here.</a></div>`
          : `<div class="search-no-results">Search failed (${res.status}).</div>`;
      r.classList.add('open');
      sp.classList.remove('active');
      return;
    }
    const d = await res.json();
    let results = d.results || [];
    // Prepend the aliased movie if the fetch succeeded — dedupe if it also
    // happened to come back in the regular search results.
    if (aliasRes && aliasRes.ok) {
      const aliasMovie = await aliasRes.json();
      results = [aliasMovie, ...results.filter((m) => m.id !== aliasMovie.id)];
    }
    if (seq !== state._searchSeq) return;
    sp.classList.remove('active');
    if (!results.length) {
      r.innerHTML = `<div class="search-no-results">No results for "${esc(q)}"</div>`;
      r.classList.add('open');
      return;
    }
    r.innerHTML = results
      .slice(0, 8)
      .map((m) => {
        const yr = m.release_date ? m.release_date.slice(0, 4) : '?';
        const th = m.poster_path
          ? `<img class="result-thumb" src="${TMDB_SM}${esc(m.poster_path)}" alt="" loading="lazy">`
          : `<div class="result-thumb-placeholder">&#127917;</div>`;
        const ov = m.overview ? `<div class="result-overview">${esc(m.overview)}</div>` : '';
        const pool = _allMoviesPool();
        const inList = pool.some(
          (x) =>
            (x.tmdbId && x.tmdbId === m.id) ||
            (x.title.toLowerCase() === m.title.toLowerCase() && x.year == yr)
        );
        const alreadyCls = inList ? ' already-added' : '';
        const inListBadge = inList ? `<div class="result-in-list">&#10003; In your list</div>` : '';
        return `<div class="search-result-item${alreadyCls}" data-movie-id="${esc(m.id)}" onclick="selectMovie(${jsAttr(m.id)})" onmouseenter="preloadMovie(${jsAttr(m.id)})">${th}<div class="result-info"><div class="result-title">${esc(m.title)}</div><div class="result-meta">${esc(yr)}${m.vote_average ? ' &middot; &#9733; ' + m.vote_average.toFixed(1) : ''}</div>${ov}${inListBadge}</div></div>`;
      })
      .join('');
    state.searchHighlightIndex = -1;
    r.classList.add('open');
    if (results.length) preloadMovie(results[0].id);
  } catch {
    if (seq !== state._searchSeq) return;
    sp.classList.remove('active');
    r.innerHTML = `<div class="search-no-results">Search failed.</div>`;
    r.classList.add('open');
  }
}

function preloadMovie(id) {
  if (state._preloadId === id) return; // already preloading/preloaded this one
  state._preloadId = id;
  state._preloadPromise = (async () => {
    try {
      const [dr, cr] = await Promise.all([
        fetch(
          `https://api.themoviedb.org/3/movie/${id}?api_key=${encodeURIComponent(state.tmdbKey)}`
        ),
        fetch(
          `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${encodeURIComponent(state.tmdbKey)}`
        ),
      ]);
      if (!dr.ok) return null;
      const d = await dr.json(),
        c = cr.ok ? await cr.json() : null;
      return { id, d, c };
    } catch {
      return null;
    }
  })();
}

async function selectMovie(id) {
  const r = document.getElementById('searchResults'),
    h = document.getElementById('searchHint');
  r.classList.remove('open');
  // Hide the details section immediately so fTitle is not focusable during the fetch
  document.getElementById('movieDetailsCollapsible').classList.add('collapsed');

  let d, c;
  // Use preloaded data if available (may still be in-flight — awaiting is still faster than a cold fetch)
  if (state._preloadId === id && state._preloadPromise) {
    const cached = await state._preloadPromise;
    state._preloadId = null;
    state._preloadPromise = null;
    if (cached && cached.id === id) {
      d = cached.d;
      c = cached.c;
    }
  }

  if (!d) {
    // Fallback: fresh fetch (e.g. direct click on a result that was never preloaded)
    document.getElementById('searchSpinner').classList.add('active');
    try {
      const [dr, cr] = await Promise.all([
        fetch(
          `https://api.themoviedb.org/3/movie/${id}?api_key=${encodeURIComponent(state.tmdbKey)}`
        ),
        fetch(
          `https://api.themoviedb.org/3/movie/${id}/credits?api_key=${encodeURIComponent(state.tmdbKey)}`
        ),
      ]);
      if (!dr.ok) throw new Error('TMDB ' + dr.status);
      d = await dr.json();
      c = cr.ok ? await cr.json() : null;
    } catch {
      document.getElementById('searchSpinner').classList.remove('active');
      h.textContent = 'Could not load details. Fill in manually.';
      h.classList.add('visible');
      expandMovieDetails();
      return;
    }
    document.getElementById('searchSpinner').classList.remove('active');
  }

  document.getElementById('fTitle').value = d.title || '';
  document.getElementById('fYear').value = d.release_date ? d.release_date.slice(0, 4) : '';
  document.getElementById('fReleaseDate').value = d.release_date || '';
  document.getElementById('fGenre').value = d.genres ? d.genres.map((g) => g.name).join(', ') : '';
  const dir = c ? (c.crew || []).find((x) => x.job === 'Director') : null;
  document.getElementById('fDirector').value = dir ? dir.name : '';
  document.getElementById('fRating').value = d.vote_average
    ? d.vote_average.toFixed(1) + '/10'
    : '';
  document.getElementById('fRuntime').value = d.runtime || '';
  const p = d.poster_path ? TMDB_IMG + d.poster_path : '';
  document.getElementById('fPoster').value = p;
  updatePosterPreview(p);
  if (!document.getElementById('fNotes').value)
    document.getElementById('fNotes').value = d.overview || '';
  document.getElementById('searchInput').value = '';
  state._pendingTmdbId = id;
  state._pendingReleaseDate = d.release_date || null;
  h.textContent = `Filled from TMDB: "${d.title}". Edit details below.`;
  h.classList.add('visible');
  updateModalJustWatch();
  updateModalLetterboxd();
  // Remove focus from the search input after selection
  document.getElementById('searchInput').blur();
  // Populate the collapsed banner directly from the TMDB response so year/genre
  // are guaranteed to show regardless of whether the form fields are accessible.
  const _yr = d.release_date ? d.release_date.slice(0, 4) : '';
  const _genres = d.genres ? d.genres.map((g) => g.name).join(', ') : '';
  document.getElementById('collapsedTitleText').textContent = d.title || 'Untitled';
  document.getElementById('collapsedTitleMeta').textContent = [_yr, _genres]
    .filter(Boolean)
    .join(' · ');
  document.getElementById('movieDetailsCollapsible').classList.add('collapsed');
  document.getElementById('collapsedTitleBanner').style.display = 'flex';
  document.getElementById('showMovieDetailsBtn').style.display = 'none';
  document.getElementById('collectionFields').style.marginTop = '0';
}

async function backfillRuntimes() {
  if (!state.tmdbKey) return;
  const needsFill = state.movies.filter((m) => m.runtime === undefined || m.runtime === null);
  if (!needsFill.length) return;
  let changed = false;
  for (const m of needsFill) {
    try {
      // HTTP failures (rate limit, bad key) throw so the film is retried on the
      // next backfill instead of being permanently stamped with runtime 0.
      let runtime = 0;
      if (m.tmdbId) {
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${m.tmdbId}?api_key=${encodeURIComponent(state.tmdbKey)}`
        );
        if (!res.ok) throw new Error('TMDB ' + res.status);
        const d = await res.json();
        runtime = d.runtime || 0;
      } else if (m.title) {
        const q = encodeURIComponent(
          m.title
            .replace(/[-\u2010-\u2015]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        );
        const yr = m.year ? `&year=${m.year}` : '';
        const res = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(state.tmdbKey)}&query=${q}${yr}&include_adult=false`
        );
        if (!res.ok) throw new Error('TMDB ' + res.status);
        const d = await res.json();
        if (d.results && d.results.length) {
          const best = d.results[0];
          const dr = await fetch(
            `https://api.themoviedb.org/3/movie/${best.id}?api_key=${encodeURIComponent(state.tmdbKey)}`
          );
          if (!dr.ok) throw new Error('TMDB ' + dr.status);
          const dd = await dr.json();
          runtime = dd.runtime || 0;
          if (!m.tmdbId) m.tmdbId = best.id;
        }
      }
      m.runtime = runtime;
      changed = true;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 150));
  }
  if (changed) {
    save();
    render();
  }
}

function rtNeedsFill(m) {
  if (m.rtRating === undefined || m.rtRating === null) return true;
  if (m.rtRating !== '') return false;
  return !m.rtCheckedAt || Date.now() - new Date(m.rtCheckedAt) > RT_RECHECK_DAYS * 86400000;
}

async function fetchRtRating(m) {
  let imdbId = m.imdbId || null;
  if (!imdbId && m.tmdbId && state.tmdbKey) {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${encodeURIComponent(m.tmdbId)}/external_ids?api_key=${encodeURIComponent(state.tmdbKey)}`
    );
    if (res.ok) {
      const d = await res.json();
      imdbId = d.imdb_id || null;
    }
  }
  const q = imdbId
    ? `i=${encodeURIComponent(imdbId)}`
    : `t=${encodeURIComponent(m.title)}&type=movie${m.year ? `&y=${encodeURIComponent(m.year)}` : ''}`;
  const res = await fetch(
    `https://www.omdbapi.com/?${q}&apikey=${encodeURIComponent(state.omdbKey)}`
  );
  if (!res.ok) throw new Error('OMDb ' + res.status);
  const d = await res.json();
  // Invalid key / daily limit hit — stop rather than marking films as "no score"
  if (d.Response === 'False' && /key|limit/i.test(d.Error || ''))
    throw Object.assign(new Error(d.Error), { fatal: true });
  const rt = (d.Ratings || []).find((r) => r.Source === 'Rotten Tomatoes');
  return {
    rtRating: rt ? rt.Value : '',
    imdbId: imdbId || (d.imdbID && d.imdbID.startsWith('tt') ? d.imdbID : null),
  };
}

async function backfillRtRatings() {
  if (!state.omdbKey || state._rtBackfillRunning) return;
  state._rtBackfillRunning = true;
  const list = state.movies;
  let changed = false;
  try {
    for (const m of list.filter(rtNeedsFill)) {
      if (!m.title) continue;
      try {
        const r = await fetchRtRating(m);
        m.rtRating = r.rtRating;
        m.rtCheckedAt = new Date().toISOString();
        if (r.imdbId && !m.imdbId) m.imdbId = r.imdbId;
        changed = true;
      } catch (e) {
        if (e.fatal) {
          console.warn('RT backfill stopped:', e.message);
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  } finally {
    state._rtBackfillRunning = false;
    if (changed && list === state.movies) {
      save();
      render();
    }
  }
}

async function backfillReleaseDates() {}

// ── Trailer button: fetch TMDB videos and open the best YouTube match ─────
async function openTrailer(tmdbId, btnEl) {
  if (!tmdbId) return;
  if (!state.tmdbKey) {
    showInfoToast('TMDB API key required to load trailers.', 3000);
    return;
  }
  const original = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.innerHTML = '<span class="trailer-loading"></span>Loading…';
    btnEl.disabled = true;
  }
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${encodeURIComponent(state.tmdbKey)}`
    );
    if (!res.ok) throw new Error('TMDB videos request failed');
    const data = await res.json();
    const yt = (data.results || []).filter((v) => v.site === 'YouTube');
    if (!yt.length) {
      showInfoToast('No trailers available on TMDB for this film.', 3000);
      return;
    }
    // Selection order: official Trailer > any Trailer > official Teaser > any Teaser > anything
    const pick =
      yt.find((v) => v.type === 'Trailer' && v.official) ||
      yt.find((v) => v.type === 'Trailer') ||
      yt.find((v) => v.type === 'Teaser' && v.official) ||
      yt.find((v) => v.type === 'Teaser') ||
      yt[0];
    window.open(
      `https://www.youtube.com/watch?v=${encodeURIComponent(pick.key)}`,
      '_blank',
      'noopener'
    );
  } catch (err) {
    showInfoToast('Could not load trailer. Check your connection.', 3000);
  } finally {
    if (btnEl) {
      btnEl.innerHTML = original;
      btnEl.disabled = false;
    }
  }
}

// Run after the first render, and serialize jobs across startup, key entry,
// remote hydration, and film saves. Backfill functions keep their retry guards.
function scheduleBackfills(
  delay = 1000,
  tasks = [backfillRuntimes, backfillReleaseDates, backfillRtRatings]
) {
  setTimeout(() => {
    state.backfillQueue = state.backfillQueue
      .then(async () => {
        for (const task of tasks) await task();
      })
      .catch((error) => console.warn('[Backfill] Metadata update failed:', error));
  }, delay);
}
