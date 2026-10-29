/* Isolated regressions for BUGS.md. Uses the same optional Playwright setup as regression.cjs.
 * WATCHLIST_APP_ROOT can point at a pre-fix snapshot to verify reproductions.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WATCHLIST_PLAYWRIGHT_PATH || 'playwright');
const root = process.env.WATCHLIST_APP_ROOT || path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:8765/my-watchlist/';
const cases = [];
function test(name, run, storage = {}) {
  cases.push({ name, run, storage });
}
const film = {
  id: 'a',
  title: 'Alpha',
  year: '2020',
  category: 'Weekend',
  streaming: {},
  dateAdded: '2026-10-10T12:00:00Z',
};

test(
  '01 malformed stored JSON does not stop startup',
  () => typeof state !== 'undefined' && Array.isArray(state.movies),
  { watchlist_v2: '{broken' }
);
test('02 non-array stored lists do not stop startup', () => Array.isArray(state.movies), {
  watchlist_v2: '{}',
});
test(
  '03 null category settings do not stop startup',
  () => !!state.categorySettings && document.getElementById('headerCount').textContent === '1 film',
  { category_settings_v1: 'null' }
);
test('04 legacy cloud load updates inactive normal list', () => {
  state.christmasMode = true;
  _sbOnLoad([{ id: 'remote', title: 'Remote' }]);
  return getNormalList()[0].id === 'remote';
});
test('05 malformed cloud lists cannot replace valid data', () => {
  _sbOnLoad({ watchlist: { broken: true } });
  return Array.isArray(getNormalList()) && getNormalList()[0].id === 'a';
});
test('06 cloud hydration invalidates stale undo snapshots', () => {
  state.undoStack = [[{ id: 'old', title: 'Old' }]];
  state.redoStack = [[{ id: 'redo', title: 'Redo' }]];
  _sbOnLoad({ watchlist: [{ id: 'new', title: 'New' }] });
  return !state.undoStack.length && !state.redoStack.length;
});
test('07 local saves mark pending before cloud SDK is ready', () => {
  save();
  return localStorage.getItem('_sb_pending') === '1';
});
test('08 reserved category names appear in the category strip', () => {
  state.movies = [
    { id: 'a', title: 'A', category: '__proto__' },
    { id: 'b', title: 'B', category: 'constructor' },
  ];
  return getCategoryNames().length === 2;
});
test('09 reserved collection names sort by their actual anchor', () => {
  state.currentSort = 'year-asc';
  const a = { id: 'a', title: 'A', collection: '__proto__', year: '2020' },
    b = { id: 'b', title: 'B', year: '1990' };
  return sortWithCollections([a, b])[0].id === 'b';
});
test('10 detaching __proto__ does not change other categories', () => {
  toggleCategoryDetachedByName('__proto__');
  const ok =
    isDetachedMovie({ category: '__proto__' }) &&
    !isDetachedMovie({ category: 'unrelated' }) &&
    !Object.prototype.detached;
  delete Object.prototype.detached;
  return ok;
});
test('11 category view respects text and companion filters', () => {
  state.currentFilter = 'categories';
  state.currentCategory = 'Weekend';
  state.searchQuery = 'no match';
  render();
  if (document.querySelector('#movieGrid [data-id]')) return false;
  state.searchQuery = '';
  state.currentWatchWith = 'someone else';
  render();
  return !document.querySelector('#movieGrid [data-id]');
});
test('12 HTML cache is invalidated by keyed reconciliation', () => {
  const g = document.createElement('div');
  const a = '<div data-id="a" data-render-hash="a">A</div>';
  _setHTML(g, a);
  _reconcile(g, '<div data-id="b" data-render-hash="b">B</div>');
  _setHTML(g, a);
  return g.textContent === 'A';
});
test('13 returning from categories restores the previous grid', () => {
  render();
  state.currentFilter = 'categories';
  state.currentCategory = 'Weekend';
  render();
  state.currentFilter = 'all';
  render();
  return !!document.querySelector('#movieGrid .service-section');
});
test('14 changed cards also move to their new sorted position', () => {
  const g = document.createElement('div');
  g.innerHTML =
    '<div data-id="a" data-render-hash="1">A</div><div data-id="b" data-render-hash="1">B</div>';
  _reconcile(
    g,
    '<div data-id="b" data-render-hash="2">B2</div><div data-id="a" data-render-hash="2">A2</div>'
  );
  return [...g.children].map((x) => x.dataset.id).join(',') === 'b,a';
});
test('15 rerender preserves visible bulk selection', () => {
  enterSelectMode();
  toggleSelect('a');
  state.movies[0].title = 'Changed';
  render();
  return (
    document.getElementById('movieGrid').classList.contains('selection-mode') &&
    !!document.querySelector('#movieGrid [data-id="a"].card-selected')
  );
});
test('16 switching bulk service from VPN to cinema clears VPN', () => {
  enterSelectMode();
  toggleSelect('a');
  openBulkSubpanel('service');
  onBulkSvcPick(document.querySelector('[data-svc="netflix"]'));
  document.getElementById('bulkSvcVpn').checked = true;
  onBulkSvcPick(document.querySelector('[data-svc="cinema"]'));
  applyBulkService();
  return state.movies[0].streaming.cinema.direct && !state.movies[0].streaming.cinema.vpn;
});
test('17 bulk watched restores a graveyard film', () => {
  state.movies[0].graveyard = true;
  enterSelectMode();
  toggleSelect('a');
  bulkWatch();
  return state.movies[0].watched && !state.movies[0].graveyard;
});
test('18 bulk watching soon clears coming-to-cinemas status', () => {
  state.movies[0].streaming = { cinema: { coming: true } };
  enterSelectMode();
  toggleSelect('a');
  bulkWatchingSoon();
  return state.movies[0].watchingSoon && !state.movies[0].streaming.cinema.coming;
});
test('19 moving between lists does not create duplicate IDs', () => {
  setChristmasList([{ ...state.movies[0] }]);
  enterSelectMode();
  toggleSelect('a');
  bulkMoveToChristmas();
  if (getNormalList().length || getChristmasList().filter((x) => x.id === 'a').length !== 1)
    return false;
  setNormalList([{ ...getChristmasList()[0], notes: 'Keep my different notes' }]);
  enterSelectMode();
  toggleSelect('a');
  bulkMoveToChristmas();
  return (
    getChristmasList().length === 2 &&
    new Set(getChristmasList().map((x) => x.id)).size === 2 &&
    getChristmasList().some((x) => x.notes === 'Keep my different notes')
  );
});
test('20 adding a film invalidates a previous redo branch', () => {
  state.redoStack = [[{ id: 'old', title: 'Old' }]];
  openAddModal();
  document.getElementById('fTitle').value = 'New';
  saveMovie();
  return state.redoStack.length === 0;
});
test('21 release date can be cleared when editing', () => {
  state.movies[0].releaseDate = '2020-01-01';
  openEditModal('a');
  document.getElementById('fReleaseDate').value = '';
  saveMovie();
  return !state.movies[0].releaseDate;
});
test('22 marking graveyard film watched in edit restores it', () => {
  state.movies[0].graveyard = true;
  openEditModal('a');
  document.getElementById('fWatched').checked = true;
  saveMovie();
  return state.movies[0].watched && !state.movies[0].graveyard;
});
test('23 negative runtimes are rejected', () => {
  openEditModal('a');
  document.getElementById('fRuntime').value = '-90';
  saveMovie();
  return !(state.movies[0].runtime < 0);
});
test('24 typing a new query immediately invalidates the old request', async () => {
  openAddModal();
  document.getElementById('searchInput').value = 'Old';
  let done;
  window.fetch = () => new Promise((r) => (done = r));
  const p = searchTMDB('Old');
  document.getElementById('searchInput').value = 'New';
  onSearchInput('New');
  clearTimeout(state.searchTimer);
  done({ ok: true, json: async () => ({ results: [{ id: 1, title: 'Old result' }] }) });
  await p;
  return !document.getElementById('searchResults').textContent.includes('Old result');
});
test('25 latest film selection wins over slower earlier details', async () => {
  openAddModal();
  const pending = {};
  window.fetch = (url) =>
    new Promise((r) => {
      pending[url.includes('/1?') ? 'one' : url.includes('/2?') ? 'two' : 'credits' + url] = r;
    });
  const p1 = selectMovie(1),
    p2 = selectMovie(2);
  for (const [k, r] of Object.entries(pending))
    if (k.startsWith('credits')) r({ ok: true, json: async () => ({ crew: [] }) });
  pending.two({ ok: true, json: async () => ({ title: 'New', release_date: '2020-01-01' }) });
  await p2;
  pending.one({ ok: true, json: async () => ({ title: 'Old', release_date: '2020-01-01' }) });
  await p1;
  return document.getElementById('fTitle').value === 'New' && state._pendingTmdbId === 2;
});
test('26 closing a form invalidates details from that session', async () => {
  openAddModal();
  let resolve;
  window.fetch = (url) =>
    url.includes('credits')
      ? Promise.resolve({ ok: true, json: async () => ({ crew: [] }) })
      : new Promise((r) => (resolve = r));
  const pending = selectMovie(1);
  closeAddModal();
  openAddModal();
  document.getElementById('fTitle').value = 'My manual film';
  resolve({ ok: true, json: async () => ({ title: 'Stale result' }) });
  await pending;
  return document.getElementById('fTitle').value === 'My manual film' && !state._pendingTmdbId;
});
test('27 invalid diary dates do not leave import permanently busy', async () => {
  openImportModal();
  state._importRows = [{ Name: 'Diary film', Year: '2020', 'Watched Date': 'invalid' }];
  try {
    await runLetterboxdImport();
  } catch {}
  return !state._importActive && state.movies.some((x) => x.title === 'Diary film');
});
test('28 CSV parser preserves quoted multiline titles', () => {
  const rows = _parseLetterboxdCSV('Name,Year,Watched Date\r\n"Two\nLines",2020,2020-01-01\r\n');
  return rows.length === 1 && rows[0].Name === 'Two\nLines' && rows[0].Year === '2020';
});
test('29 diary import preserves fetched release dates', async () => {
  openImportModal();
  state._importRows = [{ Name: 'Diary film', Year: '2020', 'Watched Date': '2020-01-01' }];
  _tmdbSearchForImport = async () => ({ id: 123 });
  _tmdbDetailsForImport = async () => ({
    d: { title: 'Diary film', release_date: '2020-05-06' },
    c: null,
  });
  await runLetterboxdImport();
  return state.movies.find((x) => x.tmdbId === 123).releaseDate === '2020-05-06';
});
test('30 hidden categorise panel cannot intercept global undo', () => {
  openImportModal();
  renderImportCategorise();
  state._lastCategoriseAction = { id: 'a', streaming: {}, otherName: '' };
  closeImportModal();
  state.movies[0].streaming = { netflix: { direct: true } };
  document.activeElement.blur();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  return !!state.movies[0].streaming.netflix?.direct;
});
test('31 going back from paste review preserves typed titles', async () => {
  openPasteImportModal();
  document.getElementById('pasteTitlesInput').value = 'My Film\nOther Film';
  _startPasteSearch();
  while (state._pasteSearchActive) await new Promise((r) => setTimeout(r, 20));
  _renderPasteStep1();
  return document.getElementById('pasteTitlesInput').value === 'My Film\nOther Film';
});
test('32 late paste alternative searches cannot edit a new session', async () => {
  openPasteImportModal();
  state.tmdbKey = 'test';
  state._pasteItems = [
    {
      inputTitle: 'Old',
      results: [{ id: 1, title: 'Old' }],
      selectedIdx: 0,
      removed: false,
      showingAlts: true,
    },
  ];
  state._openAltsIdx = 0;
  _renderPasteReview();
  document.getElementById('pasteAltSearch-0').value = 'search';
  let resolve;
  window.fetch = () => new Promise((r) => (resolve = r));
  const pending = _pasteCustomSearch(0);
  closePasteImportModal();
  openPasteImportModal();
  state._pasteItems = [{ inputTitle: 'New', results: [{ id: 2, title: 'New' }], selectedIdx: 0 }];
  resolve({ ok: true, json: async () => ({ results: [{ id: 3, title: 'Stale' }] }) });
  await pending;
  return state._pasteItems[0].results[0].id === 2;
});
test('33 invalid RT checked timestamps remain retryable', () =>
  rtNeedsFill({ rtRating: '', rtCheckedAt: 'broken' }));
test('34 runtime backfill persists the original list after mode switch', async () => {
  state.tmdbKey = 'test';
  state.movies[0].tmdbId = 1;
  let resolve;
  window.fetch = () => new Promise((r) => (resolve = r));
  const pending = backfillRuntimes();
  state.christmasMode = true;
  resolve({ ok: true, json: async () => ({ runtime: 120 }) });
  await pending;
  return JSON.parse(localStorage.getItem('watchlist_v2'))[0].runtime === 120;
});
test('35 RT backfill persists the original list after mode switch', async () => {
  state.omdbKey = 'test';
  let resolve;
  fetchRtRating = () => new Promise((r) => (resolve = r));
  const pending = backfillRtRatings();
  state.christmasMode = true;
  resolve({ rtRating: '80%', imdbId: null });
  await pending;
  return JSON.parse(localStorage.getItem('watchlist_v2'))[0].rtRating === '80%';
});
test('36 invalid movie dates do not crash render', () => {
  state.movies[0].dateAdded = 'invalid';
  state.currentView = 'list';
  render();
  return (
    document.querySelector('#movieGrid [data-id="a"] .list-date').textContent === 'Added: unknown'
  );
});
test('37 list rows show a score even without other metadata', () => {
  const g = document.createElement('div');
  g.innerHTML = buildListRow({ id: 'r', title: 'Rating only', rating: '8/10', streaming: {} }, 0);
  return g.textContent.includes('8/10');
});
test('38 mobile and desktop search fields stay synchronized', () => {
  document.getElementById('mobileSearchBarInput').value = 'Alpha';
  _msbInput('Alpha');
  if (document.getElementById('searchBar').value !== 'Alpha') return false;
  document.getElementById('searchBar').value = 'Beta';
  onSearchBarInput('Beta');
  return document.getElementById('mobileSearchBarInput').value === 'Beta';
});
test('39 switching lists clears bulk selection and companion filters', () => {
  enterSelectMode();
  toggleSelect('a');
  state.currentWatchWith = 'Someone';
  toggleChristmasMode();
  return !state.selectionMode && !state.selectedIds.size && !state.currentWatchWith;
});
test('40 opening an already open modal does not leak scroll locks', () => {
  openAddModal();
  openAddModal();
  closeAddModal();
  return state._scrollLockCount === 0 && !document.body.classList.contains('modal-open');
});

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.WATCHLIST_BROWSER ||
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  let failed = 0;
  try {
    for (const { name, run, storage } of cases) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: 'Australia/Melbourne',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(base)) {
          const file = path.join(
            root,
            new URL(url).pathname.slice('/my-watchlist/'.length) || 'index.html'
          );
          if (fs.existsSync(file))
            return route.fulfill({
              body: fs.readFileSync(file),
              contentType: file.endsWith('.js')
                ? 'text/javascript'
                : file.endsWith('.css')
                  ? 'text/css'
                  : 'text/html',
            });
        }
        return route.abort();
      });
      await page.addInitScript(
        (seed) => {
          for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        },
        { watchlist_v2: JSON.stringify([film]), christmas_watchlist_v1: '[]', ...storage }
      );
      try {
        await page.goto(base);
        await page.waitForLoadState('load');
        const result = await page.evaluate(run);
        assert.equal(result, true, errors.join('; ') || 'Behavior did not match expectation');
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch (e) {
        failed++;
        console.log('FAIL ' + name + ' — ' + e.message.split('\n').slice(0, 3).join(' '));
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`${cases.length - failed}/${cases.length} regressions passed`);
  if (failed) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
