/* Run with an existing Playwright installation; the app itself has no dependencies.
 * WATCHLIST_PLAYWRIGHT_PATH=/absolute/path/to/playwright node my-watchlist/tests/regression.cjs
 * Optional: WATCHLIST_BASELINE_HTML and WATCHLIST_SCREENSHOTS for visual comparisons.
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
  { id: 'one', title: 'First Film', year: '2024', genre: 'Drama, Adventure', director: 'A Director', runtime: 120, notes: 'A film to watch.', category: 'Weekend', collection: 'Series', streaming: { netflix: { direct: true } }, dateAdded: '2026-10-10T12:00:00Z', tmdbId: 11 },
  { id: 'two', title: 'Second Film', year: '2025', genre: 'Comedy', runtime: 90, category: 'Weekend', collection: 'Series', streaming: { netflix: { vpn: true, vpnCountry: 'United States' } }, dateAdded: '2026-10-11T12:00:00Z' },
  { id: 'three', title: 'Coming Soon', year: '2026', genre: 'Action', runtime: 110, streaming: { cinema: { coming: true } }, releaseDate: '2026-12-20', dateAdded: '2026-10-12T12:00:00Z' },
  { id: 'four', title: 'Watching Soon', year: '2023', runtime: 100, watchingSoon: true, streaming: {}, dateAdded: '2026-10-13T12:00:00Z' },
  { id: 'five', title: 'Watched Film', year: '2022', runtime: 80, watched: true, rewatch: true, rewatchingSoon: true, streaming: { disney: { direct: true } }, dateAdded: '2026-10-14T12:00:00Z', dateWatched: '2026-10-15T12:00:00Z' },
  { id: 'six', title: 'Other Film', year: '2020', runtime: 140, streaming: {}, watchWith: 'Movie Club', dateAdded: '2026-09-01T12:00:00Z' },
];
const christmas = [{ id: 'xmas', title: 'Christmas Film', year: '2020', runtime: 90, streaming: {}, dateAdded: '2026-10-01T12:00:00Z' }];
let browser;
async function makePage({ width = 1440, html, storage = {}, sdk = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'Australia/Melbourne' });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.includes('unpkg.com')) return route.fulfill({ contentType: 'text/javascript', body: sdk ? fs.readFileSync(process.env.WATCHLIST_SUPABASE_SDK, 'utf8') : '' });
    if (url.startsWith(base)) {
      if (url === base || url === base + 'index.html') return route.fulfill({ contentType: 'text/html', body: html || fs.readFileSync(path.join(root, 'index.html'), 'utf8') });
      const asset = path.join(root, new URL(url).pathname.split('/my-watchlist/')[1]);
      if (fs.existsSync(asset) && fs.statSync(asset).isFile()) return route.fulfill({ contentType: asset.endsWith('.css') ? 'text/css' : asset.endsWith('.js') ? 'text/javascript' : 'image/svg+xml', body: fs.readFileSync(asset) });
    }
    return route.abort();
  });
  await context.addInitScript(seed => {
    if (!sessionStorage.getItem('seeded')) {
      for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      sessionStorage.setItem('seeded', '1');
    }
  }, { watchlist_v2: fixtures, christmas_watchlist_v1: christmas, ...storage });
  page.dispose = () => context.close();
  return page;
}
async function load(page) {
  await page.goto(base);
  await page.waitForFunction(() => typeof render === 'function' && document.getElementById('headerCount').textContent !== '0 films');
  assert.deepEqual(page.errors, []);
}
async function getData(page) { return page.evaluate(() => window._sbGetData()); }
async function visual(html, prefix) {
  for (const width of [1440, 390]) {
    const p = await makePage({ width, html });
    await load(p);
    await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;}' });
    for (const [label, code] of [
      ['grid', "setView(window.innerWidth<=640?'list':'grid')"],
      ['compact', "setView(window.innerWidth<=640?'list':'compact')"],
      ['list', "setView('list')"],
      ['detail', "openDetail('one')"],
      ['edit', "closeDetail();openEditModal('one')"],
      ['categories', "closeAddModal();setFilter('categories',document.getElementById('filterCategories'));selectCategory('Weekend')"],
      ['surprise', "openSurpriseModal();showSurprisePick(movies[0])"],
      ['import', "closeSurpriseModal();openImportModal();_renderImportPreview([{Name:'First Film',Year:'2024','Watched Date':'2026-10-15'}],'diary.csv')"],
      ['paste', "closeImportModal();openPasteImportModal()"],
      ['footer', "closePasteImportModal();window.scrollTo(0,document.body.scrollHeight)"],
    ]) {
      await p.evaluate(code);
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(50);
      await p.screenshot({ path: `${out}/${prefix}-${width}-${label}.png`, animations: 'disabled' });
    }
    assert.deepEqual(p.errors, []);
    await p.dispose();
  }
}
async function behaviour() {
  const p = await makePage(); await load(p);
  assert.equal((await getData(p)).watchlist.length, fixtures.length);
  // Exercise real search handlers, aliases, and API selection with deterministic responses.
  const apiLog = [];
  await p.route('https://api.themoviedb.org/**', async route => {
    const u = new URL(route.request().url()); apiLog.push(u.pathname + u.search);
    const movie = { id: 10681, title: 'WALL·E', release_date: '2008-06-22', runtime: 98, overview: 'A robot.', genres: [{ name: 'Animation' }], vote_average: 8.4 };
    const body = u.pathname.includes('search/movie') ? { results: [] } : u.pathname.endsWith('/credits') ? { crew: [{ job: 'Director', name: 'Andrew Stanton' }] } : movie;
    await route.fulfill({ json: body });
  });
  await p.evaluate(() => { document.getElementById('apiKeyInput').value = 'test-key'; saveApiKey(); openAddModal(); });
  await p.locator('#searchInput').fill('WALL-E');
  await p.locator('.search-result-item').waitFor();
  await p.locator('.search-result-item').first().click();
  await p.waitForFunction(() => document.getElementById('fTitle').value === 'WALL·E');
  await p.evaluate(() => saveMovie());
  assert(apiLog.some(x => x.includes('query=WALL%20E')));
  let data = await getData(p); const added = data.watchlist.find(x => x.title === 'WALL·E');
  assert(added && added.tmdbId === 10681 && added.runtime === 98);
  await p.evaluate(id => { openEditModal(id); document.getElementById('fNotes').value = 'Edited'; saveMovie(); toggleWatched(id); }, added.id);
  assert.equal((await getData(p)).watchlist.find(x => x.id === added.id).watched, true);
  await p.evaluate(id => { openEditModal(id); deleteCurrentMovie(); }, added.id);
  assert(!(await getData(p)).watchlist.some(x => x.id === added.id));
  await p.keyboard.press('Meta+z');
  assert((await getData(p)).watchlist.some(x => x.id === added.id));
  await p.keyboard.press('Meta+Shift+z');
  assert(!(await getData(p)).watchlist.some(x => x.id === added.id));
  await p.evaluate(() => { onSearchBarInput('First'); setView('list'); });
  assert.equal(await p.locator('#movieGrid .list-row').count(), 1);
  await p.evaluate(() => { clearSearchBar(); document.activeElement.blur(); setFilter('categories',document.getElementById('filterCategories')); selectCategory('Weekend'); });
  assert.equal(await p.locator('#movieGrid [data-id]').count(), 2);
  await p.evaluate(() => { toggleChristmasMode(); openAddModal(); document.getElementById('fTitle').value='New Christmas Film'; saveMovie(); });
  data = await getData(p); assert.equal(data.christmas.length, 2); assert.equal(data.watchlist.length, fixtures.length);
  await p.evaluate(() => toggleChristmasMode());
  data = await getData(p); assert.equal(data.watchlist.length, fixtures.length); assert.equal(data.christmas.length, 2);
  // Manual paste input, markdown stripping, duplicate skipping and undo.
  await p.evaluate(() => { omdbKey=''; tmdbKey=''; openPasteImportModal(); document.getElementById('pasteTitlesInput').value='- [ ] Paste One\n2) Paste Two'; _startPasteSearch(); });
  await p.locator('#pasteConfirmBtn').waitFor();
  await p.evaluate(() => _pasteConfirmAll());
  assert.equal((await getData(p)).watchlist.length, fixtures.length + 2);
  await p.evaluate(() => _undoPasteImport());
  assert.equal((await getData(p)).watchlist.length, fixtures.length);
  // Legacy and combined remote payloads, including paused writes and list separation.
  await p.evaluate(() => { window._sbPaused=true; window._sbOnLoad([{id:'legacy',title:'Legacy',streaming:{},runtime:0}]); window._sbPaused=false; });
  assert.equal((await getData(p)).watchlist[0].title, 'Legacy');
  await p.evaluate(seed => { window._sbPaused=true; window._sbOnLoad(seed); window._sbPaused=false; }, { watchlist: fixtures, christmas, categorySettings: { Weekend: { detached: true } } });
  assert.equal((await getData(p)).categorySettings.Weekend.detached, true);
  assert.deepEqual(p.errors, []);
  await p.dispose();
  const mobile = await makePage({ width: 390, storage: { watchlist_view: 'grid' } }); await load(mobile);
  assert.equal(await mobile.locator('#movieGrid').getAttribute('class'), 'list-container');
  await mobile.locator('#mobileSearchBarInput').fill('First');
  assert.equal(await mobile.locator('#movieGrid .list-row').count(), 1);
  await mobile.dispose();
  console.log('PASS search/add/edit/watched/delete/undo/redo, categories/search/views, Christmas separation, paste import/undo, legacy/combined sync payloads, mobile');
}
async function security() {
  const evil = `O'Neil "quoted" \\ & <img src=x onerror=window.__injected=1>\nline`;
  const evilId = `id'"\\\n);window.__injected=1;//`;
  const p = await makePage({ storage: { watchlist_v2: [{ ...fixtures[0], id: evilId, title: evil, category: evil, collection: evil, watchWith: evil, notes: evil, otherName: evil }], _sb_pass: 'old-secret' } }); await load(p);
  assert.equal(await p.evaluate(() => localStorage.getItem('_sb_pass')), null);
  await p.locator('#movieGrid .card').click();
  assert.equal(await p.locator('.detail-title').textContent(), evil);
  await p.evaluate(() => { closeDetail(); setFilter('categories',document.getElementById('filterCategories')); });
  await p.locator('.category-pill').nth(1).click();
  await p.locator('.pill-menu-btn').click();
  await p.locator('#categoryPillPopover .track').click();
  await p.evaluate(() => { closePillMenu(); openAddModal(); });
  for (const [input, dropdown] of [['fCollection','collectionDropdown'],['fCategory','categoryDropdown'],['fWatchWith','watchWithDropdown']]) {
    await p.locator('#'+input).focus();
    await p.locator('#'+dropdown+' [data-name]').first().dispatchEvent('mousedown');
    assert.equal(await p.locator('#'+input).inputValue(), evil.replace(/\n/g,''));
  }
  await p.evaluate(() => { closeAddModal(); enterSelectMode(); });
  await p.locator('#movieGrid .card').click();
  await p.evaluate(() => openBulkSubpanel('category'));
  await p.locator('#bulkSubpanel .bulk-svc-chip').click();
  assert.equal(await p.locator('#bulkCatInput').inputValue(), evil.replace(/\n/g,''));
  await p.evaluate(() => { exitSelectMode(); showInfoToast('<img src=x onerror=window.__injected=1>'); });
  assert.equal(await p.evaluate(() => window.__injected || 0), 0);
  assert.deepEqual(p.errors, []);
  await p.dispose();
  console.log('PASS hostile title/note/category/collection/companion/ID handler round-trips and legacy password deletion');
}
async function auth() {
  if (!process.env.WATCHLIST_SUPABASE_SDK) return console.log('SKIP real SDK auth tests (set WATCHLIST_SUPABASE_SDK)');
  const p = await makePage({ sdk: true });
  let row = null, signins = 0, refreshes = 0, writes = 0;
  function token() {
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com', aud:'authenticated', role:'authenticated' };
    const expires = Math.floor(Date.now()/1000)+3600;
    const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({sub:user.id,exp:expires,aud:'authenticated'})).toString('base64url'), 'signature'].join('.');
    return { access_token: jwt, refresh_token:'test-refresh-token', token_type:'bearer', expires_in:3600, expires_at:expires, user };
  }
  await p.route('https://abcdefghijk.supabase.co/**', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.pathname.includes('/auth/v1/token')) {
      if (u.searchParams.get('grant_type')==='password') signins++; else refreshes++;
      return route.fulfill({ json: token() });
    }
    if (req.method()==='POST') { row = req.postDataJSON(); writes++; return route.fulfill({ status:201, body:'' }); }
    return route.fulfill({ json: row ? [{data:row.data}] : [] });
  });
  await load(p);
  await p.evaluate(() => window._sbOpenPanel());
  await p.locator('#_sb_url_in').fill('https://abcdefghijk.supabase.co');
  await p.locator('#_sb_key_in').fill('test-anon-key');
  await p.locator('#_sb_email_in').fill('test@example.com');
  await p.locator('#_sb_pass_in').fill('type-once-password');
  await p.locator('#_sb_save_btn').click();
  await p.waitForFunction(() => document.getElementById('_sb_status').textContent==='Connected!');
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Saved'));
  assert.equal(signins,1); assert(writes>0); assert.equal(row.user_id,token().user.id);
  assert.deepEqual(Object.keys(row.data).sort(),['categorySettings','christmas','watchlist']);
  assert.equal(await p.evaluate(() => localStorage.getItem('_sb_pass')),null);
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Loaded'));
  assert.equal(signins,1);
  await p.evaluate(() => window._sbOpenPanel());
  assert.equal(await p.locator('#_sb_pass_in').isVisible(),false);
  // Copy and paste config never carries a password.
  await p.evaluate(() => {
    navigator.clipboard.writeText = async text => { window.__copied=text; };
    document.getElementById('_sb_connect_btn').click();
    document.getElementById('_sb_copy_cfg').click();
  });
  assert(!(await p.evaluate(() => window.__copied)).includes('PASS'));
  await p.evaluate(() => {
    document.getElementById('_sb_paste_area').value='SUPABASE_URL=https://abcdefghijk.supabase.co\nSUPABASE_ANON_KEY=test-anon-key\nSUPABASE_EMAIL=test@example.com\nSUPABASE_PASS=never-import';
    document.getElementById('_sb_paste_area').dispatchEvent(new Event('input'));
  });
  assert.equal(await p.locator('#_sb_pass_in').inputValue(),'');
  await p.evaluate(() => {
    const key=Object.keys(localStorage).find(k=>k.endsWith('-auth-token'));
    const session=JSON.parse(localStorage.getItem(key)); session.expires_at=1;
    localStorage.setItem(key,JSON.stringify(session));
  });
  await p.reload();
  await p.waitForFunction(() => document.getElementById('_sb_cloud_btn').title.includes('Loaded'));
  assert.equal(signins,1); assert(refreshes>0);
  assert.deepEqual(p.errors,[]);
  await p.dispose();
  console.log('PASS real pinned Supabase SDK sign-in, persisted reload, expired session refresh, config copy/paste, unchanged table/payload');
}
(async () => {
  fs.mkdirSync(out,{recursive:true});
  browser = await chromium.launch({ headless:true, executablePath: process.env.WATCHLIST_BROWSER || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    if (process.env.WATCHLIST_BASELINE_HTML) await visual(fs.readFileSync(process.env.WATCHLIST_BASELINE_HTML,'utf8'),'baseline');
    if (!process.env.WATCHLIST_SKIP_VISUAL) await visual(undefined,'current');
    await behaviour(); await security(); await auth();
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
