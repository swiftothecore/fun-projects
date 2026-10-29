/* Isolated rendering and keyboard regressions. All storage/network data is fixture-owned.
 * WATCHLIST_APP_ROOT may point to an original snapshot to prove each failure.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WATCHLIST_PLAYWRIGHT_PATH || 'playwright');
const root = process.env.WATCHLIST_APP_ROOT || path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:8765/my-watchlist/';
const cases = [];
const test = (name, run, width = 1440) => cases.push({ name, run, width });
const film = { id: 'a', title: 'Alpha', streaming: {}, dateAdded: '2026-10-10T12:00:00Z' };

test('desktop search Escape clears the mobile search field too', async (page) => {
  await page.evaluate(() => onSearchBarInput('Alpha'));
  await page.locator('#searchBar').focus();
  await page.keyboard.press('Escape');
  assert.deepEqual(
    await page.evaluate(() => [
      state.searchQuery,
      document.getElementById('mobileSearchBarInput').value,
      document.getElementById('mobileSearchBar').classList.contains('msb-active'),
    ]),
    ['', '', false]
  );
});

test('uppercase shifted redo shortcut restores the redo snapshot', async (page) => {
  await page.evaluate(() => {
    state.redoStack = [[...state.movies]];
    state.movies = [];
    document.activeElement.blur();
  });
  await page.keyboard.press('Control+Shift+Z');
  assert.equal(await page.evaluate(() => state.movies[0]?.id), 'a');
});

test('Enter on the add modal close button closes without saving', async (page) => {
  await page.evaluate(() => {
    openAddModal();
    document.getElementById('fTitle').value = 'Do not add this';
  });
  await page.locator('#addModal .modal-close').focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(
    await page.evaluate(() => [
      state.movies.length,
      document.getElementById('addModal').classList.contains('open'),
    ]),
    [1, false]
  );
});

test('Enter on a service chip toggles that chip without saving', async (page) => {
  await page.evaluate(() => {
    openAddModal();
    document.getElementById('fTitle').value = 'Draft';
  });
  const chip = page.locator('#addModal .toggle-chip[data-service="netflix"][data-type="direct"]');
  await chip.focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(
    await page.evaluate(() => [
      state.movies.length,
      document.getElementById('addModal').classList.contains('open'),
      document
        .querySelector('#addModal .toggle-chip[data-service="netflix"][data-type="direct"]')
        .classList.contains('active'),
    ]),
    [1, true, true]
  );
});

test('Enter on the detail Edit button opens editing without marking watched', async (page) => {
  await page.evaluate(() => openDetail('a'));
  await page.locator('#detailModal .detail-primary-actions button').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.deepEqual(
    await page.evaluate(() => [
      !!state.movies[0].watched,
      document.getElementById('addModal').classList.contains('open'),
      state.editingId,
    ]),
    [false, true, 'a']
  );
});

test('Cmd/Ctrl+K keeps keyboard focus inside an open modal', async (page) => {
  await page.evaluate(() => openDetail('a'));
  await page.locator('#detailModal .modal-close').focus();
  await page.keyboard.press('Control+k');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('#detailModal')), true);
});

test('re-entering bulk selection preserves selection and count', async (page) => {
  assert.equal(
    await page.evaluate(() => {
      enterSelectMode();
      toggleSelect('a');
      enterSelectMode();
      return (
        state.selectedIds.has('a') &&
        document.getElementById('bulkCount').textContent === '1 selected'
      );
    }),
    true
  );
});

for (const view of ['grid', 'list']) {
  test(`${view} search respects the chosen sort within equal-ranked matches`, async (page) => {
    assert.deepEqual(
      await page.evaluate((view) => {
        state.movies = [
          { id: 'z', title: 'Zeta', notes: 'same', streaming: {} },
          { id: 'a', title: 'Alpha', notes: 'same', streaming: {} },
        ];
        state.currentView = view;
        state.currentSort = 'title-asc';
        onSearchBarInput('same');
        return [...document.querySelectorAll('#movieGrid [data-id]')].map((el) => el.dataset.id);
      }, view),
      ['a', 'z']
    );
  });
}

for (const shortcut of ['Control+k', '/']) {
  test(`${shortcut} focuses the visible mobile search input`, async (page) => {
    await page.keyboard.press(shortcut);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'mobileSearchBarInput');
  }, 390);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.WATCHLIST_BROWSER ||
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  let failed = 0;
  try {
    for (const { name, run, width } of cases) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
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
      await page.addInitScript((film) => {
        localStorage.setItem('watchlist_v2', JSON.stringify([film]));
        localStorage.setItem('christmas_watchlist_v1', '[]');
      }, film);
      try {
        await page.goto(base);
        await page.waitForLoadState('load');
        await run(page);
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch (e) {
        failed++;
        console.log('FAIL ' + name + ' — ' + e.message.split('\n').slice(0, 8).join(' '));
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
