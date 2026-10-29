/* Isolated form/API regressions. No user profile, live API, or cloud calls.
 * WATCHLIST_APP_ROOT optionally points at a pre-fix app snapshot.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WATCHLIST_PLAYWRIGHT_PATH || 'playwright');
const root = process.env.WATCHLIST_APP_ROOT || path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:8765/my-watchlist/';
const cases = [];
const test = (name, run) => cases.push({ name, run });

test('selection cancels a pending search debounce', async () => {
  openAddModal();
  state._preloadId = 2;
  state._preloadPromise = Promise.resolve({ id: 2, d: { title: 'Selected' }, c: null });
  document.getElementById('searchInput').value = 'Selected';
  onSearchInput('Selected');
  state._preloadId = 2;
  state._preloadPromise = Promise.resolve({ id: 2, d: { title: 'Selected' }, c: null });
  let calls = 0;
  window.fetch = async () => { calls++; throw new Error('Unexpected delayed request'); };
  await selectMovie(2);
  await new Promise((resolve) => setTimeout(resolve, 450));
  return calls === 0 && !document.getElementById('searchSpinner').classList.contains('active');
});

test('selection invalidates an in-flight search response', async () => {
  openAddModal();
  let resolveBody;
  window.fetch = async () => ({ ok: true, json: () => new Promise((resolve) => { resolveBody = resolve; }) });
  document.getElementById('searchInput').value = 'Old query';
  const pending = searchTMDB('Old query');
  await Promise.resolve();
  await Promise.resolve();
  state._preloadId = 2;
  state._preloadPromise = Promise.resolve({ id: 2, d: { title: 'Selected' }, c: null });
  await selectMovie(2);
  resolveBody({ results: [{ id: 1, title: 'Obsolete result' }] });
  await pending;
  return !document.getElementById('searchResults').classList.contains('open');
});

test('typing a new query invalidates older movie details', async () => {
  openAddModal();
  let resolveDetails;
  window.fetch = async (url) => url.includes('/credits')
    ? { ok: true, json: async () => ({ crew: [] }) }
    : new Promise((resolve) => { resolveDetails = resolve; });
  const selection = selectMovie(1);
  document.getElementById('searchInput').value = 'New query';
  onSearchInput('New query');
  clearTimeout(state.searchTimer);
  resolveDetails({ ok: true, json: async () => ({ title: 'Obsolete selected film' }) });
  await selection;
  return document.getElementById('searchInput').value === 'New query' && document.getElementById('fTitle').value === '';
});

test('optional alias failure preserves normal search results', async () => {
  openAddModal();
  document.getElementById('searchInput').value = 'wall e';
  window.fetch = async (url) => {
    if (url.includes('/movie/10681')) throw new Error('Alias request offline');
    return { ok: true, json: async () => ({ results: [{ id: 3, title: 'Usable result' }] }) };
  };
  await searchTMDB('wall e');
  return document.getElementById('searchResults').textContent.includes('Usable result');
});

test('optional credits failure preserves selected movie details', async () => {
  openAddModal();
  window.fetch = async (url) => {
    if (url.includes('/credits')) throw new Error('Credits offline');
    return { ok: true, json: async () => ({ title: 'Usable details', runtime: 95 }) };
  };
  await selectMovie(4);
  return document.getElementById('fTitle').value === 'Usable details' && state._pendingTmdbId === 4;
});

test('optional credits failure preserves movie preloading', async () => {
  window.fetch = async (url) => {
    if (url.includes('/credits')) throw new Error('Credits offline');
    return { ok: true, json: async () => ({ title: 'Preloaded details' }) };
  };
  preloadMovie(4);
  const cached = await state._preloadPromise;
  return cached?.d.title === 'Preloaded details' && cached.c === null;
});

test('TMDB external-ID failure still allows OMDb title lookup', async () => {
  state.tmdbKey = 'fixture';
  state.omdbKey = 'fixture';
  let omdbQuery = '';
  window.fetch = async (url) => {
    if (url.includes('/external_ids')) throw new Error('TMDB offline');
    omdbQuery = url;
    return { ok: true, json: async () => ({ Response: 'True', imdbID: 'tt123', Ratings: [{ Source: 'Rotten Tomatoes', Value: '91%' }] }) };
  };
  try {
    const rating = await fetchRtRating({ title: 'Alpha', year: '2020', tmdbId: 1 });
    return rating.rtRating === '91%' && omdbQuery.includes('t=Alpha') && omdbQuery.includes('y=2020');
  } catch { return false; }
});

test('selecting another movie replaces the automatically filled synopsis', async () => {
  openAddModal();
  for (const id of [1, 2]) {
    state._preloadId = id;
    state._preloadPromise = Promise.resolve({ id, d: { title: `Film ${id}`, overview: `Synopsis ${id}` }, c: null });
    await selectMovie(id);
  }
  if (document.getElementById('fNotes').value !== 'Synopsis 2') return false;
  document.getElementById('fNotes').value = 'My own review';
  state._preloadId = 3;
  state._preloadPromise = Promise.resolve({ id: 3, d: { title: 'Film 3', overview: 'Synopsis 3' }, c: null });
  await selectMovie(3);
  return document.getElementById('fNotes').value === 'My own review';
});

test('edit form uses the newly selected movie for its Letterboxd link', async () => {
  state.movies[0].tmdbId = 1;
  openEditModal('a');
  state._preloadId = 2;
  state._preloadPromise = Promise.resolve({ id: 2, d: { title: 'Replacement' }, c: null });
  await selectMovie(2);
  return document.getElementById('modalLetterboxd').href === 'https://letterboxd.com/tmdb/2/';
});

test('saving Watching Soon removes conflicting coming-to-cinemas status', () => {
  state.movies[0].streaming = { cinema: { coming: true } };
  openEditModal('a');
  document.getElementById('fWatchingSoon').checked = true;
  saveMovie();
  return state.movies[0].watchingSoon && !state.movies[0].streaming.cinema.coming;
});

test('opening Surprise Me twice does not leave the page scroll locked', () => {
  openSurpriseModal();
  openSurpriseModal();
  closeSurpriseModal();
  return state._scrollLockCount === 0 && !document.body.classList.contains('modal-open');
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.WATCHLIST_BROWSER || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true });
  let failed = 0;
  try {
    for (const { name, run } of cases) {
      const context = await browser.newContext({ timezoneId: 'Australia/Melbourne' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith(base)) {
          const file = path.join(root, new URL(url).pathname.slice('/my-watchlist/'.length) || 'index.html');
          if (fs.existsSync(file)) return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
        }
        return route.abort();
      });
      await page.addInitScript(() => {
        localStorage.setItem('watchlist_v2', JSON.stringify([{ id: 'a', title: 'Alpha', streaming: {}, dateAdded: '2026-10-10T12:00:00Z' }]));
        localStorage.setItem('christmas_watchlist_v1', '[]');
      });
      try {
        await page.goto(base);
        const result = await page.evaluate(run);
        assert.equal(result, true, 'Behavior did not match expectation');
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch (error) {
        failed++;
        console.log('FAIL ' + name + ' — ' + error.message.split('\n').slice(0, 3).join(' '));
      }
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(`${cases.length - failed}/${cases.length} regressions passed`);
  if (failed) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
