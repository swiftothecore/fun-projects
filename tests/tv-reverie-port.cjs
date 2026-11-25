/* Isolated browser checks for the Watchlist features adapted for TV Reverie. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'http://localhost';
const library = [
  { id:'hidden', title:'Hidden Show', category:'Private' },
  { id:'old', title:'Twin Older', watched:true, watchStatus:'finished_for_good', dateWatched:'2024-09-01', episodeRuntime:40 },
  { id:'new', title:'Twin Recent', watched:true, watchStatus:'finished_for_good', dateWatched:'2025-11-01', episodeRuntime:55 },
  { id:'short', title:'Short Series', streaming:{ netflix:{ direct:true } }, episodeRuntime:23 },
  { id:'upcoming', title:'Future Premiere', firstAirDate:'2090-01-01' },
];
const categories = { Private:{ detached:true } };

async function openPage(browser, { viewport = { width:1280, height:900 }, fixture = library, extra = {}, routes } = {}) {
  const context = await browser.newContext({ viewport, timezoneId:'Australia/Melbourne' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(storage => {
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  }, { tvshows_v1:JSON.stringify(fixture), category_settings_tvshows_v1:JSON.stringify(categories), ...extra });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (routes && await routes(route, url)) return;
    if (url.origin === origin) {
      const file = path.join(root, url.pathname);
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const type = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.svg':'image/svg+xml' };
        return route.fulfill({ body:fs.readFileSync(file), contentType:type[path.extname(file)] });
      }
    }
    return route.fulfill({ status:503, body:'' });
  });
  await page.goto(origin + '/tv-reverie/index.html');
  return { context, page, errors };
}

async function testLibrary(browser) {
  const { context, page, errors } = await openPage(browser, { viewport:{ width:390, height:840 } });
  await page.locator('#upcomingStrip [data-id=upcoming]').waitFor();
  const bottom = page.locator('#mobileSearchInput');
  await bottom.fill('Hidden');
  await page.getByRole('button', { name:'Search detached categories' }).click();
  await page.locator('#showGrid [data-id=hidden]').waitFor();
  await bottom.press('Enter');
  assert.equal(await bottom.evaluate(input => input === document.activeElement), false);
  await page.setViewportSize({ width:1280, height:900 });
  assert.equal(await page.locator('#searchBar').inputValue(), 'Hidden');
  await page.locator('#filterAll').click();
  assert.equal(await page.locator('#searchBar').inputValue(), '');
  await page.getByRole('button', { name:'Finished', exact:true }).click();
  assert.deepEqual(await page.locator('#showGrid [data-id]').evaluateAll(cards => cards.map(card => card.dataset.id)), ['new','old']);
  await page.locator('#sortBtn').click();
  await page.getByRole('button', { name:'Episode runtime shortest first' }).click();
  assert.deepEqual(await page.locator('#showGrid [data-id]').evaluateAll(cards => cards.map(card => card.dataset.id)), ['old','new']);
  await page.locator('#showGrid [data-id=new]').click();
  await page.getByRole('button', { name:'Rewatch Soon', exact:true }).click();
  await page.keyboard.press('Escape');
  await page.locator('#filterAll').click();
  await page.locator('#rewatchSoonStrip [data-id=new]').waitFor();
  await page.locator('#watchingStrip [data-id=new]').waitFor({ state:'detached' });

  await page.getByRole('button', { name:'Select', exact:true }).click();
  await page.locator('#showGrid [data-id=short]').click();
  await page.getByRole('button', { name:'Edit tags & services' }).click();
  await page.locator('#bulkSetCompanion').check();
  await page.locator('#bulkCompanion').fill('Sam');
  await page.getByRole('button', { name:'Apply changes' }).click();
  await page.locator('#showGrid [data-id=short]').click();
  await page.getByRole('button', { name:'Watch with Sam' }).click();
  assert.deepEqual(await page.locator('#showGrid [data-id]').evaluateAll(cards => cards.map(card => card.dataset.id)), ['short']);
  await page.getByRole('button', { name:'Surprise Me' }).click();
  await page.locator('#surpriseRuntime').fill('30');
  await page.getByRole('button', { name:'Pick a show' }).click();
  assert.equal(await page.locator('#detailContent .detail-title').innerText(), 'Short Series');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width:390, height:840 });
  await page.getByRole('button', { name:'Add Show', exact:true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'modalTitle');
  await page.locator('#fNotes').focus();
  const viewport = await page.evaluate(() => {
    Object.defineProperties(visualViewport, { height:{ value:360 }, offsetTop:{ value:25 } });
    visualViewport.dispatchEvent(new Event('resize'));
    const body = document.querySelector('#addModal .modal-body');
    return { css: getComputedStyle(document.getElementById('addModal')).height, offset: body.scrollTop };
  });
  assert.equal(viewport.css, '360px');
  assert.ok(viewport.offset > 0);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await context.close();
}

async function testImportAndMetadata(browser) {
  const searched = [];
  const omdb = [];
  const future = '2090-01-01';
  let releaseLimit = true;
  const { context, page, errors } = await openPage(browser, {
    fixture:[],
    extra:{ tmdb_api_key:'fixture', omdb_api_key:'fixture' },
    routes:async (route, url) => {
      if (url.hostname === 'api.themoviedb.org') {
        if (url.pathname.includes('/search/tv')) {
          const title = url.searchParams.get('query');
          searched.push(title);
          if (releaseLimit && title === 'New Show') {
            releaseLimit = false;
            await route.fulfill({ status:429, headers:{ 'Retry-After':'0.01' } });
          } else await route.fulfill({ json:{ results:title === 'New Show' ? [
            { id:42, name:title, first_air_date:'2025-01-01', poster_path:'/" onerror="alert(1)' },
          ] : [] } });
        } else if (url.pathname === '/3/tv/42') {
          await route.fulfill({ json:{
            name:'New Show', first_air_date:'2025-01-01', next_episode_to_air:{ air_date:future, season_number:2, episode_number:1 },
            episode_run_time:[30], number_of_episodes:8, number_of_seasons:1, external_ids:{ imdb_id:'tt1234567' },
          } });
        } else if (url.pathname === '/3/tv/43') {
          await route.fulfill({ json:{ name:'Legacy Show', number_of_seasons:1, number_of_episodes:2 } });
        } else if (url.pathname === '/3/tv/43/season/1') {
          await route.fulfill({ json:{ episodes:[{ runtime:21 }, { runtime:25 }, { runtime:null }] } });
        } else await route.fulfill({ status:404 });
        return true;
      }
      if (url.hostname === 'www.omdbapi.com') {
        omdb.push(url.searchParams.get('type'));
        await route.fulfill({ json:{ Ratings:[{ Source:'Rotten Tomatoes', Value:'90%' }] } });
        return true;
      }
      return false;
    },
  });
  await page.getByRole('button', { name:'Add Show' }).click();
  const search = page.locator('#searchInput');
  await search.fill('New Show');
  await page.locator('.result-title').getByText('New Show').waitFor();
  assert.equal(await page.locator('#searchResults img').getAttribute('onerror'), null);
  await search.fill('');
  await search.fill('New Show');
  await page.locator('.result-title').getByText('New Show').waitFor();
  assert.deepEqual(searched, ['New Show','New Show']);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name:'Paste List' }).click();
  const pasted = '# Watch list\n1. **New Show (2025)**\n- Unmatched\n- Unmatched';
  await page.locator('#pasteShows').fill(pasted);
  await page.getByRole('button', { name:'Review shows' }).click();
  await page.getByRole('button', { name:'Back', exact:true }).click();
  assert.equal(await page.locator('#pasteShows').inputValue(), pasted);
  await page.getByRole('button', { name:'Review shows' }).click();
  await page.getByRole('button', { name:'Add selected shows' }).click();
  await page.locator('#showGrid .card-title').getByText('New Show').waitFor();
  assert.equal(await page.locator('#showGrid .card-title').count(), 2);
  await page.getByRole('button', { name:'Undo', exact:true }).click();
  assert.equal(await page.locator('#showGrid .card-title').count(), 0);
  await page.keyboard.press('Control+Shift+Z');
  assert.equal(await page.locator('#showGrid .card-title').count(), 2);

  await page.locator('#showGrid .card-title').getByText('New Show').click();
  assert.equal(await page.getByRole('link', { name:'IMDb', exact:true }).getAttribute('href'), 'https://www.imdb.com/title/tt1234567/');
  await page.getByText('Next episode', { exact:false }).waitFor();
  await page.getByRole('button', { name:'Edit', exact:true }).click();
  await page.locator('#fEpisodeRuntime').fill('');
  await page.getByRole('button', { name:'Save', exact:true }).click();
  await page.evaluate(async () => {
    shows.push({ id:'legacy', title:'Legacy Show', tmdbId:43 });
    await backfillBingeData();
  });
  assert.equal(await page.evaluate(() => shows.find(show => show.tmdbId === 42).episodeRuntime), null);
  assert.equal(await page.evaluate(() => shows.find(show => show.tmdbId === 43).episodeRuntime), 23);
  assert.ok(omdb.length && omdb.every(type => type === 'series'));

  await page.getByRole('button', { name:'Export CSV' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name:'All shows', exact:true }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'tv-reverie.csv');
  assert.match(fs.readFileSync(await file.path(), 'utf8'), /"New Show","2025"/);
  assert.deepEqual(errors, []);
  await context.close();
}

async function testCloud(browser) {
  const initial = { tvshows:[{ id:'series', title:'Series', notes:'Original' }, { id:'delete', title:'Delete me' }], categorySettings:{} };
  let row = { data:initial, updated_at:'2025-01-01T00:00:00.000Z' };
  let conflict = true;
  let readFailure = false;
  let writes = 0;
  const { context, page, errors } = await openPage(browser, {
    fixture:initial.tvshows,
    extra:{
      _sb_url:'https://fixture.supabase.co', _sb_key:'fixture', _sb_email:'a@example.test',
      category_settings_tvshows_v1:'{}', _sb_pass:'obsolete',
    },
    routes:async (route, url) => {
      if (url.hostname === 'unpkg.com') {
        await route.fulfill({ contentType:'text/javascript', body:`
          window.supabase = { createClient() {
            const user = { id:'person', email:'a@example.test' };
            const request = async (method, input) => (await fetch('/cloud-fixture', {
              method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ method, ...input })
            })).json();
            return {
              auth:{ getSession:async () => ({ data:{ session:{ user } } }), onAuthStateChange() {} },
              from:() => ({
                select:() => ({ eq:() => ({ maybeSingle:() => request('read') }) }),
                update:payload => ({ eq:() => ({ eq:(_, version) => ({ select:() => request('update', { version, payload }) }) }) }),
                insert:payload => request('insert', { payload })
              }),
            };
          } };
        ` });
        return true;
      }
      if (url.pathname !== '/cloud-fixture') return false;
      const { method, version, payload } = route.request().postDataJSON();
      if (method === 'read') await route.fulfill({ json:readFailure ? { error:{ message:'Offline' } } : { data:row } });
      else if (method === 'update') {
        if (conflict) {
          conflict = false;
          row = { data:{
            tvshows:[{ ...initial.tvshows[0], creator:'Remote' }, { id:'remote', title:'Other device' }],
            categorySettings:JSON.parse('{"__proto__":{"detached":true}}'),
          }, updated_at:'2025-02-01T00:00:00.000Z' };
        }
        if (version !== row.updated_at) await route.fulfill({ json:{ data:[] } });
        else {
          writes++;
          row = payload;
          await route.fulfill({ json:{ data:[{ updated_at:payload.updated_at }] } });
        }
      } else await route.fulfill({ json:{ error:{ code:'23505', message:'Already exists' } } });
      return true;
    },
  });
  await page.waitForFunction(() => window._sbForceSync && document.getElementById('_sb_cloud_btn').title === 'Loaded from cloud');
  assert.equal(await page.evaluate(() => localStorage.getItem('_sb_pass')), null);
  await page.evaluate(async () => {
    shows[0].notes = 'Local change';
    save();
    await window._sbForceSync();
  });
  assert.equal(writes, 1);
  assert.deepEqual(row.data.tvshows.map(show => show.id), ['series','remote']);
  assert.equal(row.data.tvshows[0].creator, 'Remote');
  assert.equal(row.data.tvshows[0].notes, 'Local change');
  assert.equal(Object.hasOwn(row.data.categorySettings, '__proto__'), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('_sb_pending_tvshows')), null);

  await page.locator('#showGrid [data-id=series]').click();
  await page.getByRole('button', { name:'Edit', exact:true }).click();
  await page.locator('#fNotes').fill('Open draft');
  row = { data:{ ...row.data, tvshows:row.data.tvshows.map(show => show.id === 'series' ? { ...show, creator:'Remote edit during draft' } : show) },
    updated_at:'2090-01-01T00:00:00.000Z' };
  await page.evaluate(() => window._sbForceSync());
  assert.equal(await page.locator('#fNotes').inputValue(), 'Open draft');
  await page.getByRole('button', { name:'Save', exact:true }).click();
  await page.evaluate(() => window._sbForceSync());
  assert.equal(row.data.tvshows[0].creator, 'Remote edit during draft');
  assert.equal(row.data.tvshows[0].notes, 'Open draft');
  const successfulWrites = writes;

  readFailure = true;
  await page.evaluate(async () => {
    shows[0].notes = 'Offline edit';
    save();
    await window._sbForceSync();
  });
  assert.equal(writes, successfulWrites);
  assert.equal(await page.evaluate(() => localStorage.getItem('_sb_pending_tvshows')), '1');
  assert.deepEqual(errors, []);
  await context.close();
}

(async () => {
  const browser = await chromium.launch({
    headless:true,
    executablePath:process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  try {
    for (const [name, run] of [
      ['mobile viewport, detached search, sorting, queues, and bulk edit', testLibrary],
      ['TMDB retry/cache, paste review, metadata, and export', testImportAndMetadata],
      ['optimistic cloud writes merge device conflicts and preserve offline data', testCloud],
    ]) {
      await run(browser);
      console.log('PASS ' + name);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
