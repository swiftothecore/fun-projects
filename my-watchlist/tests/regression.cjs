/* Run with an existing Playwright installation; the app itself has no dependencies.
 * WATCHLIST_PLAYWRIGHT_PATH=/absolute/path/to/playwright node my-watchlist/tests/regression.cjs
 * Optional: WATCHLIST_BASELINE_HTML or WATCHLIST_REFERENCE_DIR, plus WATCHLIST_SCREENSHOTS.
 * Set WATCHLIST_COMPUTED=1 for geometry/style snapshots; WATCHLIST_SKIP_VISUAL=1 skips images.
 * WATCHLIST_LIVE_SERVER=1 tests real static HTTP responses at the base URL below.
 * Optional: WATCHLIST_SUPABASE_SDK for tests against the real pinned UMD SDK.
 * All browser storage and API/cloud responses are isolated test fixtures.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WATCHLIST_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:8765/my-watchlist/';
const out = process.env.WATCHLIST_SCREENSHOTS || '/tmp/watchlist-refactor/screenshots';
const fixtures = [
  {
    id: 'one',
    title: 'First Film',
    year: '2024',
    genre: 'Drama, Adventure',
    director: 'A Director',
    runtime: 120,
    notes: 'A film to watch.',
    category: 'Weekend',
    collection: 'Series',
    streaming: { netflix: { direct: true } },
    dateAdded: '2026-10-10T12:00:00Z',
    tmdbId: 11,
  },
  {
    id: 'two',
    title: 'Second Film',
    year: '2025',
    genre: 'Comedy',
    runtime: 90,
    category: 'Weekend',
    collection: 'Series',
    streaming: { netflix: { vpn: true, vpnCountry: 'United States' } },
    dateAdded: '2026-10-11T12:00:00Z',
  },
  {
    id: 'three',
    title: 'Coming Soon',
    year: '2026',
    genre: 'Action',
    runtime: 110,
    streaming: { cinema: { coming: true } },
    releaseDate: '2026-12-20',
    dateAdded: '2026-10-12T12:00:00Z',
  },
  {
    id: 'four',
    title: 'Watching Soon',
    year: '2023',
    runtime: 100,
    watchingSoon: true,
    streaming: {},
    dateAdded: '2026-10-13T12:00:00Z',
  },
  {
    id: 'five',
    title: 'Watched Film',
    year: '2022',
    runtime: 80,
    watched: true,
    rewatch: true,
    rewatchingSoon: true,
    streaming: { disney: { direct: true } },
    dateAdded: '2026-10-14T12:00:00Z',
    dateWatched: '2026-10-15T12:00:00Z',
  },
  {
    id: 'six',
    title: 'Other Film',
    year: '2020',
    runtime: 140,
    streaming: {},
    watchWith: 'Movie Club',
    dateAdded: '2026-09-01T12:00:00Z',
  },
];
const christmas = [
  {
    id: 'xmas',
    title: 'Christmas Film',
    year: '2020',
    runtime: 90,
    streaming: {},
    dateAdded: '2026-10-01T12:00:00Z',
  },
];
let browser;
async function makePage({ width = 1440, html, storage = {}, sdk = false, assetRoot = root } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    timezoneId: 'Australia/Melbourne',
  });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('unpkg.com'))
      return route.fulfill({
        contentType: 'text/javascript',
        body: sdk ? fs.readFileSync(process.env.WATCHLIST_SUPABASE_SDK, 'utf8') : '',
      });
    if (url.startsWith(base)) {
      if (process.env.WATCHLIST_LIVE_SERVER) return route.continue();
      if (url === base || url === base + 'index.html')
        return route.fulfill({
          contentType: 'text/html',
          body: html || fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
        });
      const asset = path.join(assetRoot, new URL(url).pathname.split('/my-watchlist/')[1]);
      if (fs.existsSync(asset) && fs.statSync(asset).isFile())
        return route.fulfill({
          contentType: asset.endsWith('.css')
            ? 'text/css'
            : asset.endsWith('.js')
              ? 'text/javascript'
              : 'image/svg+xml',
          body: fs.readFileSync(asset),
        });
    }
    return route.abort();
  });
  await context.addInitScript(
    (seed) => {
      if (!sessionStorage.getItem('seeded')) {
        for (const [k, v] of Object.entries(seed))
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        sessionStorage.setItem('seeded', '1');
      }
    },
    { watchlist_v2: fixtures, christmas_watchlist_v1: christmas, ...storage }
  );
  page.dispose = () => context.close();
  return page;
}
async function load(page) {
  await page.goto(base);
  await page.waitForFunction(
    () =>
      typeof render === 'function' &&
      document.getElementById('headerCount').textContent !== '0 films'
  );
  assert.deepEqual(page.errors, []);
}
async function getData(page) {
  return page.evaluate(() => window._sbGetData());
}
async function visual(html, prefix, assetRoot = root) {
  for (const width of [1440, 390]) {
    const p = await makePage({ width, html, assetRoot });
    await load(p);
    await p.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;}',
    });
    for (const [label, code] of [
      ['grid', "setView(window.innerWidth<=640?'list':'grid')"],
      ['compact', "setView(window.innerWidth<=640?'list':'compact')"],
      ['list', "setView('list')"],
      ['detail', "openDetail('one')"],
      ['edit', "closeDetail();openEditModal('one')"],
      [
        'categories',
        "closeAddModal();setFilter('categories',document.getElementById('filterCategories'));selectCategory('Weekend')",
      ],
      [
        'surprise',
        "openSurpriseModal();showSurprisePick(typeof state==='undefined'?movies[0]:getNormalList()[0])",
      ],
      [
        'import',
        "closeSurpriseModal();openImportModal();_renderImportPreview([{Name:'First Film',Year:'2024','Watched Date':'2026-10-15'}],'diary.csv')",
      ],
      ['paste', 'closeImportModal();openPasteImportModal()'],
      ['footer', 'closePasteImportModal();window.scrollTo(0,document.body.scrollHeight)'],
      ...(prefix === 'baseline'
        ? []
        : [
            [
              'export',
              "window.scrollTo(0,0);setFilter('all',document.querySelector('.filter-btn'));openExportModal()",
            ],
            ['import-select', 'closeExportModal();openImportModal()'],
            ['import-results', '_renderImportResults(2,1,1,4)'],
            ['categorise', 'renderImportCategorise()'],
            [
              'bulk-service',
              "closeImportModal();enterSelectMode();toggleSelect('one');openBulkSubpanel('service')",
            ],
            ['bulk-category', "openBulkSubpanel('category')"],
            [
              'paste-review',
              "exitSelectMode();openPasteImportModal();state._pasteItems=[{inputTitle:'First Search',results:[{id:123,title:'First Match',release_date:'2024-10-10',vote_average:8.1},{id:124,title:'Other Match',release_date:'2020-01-01'}],selectedIdx:0,removed:false,showingAlts:true}];state._openAltsIdx=0;state._altHighlightIdx=0;state._pasteCategory='Weekend';_renderPasteReview()",
            ],
            ['paste-results', '_pasteConfirmAll()'],
            ['date-edit', "closePasteImportModal();openDetail('one');editDateAdded('one')"],
            ['detail-rewatch', "closeDetail();openDetail('five')"],
            [
              'detail-detached',
              "closeDetail();setFilter('categories',document.getElementById('filterCategories'));selectCategory('Weekend');toggleCategoryDetached();openDetail('one')",
            ],
            [
              'christmas',
              "closeDetail();toggleChristmasMode();_stopSnow();document.querySelectorAll('.toast').forEach(t=>t.remove())",
            ],
            ['christmas-detail', "openDetail('xmas')"],
            [
              'cloud',
              "closeDetail();toggleChristmasMode();document.querySelectorAll('.toast').forEach(t=>t.remove());document.getElementById('_sb_wrap').style.display='block';document.getElementById('_sb_form_row').style.display='flex'",
            ],
          ]),
    ]) {
      await p.evaluate(code);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(50);
      await p.screenshot({
        path: `${out}/${prefix}-${width}-${label}.png`,
        animations: 'disabled',
      });
      if (process.env.WATCHLIST_COMPUTED) {
        const computed = await p.evaluate(() => {
          const props = [
            'display',
            'position',
            'color',
            'backgroundColor',
            'backgroundImage',
            'border',
            'borderRadius',
            'boxShadow',
            'fontFamily',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'letterSpacing',
            'textTransform',
            'textDecorationLine',
            'opacity',
            'pointerEvents',
            'padding',
            'margin',
            'gap',
            'flex',
            'flexDirection',
            'flexWrap',
            'alignItems',
            'justifyContent',
            'gridTemplateColumns',
            'overflow',
            'zIndex',
            'transform',
          ];
          return [...document.body.querySelectorAll('*')]
            .filter((el) => !['SCRIPT', 'STYLE'].includes(el.tagName))
            .map((el) => {
              const style = getComputedStyle(el),
                rect = el.getBoundingClientRect();
              return {
                tag: el.tagName,
                id: el.id,
                style: Object.fromEntries(props.map((k) => [k, style[k]])),
                rect: [rect.x, rect.y, rect.width, rect.height],
              };
            });
        });
        fs.writeFileSync(`${out}/${prefix}-${width}-${label}.json`, JSON.stringify(computed));
      }
    }
    assert.deepEqual(p.errors, []);
    await p.dispose();
  }
}
async function behaviour() {
  const p = await makePage();
  await load(p);
  assert.equal((await getData(p)).watchlist.length, fixtures.length);
  // Exercise real search handlers, aliases, and API selection with deterministic responses.
  const apiLog = [];
  await p.route('https://api.themoviedb.org/**', async (route) => {
    const u = new URL(route.request().url());
    apiLog.push(u.pathname + u.search);
    const movie = {
      id: 10681,
      title: 'WALL·E',
      release_date: '2008-06-22',
      runtime: 98,
      overview: 'A robot.',
      genres: [{ name: 'Animation' }],
      vote_average: 8.4,
    };
    const body = u.pathname.includes('search/movie')
      ? { results: [] }
      : u.pathname.endsWith('/credits')
        ? { crew: [{ job: 'Director', name: 'Andrew Stanton' }] }
        : movie;
    await route.fulfill({ json: body });
  });
  await p.evaluate(() => {
    document.getElementById('apiKeyInput').value = 'test-key';
    saveApiKey();
    openAddModal();
  });
  await p.locator('#searchInput').fill('WALL-E');
  await p.locator('.search-result-item').waitFor();
  await p.locator('.search-result-item').first().click();
  await p.waitForFunction(() => document.getElementById('fTitle').value === 'WALL·E');
  await p.evaluate(() => saveMovie());
  assert(apiLog.some((x) => x.includes('query=WALL%20E')));
  let data = await getData(p);
  const added = data.watchlist.find((x) => x.title === 'WALL·E');
  assert(added && added.tmdbId === 10681 && added.runtime === 98);
  await p.evaluate((id) => {
    openEditModal(id);
    document.getElementById('fNotes').value = 'Edited';
    saveMovie();
    toggleWatched(id);
  }, added.id);
  assert.equal((await getData(p)).watchlist.find((x) => x.id === added.id).watched, true);
  await p.evaluate((id) => {
    openEditModal(id);
    deleteCurrentMovie();
  }, added.id);
  assert(!(await getData(p)).watchlist.some((x) => x.id === added.id));
  await p.keyboard.press('Meta+z');
  assert((await getData(p)).watchlist.some((x) => x.id === added.id));
  await p.keyboard.press('Meta+Shift+z');
  assert(!(await getData(p)).watchlist.some((x) => x.id === added.id));
  await p.evaluate(() => {
    onSearchBarInput('First');
    setView('list');
  });
  assert.equal(await p.locator('#movieGrid .list-row').count(), 1);
  await p.evaluate(() => {
    clearSearchBar();
    document.activeElement.blur();
    setFilter('categories', document.getElementById('filterCategories'));
    selectCategory('Weekend');
  });
  assert.equal(await p.locator('#movieGrid [data-id]').count(), 2);
  await p.evaluate(() => {
    toggleChristmasMode();
    openAddModal();
    document.getElementById('fTitle').value = 'New Christmas Film';
    saveMovie();
  });
  data = await getData(p);
  assert.equal(data.christmas.length, 2);
  assert.equal(data.watchlist.length, fixtures.length);
  await p.evaluate(() => toggleChristmasMode());
  data = await getData(p);
  assert.equal(data.watchlist.length, fixtures.length);
  assert.equal(data.christmas.length, 2);
  // Manual paste input, markdown stripping, duplicate skipping and undo.
  await p.evaluate(() => {
    state.omdbKey = '';
    state.tmdbKey = '';
    openPasteImportModal();
    document.getElementById('pasteTitlesInput').value = '- [ ] Paste One\n2) Paste Two';
    _startPasteSearch();
  });
  await p.locator('#pasteConfirmBtn').waitFor();
  await p.evaluate(() => _pasteConfirmAll());
  assert.equal((await getData(p)).watchlist.length, fixtures.length + 2);
  await p.evaluate(() => _undoPasteImport());
  assert.equal((await getData(p)).watchlist.length, fixtures.length);
  // Legacy and combined remote payloads, including paused writes and list separation.
  await p.evaluate(() => {
    window._sbPaused = true;
    window._sbOnLoad([{ id: 'legacy', title: 'Legacy', streaming: {}, runtime: 0 }]);
    window._sbPaused = false;
  });
  assert.equal((await getData(p)).watchlist[0].title, 'Legacy');
  await p.evaluate(
    (seed) => {
      window._sbPaused = true;
      window._sbOnLoad(seed);
      window._sbPaused = false;
    },
    { watchlist: fixtures, christmas, categorySettings: { Weekend: { detached: true } } }
  );
  assert.equal((await getData(p)).categorySettings.Weekend.detached, true);
  assert.deepEqual(p.errors, []);
  await p.dispose();
  const mobile = await makePage({ width: 390, storage: { watchlist_view: 'grid' } });
  await load(mobile);
  assert.equal(await mobile.locator('#movieGrid').getAttribute('class'), 'list-container');
  await mobile.locator('#mobileSearchBarInput').fill('First');
  assert.equal(await mobile.locator('#movieGrid .list-row').count(), 1);
  await mobile.dispose();
  console.log(
    'PASS search/add/edit/watched/delete/undo/redo, categories/search/views, Christmas separation, paste import/undo, legacy/combined sync payloads, mobile'
  );
}
async function importExportAndBulk() {
  const p = await makePage();
  await load(p);
  await p.evaluate(() => {
    document.activeElement.blur();
  });
  await p.keyboard.press('a');
  assert(await p.locator('#addModal').evaluate((el) => el.classList.contains('open')));
  await p.keyboard.press('Escape');
  await p.evaluate(async () => {
    openImportModal();
    state._importRows = _parseLetterboxdCSV(
      'Name,Year,Watched Date\nFirst Film,2024,2026-10-20\n"Imported ""Quoted"" Film",2022,2026-10-19'
    );
    await runLetterboxdImport();
  });
  let data = await getData(p);
  assert.equal(data.watchlist.length, fixtures.length + 1);
  assert.equal(data.watchlist.find((m) => m.id === 'one').watched, true);
  assert.equal(data.watchlist.find((m) => m.id === 'one').streaming.netflix.direct, true);
  assert(data.watchlist.some((m) => m.title === 'Imported "Quoted" Film'));
  await p.evaluate(() => _undoLetterboxdImport());
  assert.deepEqual((await getData(p)).watchlist, fixtures);
  const downloaded = p.waitForEvent('download');
  await p.evaluate(() => {
    openExportModal();
    runLetterboxdExport();
  });
  const download = await downloaded;
  const csv = fs.readFileSync(await download.path(), 'utf8');
  assert(csv.startsWith('tmdbID,Title,Year,Directors\r\n'));
  assert(csv.includes('11,First Film,2024,A Director'));
  assert(!csv.includes('Watched Film'));
  await download.delete();
  await p.evaluate(() => {
    enterSelectMode();
    toggleSelect('one');
    bulkMoveToChristmas();
  });
  data = await getData(p);
  assert.equal(data.watchlist.length, fixtures.length - 1);
  assert.equal(data.christmas.length, christmas.length + 1);
  await p.evaluate(() => {
    toggleChristmasMode();
    enterSelectMode();
    toggleSelect('one');
    bulkMoveToChristmas();
  });
  data = await getData(p);
  assert.equal(data.watchlist.length, fixtures.length);
  assert.equal(data.christmas.length, christmas.length);
  await p.reload();
  await p.waitForFunction(() => document.body.classList.contains('christmas-mode'));
  assert.equal(await p.locator('#movieGrid [data-id="xmas"]').count(), 1);
  assert.equal((await getData(p)).watchlist.length, fixtures.length);
  await p.evaluate(() => {
    toggleChristmasMode();
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    document.getElementById('omdbKeyInput').value = 'omdb-fixture';
    saveOmdbKey();
  });
  assert.equal(await p.evaluate(() => localStorage.getItem('omdb_api_key')), 'omdb-fixture');
  const counts = await p.evaluate(() => {
    const result = {};
    for (const filter of ['netflix', 'cinema', 'soon', 'watched', 'unwatched', 'graveyard']) {
      const button = [...document.querySelectorAll('.filter-btn')].find((b) =>
        b.getAttribute('onclick')?.includes("'" + filter + "'")
      );
      setFilter(filter, button);
      result[filter] = getFiltered().length;
    }
    return result;
  });
  assert.deepEqual(counts, {
    netflix: 2,
    cinema: 1,
    soon: 1,
    watched: 1,
    unwatched: 5,
    graveyard: 0,
  });
  assert.deepEqual(p.errors, []);
  await p.dispose();
  console.log(
    'PASS add shortcut/Escape, Letterboxd CSV import/update/undo/export, bidirectional bulk moves, Christmas reload, OMDb key entry, service/status filters'
  );
}

async function stateAndBackfills() {
  const p = await makePage();
  await load(p);
  const result = await p.evaluate(async () => {
    const normal = getNormalList(),
      xmas = getChristmasList();
    toggleChristmasMode();
    const stable =
      normal === getNormalList() && xmas === getChristmasList() && state.movies === xmas;
    toggleChristmasMode();
    const nativeStorage = Storage.prototype.setItem.toString().includes('[native code]');
    save();
    const timestamp = Number(localStorage.getItem('_sb_local_ts'));
    const originals = [backfillRuntimes, backfillReleaseDates, backfillRtRatings];
    const trace = [];
    const task = (name) => async () => {
      trace.push(name + ' start');
      await new Promise((r) => setTimeout(r, 2));
      trace.push(name + ' end');
    };
    backfillRuntimes = task('runtime');
    backfillReleaseDates = task('release');
    backfillRtRatings = task('rt');
    scheduleBackfills(0);
    scheduleBackfills(0);
    await new Promise((r) => setTimeout(r, 20));
    await state.backfillQueue;
    [backfillRuntimes, backfillReleaseDates, backfillRtRatings] = originals;
    const actualFetch = window.fetch;
    try {
      state.tmdbKey = 'fixture';
      openAddModal();
      document.getElementById('searchInput').value = 'New';
      window.fetch = async (url) => {
        const query = new URL(url).searchParams.get('query');
        if (query === 'Old') await new Promise((r) => setTimeout(r, 40));
        return {
          ok: true,
          json: async () =>
            query
              ? { results: [{ id: 42, title: query, release_date: '2024-01-01' }] }
              : { id: 42, title: 'New', crew: [] },
        };
      };
      await Promise.all([searchTMDB('Old'), searchTMDB('New')]);
      const latest = document.querySelector('.result-title').textContent;
      closeAddModal();
      const movie = { id: 'fill', title: 'Fill', tmdbId: 42, streaming: {} };
      setNormalList([movie]);
      window.fetch = async () => ({ ok: false, status: 429 });
      await backfillRuntimes();
      const retryable = movie.runtime === undefined;
      window.fetch = async () => ({ ok: true, json: async () => ({ runtime: 123 }) });
      await backfillRuntimes();
      const runtime = movie.runtime;
      state.omdbKey = 'fixture';
      window.fetch = async (url) => ({
        ok: true,
        json: async () =>
          url.includes('external_ids')
            ? { imdb_id: 'tt42' }
            : { Response: 'False', Error: 'Request limit reached!' },
      });
      await backfillRtRatings();
      const rtRetryable = movie.rtRating === undefined;
      window.fetch = async (url) => ({
        ok: true,
        json: async () =>
          url.includes('external_ids')
            ? { imdb_id: 'tt42' }
            : { Ratings: [{ Source: 'Rotten Tomatoes', Value: '97%' }] },
      });
      await backfillRtRatings();
      return {
        stable,
        nativeStorage,
        timestamp,
        trace,
        latest,
        retryable,
        runtime,
        rtRetryable,
        rt: movie.rtRating,
      };
    } finally {
      window.fetch = actualFetch;
    }
  });
  assert(result.stable && result.nativeStorage && result.timestamp > 0);
  assert.deepEqual(result.trace, [
    'runtime start',
    'runtime end',
    'release start',
    'release end',
    'rt start',
    'rt end',
    'runtime start',
    'runtime end',
    'release start',
    'release end',
    'rt start',
    'rt end',
  ]);
  assert.equal(result.latest, 'New');
  assert(result.retryable && result.rtRetryable);
  assert.equal(result.runtime, 123);
  assert.equal(result.rt, '97%');
  assert.deepEqual(p.errors, []);
  await p.dispose();
  const blocked = await makePage();
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await blocked.goto(base);
  await blocked.waitForFunction(
    () => typeof render === 'function' && document.getElementById('movieGrid').children.length > 0
  );
  await blocked.evaluate(() => {
    openAddModal();
    document.getElementById('fTitle').value = 'Memory only';
    saveMovie();
  });
  assert.equal((await getData(blocked)).watchlist[0].title, 'Memory only');
  assert.deepEqual(blocked.errors, []);
  await blocked.dispose();
  console.log(
    'PASS stable list ownership, native storage untouched, save timestamps, serialized backfills, stale search response rejection, TMDB/OMDb retry guards, blocked storage'
  );
}

async function security() {
  const evil = `O'Neil "quoted" \\ & <img src=x onerror=window.__injected=1>\nline`;
  const evilId = `id'"\\\n);window.__injected=1;//`;
  const p = await makePage({
    storage: {
      watchlist_v2: [
        {
          ...fixtures[0],
          id: evilId,
          title: evil,
          category: evil,
          collection: evil,
          watchWith: evil,
          notes: evil,
          otherName: evil,
        },
      ],
      _sb_pass: 'old-secret',
    },
  });
  await load(p);
  assert.equal(await p.evaluate(() => localStorage.getItem('_sb_pass')), null);
  await p.locator('#movieGrid .card').click();
  assert.equal(await p.locator('.detail-title').textContent(), evil);
  await p.evaluate(() => {
    closeDetail();
    setFilter('categories', document.getElementById('filterCategories'));
  });
  await p.locator('.category-pill').nth(1).click();
  await p.locator('.pill-menu-btn').click();
  await p.locator('#categoryPillPopover .track').click();
  await p.evaluate(() => {
    closePillMenu();
    openAddModal();
  });
  for (const [input, dropdown] of [
    ['fCollection', 'collectionDropdown'],
    ['fCategory', 'categoryDropdown'],
    ['fWatchWith', 'watchWithDropdown'],
  ]) {
    await p.locator('#' + input).focus();
    await p
      .locator('#' + dropdown + ' [data-name]')
      .first()
      .dispatchEvent('mousedown');
    assert.equal(await p.locator('#' + input).inputValue(), evil.replace(/\n/g, ''));
  }
  await p.evaluate(() => {
    closeAddModal();
    enterSelectMode();
  });
  await p.locator('#movieGrid .card').click();
  await p.evaluate(() => openBulkSubpanel('category'));
  await p.locator('#bulkSubpanel .bulk-svc-chip').click();
  assert.equal(await p.locator('#bulkCatInput').inputValue(), evil.replace(/\n/g, ''));
  await p.evaluate(() => {
    exitSelectMode();
    showInfoToast('<img src=x onerror=window.__injected=1>');
  });
  assert.equal(await p.evaluate(() => window.__injected || 0), 0);
  assert.deepEqual(p.errors, []);
  await p.dispose();
  console.log(
    'PASS hostile title/note/category/collection/companion/ID handler round-trips and legacy password deletion'
  );
}
async function auth() {
  if (!process.env.WATCHLIST_SUPABASE_SDK)
    return console.log('SKIP real SDK auth tests (set WATCHLIST_SUPABASE_SDK)');
  const p = await makePage({ sdk: true });
  let row = null,
    signins = 0,
    refreshes = 0,
    writes = 0;
  let failNextWrite = false,
    holdNextGet = false,
    releaseGet;
  function token() {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'test@example.com',
      aud: 'authenticated',
      role: 'authenticated',
    };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const jwt = [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub: user.id, exp: expires, aud: 'authenticated' })).toString(
        'base64url'
      ),
      'signature',
    ].join('.');
    return {
      access_token: jwt,
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: expires,
      user,
    };
  }
  const cloudRoute = async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    if (u.pathname.includes('/auth/v1/token')) {
      if (u.searchParams.get('grant_type') === 'password') signins++;
      else refreshes++;
      return route.fulfill({ json: token() });
    }
    if (req.method() === 'POST') {
      writes++;
      if (failNextWrite) {
        failNextWrite = false;
        return route.fulfill({ status: 503, json: { message: 'Offline fixture' } });
      }
      row = req.postDataJSON();
      return route.fulfill({ status: 201, body: '' });
    }
    const response = row ? [{ data: structuredClone(row.data) }] : [];
    if (holdNextGet) {
      holdNextGet = false;
      await new Promise((resolve) => {
        releaseGet = resolve;
      });
    }
    return route.fulfill({ json: response });
  };
  await p.route('https://abcdefghijk.supabase.co/**', cloudRoute);
  await load(p);
  await p.evaluate(() => window._sbOpenPanel());
  await p.locator('#_sb_url_in').fill('https://abcdefghijk.supabase.co');
  await p.locator('#_sb_key_in').fill('test-anon-key');
  await p.locator('#_sb_email_in').fill('test@example.com');
  await p.locator('#_sb_pass_in').fill('type-once-password');
  await p.locator('#_sb_save_btn').click();
  await p.waitForFunction(() => document.getElementById('_sb_status').textContent === 'Connected!');
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Saved'));
  assert.equal(signins, 1);
  assert(writes > 0);
  assert.equal(row.user_id, token().user.id);
  assert.deepEqual(Object.keys(row.data).sort(), ['categorySettings', 'christmas', 'watchlist']);
  assert.equal(await p.evaluate(() => localStorage.getItem('_sb_pass')), null);
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Loaded'));
  assert.equal(signins, 1);
  await p.evaluate(() => window._sbOpenPanel());
  assert.equal(await p.locator('#_sb_pass_in').isVisible(), false);
  // Copy and paste config never carries a password.
  await p.evaluate(() => {
    navigator.clipboard.writeText = async (text) => {
      window.__copied = text;
    };
    document.getElementById('_sb_connect_btn').click();
    document.getElementById('_sb_copy_cfg').click();
  });
  assert(!(await p.evaluate(() => window.__copied)).includes('PASS'));
  await p.evaluate(() => {
    document.getElementById('_sb_paste_area').value =
      'SUPABASE_URL=https://abcdefghijk.supabase.co\nSUPABASE_ANON_KEY=test-anon-key\nSUPABASE_EMAIL=test@example.com\nSUPABASE_PASS=never-import';
    document.getElementById('_sb_paste_area').dispatchEvent(new Event('input'));
  });
  assert.equal(await p.locator('#_sb_pass_in').inputValue(), '');
  await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    const session = JSON.parse(localStorage.getItem(key));
    session.expires_at = 1;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Loaded'));
  assert.equal(signins, 1);
  assert(refreshes > 0);
  // A failed write is retried at the existing two-second interval.
  failNextWrite = true;
  await p.evaluate(() => {
    getNormalList()[0].notes = 'Retry this edit';
    save();
  });
  await p.waitForFunction(() => localStorage.getItem('_sb_pending') === '1');
  await p.waitForFunction(() => localStorage.getItem('_sb_pending') === null);
  assert.equal(row.data.watchlist[0].notes, 'Retry this edit');
  // Persisted pending data wins over the older remote row on reload.
  failNextWrite = true;
  await p.evaluate(() => {
    getNormalList()[0].notes = 'Pending across reload';
    save();
  });
  await p.waitForFunction(() => localStorage.getItem('_sb_pending') === '1');
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Saved'));
  assert.equal((await getData(p)).watchlist[0].notes, 'Pending across reload');
  assert.equal(row.data.watchlist[0].notes, 'Pending across reload');
  // Edits made during the initial GET are kept even if that GET returns stale data.
  holdNextGet = true;
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title === 'Loading...');
  await p.evaluate(() => {
    getNormalList()[0].notes = 'Edited during fetch';
    save();
  });
  assert(releaseGet);
  releaseGet();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Saved'));
  assert.equal((await getData(p)).watchlist[0].notes, 'Edited during fetch');
  assert.equal(row.data.watchlist[0].notes, 'Edited during fetch');

  assert.deepEqual(p.errors, []);
  await p.dispose();
  // The auth adapter must retain a session in memory when iOS blocks storage.
  row = null;
  const memory = await makePage({ sdk: true });
  await memory.route('https://abcdefghijk.supabase.co/**', cloudRoute);
  await memory.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await memory.goto(base);
  await memory.waitForFunction(() => typeof window._sbOpenPanel === 'function');
  await memory.evaluate(async () => {
    openAddModal();
    document.getElementById('fTitle').value = 'Cloud from memory';
    saveMovie();
    window._sbOpenPanel();
    document.getElementById('_sb_url_in').value = 'https://abcdefghijk.supabase.co';
    document.getElementById('_sb_key_in').value = 'test-anon-key';
    document.getElementById('_sb_email_in').value = 'test@example.com';
    document.getElementById('_sb_pass_in').value = 'type-once-password';
    await document.getElementById('_sb_save_btn').onclick();
    await window._sbForceSync();
  });
  assert.equal(row.data.watchlist[0].title, 'Cloud from memory');
  assert.deepEqual(memory.errors, []);
  await memory.dispose();
  console.log(
    'PASS real pinned Supabase SDK sign-in, reload/refresh, config copy/paste, retry/pending/conflict handling, unchanged table/payload, in-memory auth fallback'
  );
}
(async () => {
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.WATCHLIST_BROWSER ||
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  try {
    if (process.env.WATCHLIST_BASELINE_HTML)
      await visual(fs.readFileSync(process.env.WATCHLIST_BASELINE_HTML, 'utf8'), 'baseline');
    if (process.env.WATCHLIST_REFERENCE_DIR) {
      const reference = process.env.WATCHLIST_REFERENCE_DIR;
      await visual(
        fs.readFileSync(path.join(reference, 'index.html'), 'utf8'),
        'reference',
        reference
      );
    }
    if (!process.env.WATCHLIST_SKIP_VISUAL) await visual(undefined, 'current');
    await behaviour();
    await importExportAndBulk();
    await stateAndBackfills();
    await security();
    await auth();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
