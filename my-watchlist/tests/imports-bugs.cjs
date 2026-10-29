/* Additional isolated import regressions. No live API or personal browser data is used.
 * WATCHLIST_APP_ROOT supports verifying each case against the original source.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.WATCHLIST_PLAYWRIGHT_PATH || 'playwright');
const root = process.env.WATCHLIST_APP_ROOT || path.resolve(__dirname, '..');
const base = 'http://127.0.0.1:8765/my-watchlist/';
const cases = [];
function test(name, run) {
  cases.push({ name, run });
}

test('reopening Export does not leave the page scroll locked', () => {
  openExportModal();
  openExportModal();
  closeExportModal();
  return state._scrollLockCount === 0 && !document.body.classList.contains('modal-open');
});

test('categorising a film refreshes the visible service filter', () => {
  state.currentFilter = 'netflix';
  render();
  openImportModal();
  renderImportCategorise();
  assignServiceFromCategorise('a', 'netflix');
  closeImportModal();
  return !!document.querySelector('#movieGrid [data-id="a"]');
});

test('undoing a categorisation refreshes the main film cards', async () => {
  state.currentFilter = 'netflix';
  openImportModal();
  renderImportCategorise();
  assignServiceFromCategorise('a', 'netflix');
  render();
  await new Promise((resolve) => setTimeout(resolve, 350));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  closeImportModal();
  return !state.movies[0].streaming.netflix && !document.querySelector('#movieGrid [data-id="a"]');
});

test('a new categorisation session cannot undo an old assignment', async () => {
  openImportModal();
  renderImportCategorise();
  assignServiceFromCategorise('a', 'netflix');
  await new Promise((resolve) => setTimeout(resolve, 350));
  closeImportModal();
  state.movies[0].streaming = { disney: { direct: true } };
  openImportModal();
  renderImportCategorise();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  return !!state.movies[0].streaming.disney;
});

test('the last selected CSV wins when file reads finish out of order', () => {
  const readers = [];
  window.FileReader = class {
    constructor() { readers.push(this); }
    readAsText() {}
  };
  openImportModal();
  _readImportFile({ name: 'old.csv' });
  _readImportFile({ name: 'new.csv' });
  readers[1].onload({ target: { result: 'Name,Year,Watched Date\nNew,2025,2026-10-01' } });
  readers[0].onload({ target: { result: 'Name,Year,Watched Date\nOld,2024,2026-10-01' } });
  return state._importRows[0].Name === 'New' && document.getElementById('importBody').textContent.includes('new.csv');
});

test('a file read from a closed import cannot replace a new session', () => {
  let reader;
  window.FileReader = class {
    constructor() { reader = this; }
    readAsText() {}
  };
  openImportModal();
  _readImportFile({ name: 'old.csv' });
  closeImportModal();
  openImportModal();
  reader.onload({ target: { result: 'Name,Year,Watched Date\nOld,2024,2026-10-01' } });
  return state._importRows.length === 0 && !!document.getElementById('importDropzone');
});

test('changing back to CSV selection invalidates a pending read', () => {
  let reader;
  window.FileReader = class {
    constructor() { reader = this; }
    readAsText() {}
  };
  openImportModal();
  _readImportFile({ name: 'old.csv' });
  _renderImportSelect();
  reader.onload({ target: { result: 'Name,Year,Watched Date\nOld,2024,2026-10-01' } });
  return !!document.getElementById('importDropzone');
});

test('an older custom search cannot replace a newer result for the same paste item', async () => {
  state.tmdbKey = 'fixture';
  openPasteImportModal();
  state._pasteItems = [{ inputTitle: 'Original', results: [{ id: 1, title: 'Original' }], selectedIdx: 0, removed: false, showingAlts: false }];
  _renderPasteReview();
  _pasteToggleAlts(0);
  const requests = [];
  window.fetch = () => new Promise((resolve) => requests.push(resolve));
  document.getElementById('pasteAltSearch-0').value = 'Old query';
  const first = _pasteCustomSearch(0);
  _pasteToggleAlts(0);
  _pasteToggleAlts(0);
  document.getElementById('pasteAltSearch-0').value = 'New query';
  const second = _pasteCustomSearch(0);
  requests[1]({ ok: true, json: async () => ({ results: [{ id: 3, title: 'New result' }] }) });
  await second;
  requests[0]({ ok: true, json: async () => ({ results: [{ id: 2, title: 'Old result' }] }) });
  await first;
  return state._pasteItems[0].results[0].title === 'New result';
});

test('a paste title with no match can be corrected through an alternative search', async () => {
  state.tmdbKey = 'fixture';
  openPasteImportModal();
  state._pasteItems = [{ inputTitle: 'Typo title', results: [], selectedIdx: 0, removed: false, showingAlts: false }];
  _renderPasteReview();
  const change = [...document.querySelectorAll('#paste-card-0 button')].find((button) => button.textContent === 'Change');
  if (!change) return false;
  change.click();
  const input = document.getElementById('pasteAltSearch-0');
  if (!input) return false;
  input.value = 'Correct title';
  window.fetch = async () => ({ ok: true, json: async () => ({ results: [{ id: 2, title: 'Correct title' }] }) });
  await _pasteCustomSearch(0);
  return state._pasteItems[0].results[0].title === 'Correct title' && !document.getElementById('pasteConfirmBtn').disabled;
});

test('closing paste review releases its alternative-result keyboard shortcuts', () => {
  openPasteImportModal();
  state._pasteItems = [{ inputTitle: 'Original', results: [{ id: 1, title: 'Original' }, { id: 2, title: 'Alternative' }], selectedIdx: 0, removed: false, showingAlts: false }];
  _renderPasteReview();
  _pasteToggleAlts(0);
  closePasteImportModal();
  document.activeElement.blur();
  const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  document.dispatchEvent(event);
  return !event.defaultPrevented && state._openAltsIdx === -1;
});

test('diary import backfills the release date of an existing film', async () => {
  openImportModal();
  state._importRows = [{ Name: 'Alpha', Year: '2020', 'Watched Date': '2026-10-01' }];
  _tmdbSearchForImport = async () => ({ id: 1 });
  _tmdbDetailsForImport = async () => ({ d: { title: 'Alpha', release_date: '2020-06-15' }, c: { crew: [] } });
  await runLetterboxdImport();
  return state.movies.length === 1 && state.movies[0].releaseDate === '2020-06-15';
});

test('logging a diary rewatch clears the completed rewatch plan', async () => {
  state.movies[0].watched = true;
  state.movies[0].rewatch = true;
  state.movies[0].rewatchingSoon = true;
  openImportModal();
  state._importRows = [{ Name: 'Alpha', Year: '2020', 'Watched Date': '2026-10-01' }];
  await runLetterboxdImport();
  return state.movies[0].watched && !state.movies[0].rewatch && !state.movies[0].rewatchingSoon;
});

test('a diary metadata request retains details when optional credits fail', async () => {
  state.tmdbKey = 'fixture';
  window.fetch = async (url) => {
    if (url.includes('/credits')) throw new Error('Credits offline');
    return { ok: true, json: async () => ({ title: 'Fetched details', runtime: 95 }) };
  };
  const details = await _tmdbDetailsForImport(2);
  return details?.d.runtime === 95 && details.c === null;
});

test('a paste import retains details when optional credits fail', async () => {
  state.tmdbKey = 'fixture';
  openPasteImportModal();
  state._pasteItems = [{ inputTitle: 'New film', results: [{ id: 2, title: 'New film' }], selectedIdx: 0, removed: false, showingAlts: false }];
  _renderPasteReview();
  window.fetch = async (url) => {
    if (url.includes('/credits')) throw new Error('Credits offline');
    return { ok: true, json: async () => ({ title: 'New film', runtime: 95, overview: 'Fetched synopsis' }) };
  };
  await _pasteConfirmAll();
  const movie = state.movies.find((film) => film.tmdbId === 2);
  return movie?.runtime === 95 && movie.notes === 'Fetched synopsis';
});

test('a failed optional paste alias lookup preserves normal search results', async () => {
  state.tmdbKey = 'fixture';
  openPasteImportModal();
  window.fetch = async (url) => {
    if (url.includes('/movie/10681')) throw new Error('Alias offline');
    return { ok: true, json: async () => ({ results: [{ id: 2, title: 'Usable result' }] }) };
  };
  await _runPasteSearch(['wall e']);
  return state._pasteItems[0].results[0]?.title === 'Usable result';
});

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.WATCHLIST_BROWSER || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  });
  let failed = 0;
  try {
    for (const { name, run } of cases) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Australia/Melbourne' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith(base)) {
          const file = path.join(root, new URL(url).pathname.slice('/my-watchlist/'.length) || 'index.html');
          if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            return route.fulfill({
              body: fs.readFileSync(file),
              contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
            });
          }
        }
        return route.abort();
      });
      await page.addInitScript(() => {
        localStorage.setItem('watchlist_v2', JSON.stringify([{ id: 'a', title: 'Alpha', year: '2020', streaming: {}, dateAdded: '2026-10-10T12:00:00Z' }]));
        localStorage.setItem('christmas_watchlist_v1', '[]');
      });
      try {
        await page.goto(base);
        await page.waitForLoadState('load');
        assert.equal(await page.evaluate(run), true, errors.join('; ') || 'Behavior did not match expectation');
        assert.deepEqual(errors, []);
        console.log('PASS ' + name);
      } catch (error) {
        failed++;
        console.log('FAIL ' + name + ' — ' + error.message.split('\n').slice(0, 3).join(' '));
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`${cases.length - failed}/${cases.length} import regressions passed`);
  if (failed) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
