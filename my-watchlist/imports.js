// Letterboxd CSV import/export, service categorisation, and paste-list review/import.
// Classic scripts intentionally expose handler functions to inline HTML events.

function openExportModal() {
  if (document.getElementById('exportModal').classList.contains('open')) return;
  state._exportScope = 'unwatched';
  _renderExportSelect();
  document.getElementById('exportModal').classList.add('open');
  lockScroll();
}

function closeExportModal() {
  if (!document.getElementById('exportModal').classList.contains('open')) return;
  document.getElementById('exportModal').classList.remove('open');
  unlockScroll();
}

function handleExportOverlay(e) {
  if (e.target === document.getElementById('exportModal')) closeExportModal();
}

function _exportPool() {
  // Respects Christmas Mode context — exports whichever list is currently active,
  // and never includes graveyarded films (already given up on, not "to watch").
  return state.movies.filter((m) => !m.graveyard);
}

function setExportScope(scope) {
  state._exportScope = scope;
  _renderExportSelect();
}

function _renderExportSelect() {
  const pool = _exportPool();
  const unwatchedCount = pool.filter((m) => !m.watched).length;
  const allCount = pool.length;
  const listLabel = state.christmasMode ? 'Christmas films' : 'films';
  document.getElementById('exportBody').innerHTML = `
    <div class="import-step-instructions">
      <p>Generate a CSV file of your${state.christmasMode ? ' Christmas' : ''} watchlist that Letterboxd can import.</p>
      <ol>
        <li>Pick which films to include below and click <strong>Download CSV</strong></li>
        <li>On Letterboxd, open your <a class="text-gold" href="https://letterboxd.com/watchlist/" target="_blank" rel="noopener">Watchlist</a>, then find the <strong>Import</strong> option</li>
        <li>Upload the downloaded file — films with a TMDB match will match exactly, others by title &amp; year</li>
      </ol>
    </div>
    <div class="export-scope-options">
      <button class="export-scope-btn${state._exportScope === 'unwatched' ? ' active' : ''}" onclick="setExportScope('unwatched')">
        <span>Unwatched ${listLabel}</span><span class="export-scope-count">${unwatchedCount}</span>
      </button>
      <button class="export-scope-btn${state._exportScope === 'all' ? ' active' : ''}" onclick="setExportScope('all')">
        <span>All ${listLabel}</span><span class="export-scope-count">${allCount}</span>
      </button>
    </div>
    <button class="btn btn-primary export-download-button" onclick="runLetterboxdExport()">Download CSV</button>
  `;
}

// Letterboxd's CSV spec: quote fields containing commas/quotes/newlines,
// and escape internal quotes with a backslash (NOT doubled, per their docs).
function _lbCsvField(v) {
  if (v === null || v === undefined) return '';
  v = String(v);
  if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '\\"') + '"';
  return v;
}

function runLetterboxdExport() {
  const pool = _exportPool();
  const list = state._exportScope === 'unwatched' ? pool.filter((m) => !m.watched) : pool;
  if (!list.length) {
    showInfoToast('Nothing to export.', 2500);
    return;
  }
  const header = 'tmdbID,Title,Year,Directors';
  const rows = list.map((m) =>
    [m.tmdbId || '', m.title || '', m.year || '', m.director || ''].map(_lbCsvField).join(',')
  );
  const csv = [header, ...rows].join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.christmasMode ? 'christmas-' : ''}watchlist-letterboxd-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closeExportModal();
  showInfoToast(
    `Exported ${list.length} film${list.length === 1 ? '' : 's'} for Letterboxd.`,
    3000
  );
}

function openImportModal() {
  if (document.getElementById('importModal').classList.contains('open')) return;
  state._importRows = [];
  state._importSnap = null;
  state._importActive = false;
  state._importCategoriseSkipped = new Set();
  state._lastCategoriseAction = null;
  _renderImportSelect();
  document.getElementById('importModal').classList.add('open');
  lockScroll();
}

function closeImportModal() {
  if (state._importActive || !document.getElementById('importModal').classList.contains('open'))
    return;
  document.getElementById('importModal').classList.remove('open');
  state._importReadSeq = (state._importReadSeq || 0) + 1;
  unlockScroll();
}

function handleImportOverlay(e) {
  if (e.target === document.getElementById('importModal')) closeImportModal();
}

// ── CSV parser ──
function _parseCSVLine(line) {
  const out = [];
  let cur = '',
    inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function _parseLetterboxdCSV(text) {
  // Split records only outside quoted fields. A title may span physical lines.
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records = [];
  let record = '',
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      record += ch;
      if (quoted && input[i + 1] === '"') record += input[++i];
      else quoted = !quoted;
    } else if (ch === '\n' && !quoted) {
      if (record.trim()) records.push(record);
      record = '';
    } else record += ch;
  }
  if (record.trim()) records.push(record);
  if (quoted || records.length < 2) return [];
  const headers = _parseCSVLine(records[0]);
  return records.slice(1).map((line) => {
    const values = _parseCSVLine(line);
    return Object.fromEntries(headers.map((header, i) => [header, values[i] || '']));
  });
}

function diaryDateISO(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T12:00:00') : null;
  return date && Number.isFinite(date.getTime()) && localDateStr(date) === value
    ? date.toISOString()
    : new Date().toISOString();
}

// ── Step 1: file selection UI ──
function _renderImportSelect() {
  state._importReadSeq = (state._importReadSeq || 0) + 1;
  const hasKey = !!state.tmdbKey;
  const uncatCount = state.movies.filter((m) => hasNoStreaming(m) && !m.graveyard).length;
  document.getElementById('importBody').innerHTML = `
    <div class="import-step-instructions">
      <p>Import your watch history from Letterboxd. Films already in your list will have their watched date updated with the Letterboxd date.</p>
      <ol>
        <li>On Letterboxd, go to <strong>Settings → Import &amp; Export</strong></li>
        <li>Under <em>Export</em>, click <strong>Export Your Data</strong></li>
        <li>Upload the <code>diary.csv</code> file below</li>
      </ol>
    </div>
    ${!hasKey ? `<div class="import-warning">⚠ <strong>No TMDB key set.</strong> Films will be imported with title and date only — no poster, genre, or director. <a class="text-gold" href="#" onclick="closeImportModal();showApiSettings();return false;">Add a key</a> for full details.</div>` : ''}
    <div class="import-dropzone" id="importDropzone"
         ondragover="importDragOver(event)"
         ondragleave="importDragLeave(event)"
         ondrop="importDrop(event)"
         onclick="document.getElementById('importFileInput').click()">
      <span class="import-dropzone-icon">📂</span>
      <div class="import-dropzone-text">Drag &amp; drop <strong>diary.csv</strong> here</div>
      <div class="import-dropzone-hint">or click to browse</div>
    </div>
    <input type="file" id="importFileInput" accept=".csv,text/csv" style="display:none" onchange="importFileChosen(this)">
    ${
      uncatCount > 0
        ? `
    <div class="import-categorise-prompt">
      <div>
        <div class="import-categorise-prompt-text-title">🗂 Assign streaming services</div>
        <div class="import-categorise-prompt-text-meta">${uncatCount} film${uncatCount !== 1 ? 's' : ''} in your list have no service set yet</div>
      </div>
      <button class="btn btn-ghost btn-sm no-shrink" onclick="renderImportCategorise()">Review →</button>
    </div>`
        : ''
    }`;
}

function importDragOver(e) {
  e.preventDefault();
  document.getElementById('importDropzone')?.classList.add('drag-over');
}

function importDragLeave(e) {
  document.getElementById('importDropzone')?.classList.remove('drag-over');
}

function importDrop(e) {
  e.preventDefault();
  document.getElementById('importDropzone')?.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) _readImportFile(file);
}

function importFileChosen(input) {
  const file = input.files?.[0];
  if (file) _readImportFile(file);
}

function _readImportFile(file) {
  const readSeq = (state._importReadSeq = (state._importReadSeq || 0) + 1);
  const reader = new FileReader();
  reader.onload = (e) => {
    if (
      readSeq !== state._importReadSeq ||
      !document.getElementById('importModal').classList.contains('open')
    ) return;
    const rows = _parseLetterboxdCSV(e.target.result).filter((row) => row.Name?.trim());
    if (!rows.length || !('Name' in (rows[0] || {}))) {
      const dz = document.getElementById('importDropzone');
      if (dz)
        dz.insertAdjacentHTML(
          'afterend',
          `<p class="import-read-error">
          Couldn't read this file. Make sure it's a Letterboxd <code>diary.csv</code> export.</p>`
        );
      return;
    }
    // Deduplicate rewatches: keep the entry with the most recent Watched Date
    const seen = new Map();
    for (const row of rows) {
      const key = (row.Name || '').toLowerCase().trim() + '|' + (row.Year || '');
      const existing = seen.get(key);
      const d = row['Watched Date'] || '';
      if (!existing || d > (existing['Watched Date'] || '')) seen.set(key, row);
    }
    state._importRows = [...seen.values()];
    _renderImportPreview(state._importRows, file.name);
  };
  reader.readAsText(file);
}

// ── Step 2: preview & confirm ──
function _renderImportPreview(rows, filename) {
  const alreadyIn = rows.filter((r) => _findExistingForImport(null, r.Name, r.Year)).length;
  const newCount = rows.length - alreadyIn;
  const hasKey = !!state.tmdbKey;
  const preview = rows
    .slice(0, 6)
    .map(
      (r) =>
        `<li>${esc(r.Name || '')}${r.Year ? ' (' + esc(r.Year) + ')' : ''}${r['Watched Date'] ? ' · ' + esc(r['Watched Date']) : ''}</li>`
    )
    .join('');
  const more = rows.length > 6 ? `<li class="text-muted">…and ${rows.length - 6} more</li>` : '';

  document.getElementById('importBody').innerHTML = `
    <div class="import-file-confirmed">
      <span class="import-file-icon">✓</span>
      <div class="flex-content">
        <div class="import-file-name">${esc(filename)}</div>
        <div class="import-file-meta">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} found${alreadyIn ? ` · ${alreadyIn} already in your list` : ''}</div>
      </div>
      <button class="btn btn-ghost btn-sm no-shrink" onclick="_renderImportSelect()">Change</button>
    </div>
    <div class="import-warning">
      ${alreadyIn ? `<strong>${alreadyIn} film${alreadyIn !== 1 ? 's' : ''}</strong> already in your list — their watched date will be overridden with the Letterboxd date. ` : ''}
      ${newCount ? `<strong>${newCount} new film${newCount !== 1 ? 's' : ''}</strong> will be added as watched${hasKey ? ' with TMDB metadata (poster, genre, director)' : ' with title and date only'}. ` : ''}
      Streaming service info is not imported.
    </div>
    <div class="import-preview-section">
      <div class="import-preview-label">Preview</div>
      <ul class="import-preview-list">${preview}${more}</ul>
    </div>
    <button class="btn btn-primary button-full" onclick="runLetterboxdImport()">
      📥 Import ${rows.length} Film${rows.length !== 1 ? 's' : ''}
    </button>`;
}

// ── Existing-movie matcher ──
function _findExistingForImport(tmdbId, title, year) {
  // Match against the active list — that's the list new films are pushed into,
  // saved by save(), and snapshotted for undo.
  const pool = state.movies;
  if (tmdbId) {
    const m = pool.find((x) => x.tmdbId && x.tmdbId === tmdbId);
    if (m) return m;
  }
  const tl = (title || '').toLowerCase().trim();
  return (
    pool.find(
      (m) => m.title.toLowerCase().trim() === tl && String(m.year || '') === String(year || '')
    ) || null
  );
}

// ── TMDB helpers ──
async function _tmdbSearchForImport(title, year) {
  if (!state.tmdbKey) return null;
  try {
    const q = title
      .replace(/[-\u2010-\u2015]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const base = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(state.tmdbKey)}&query=${encodeURIComponent(q)}&include_adult=false`;
    const res = await fetch(year ? base + '&year=' + encodeURIComponent(year) : base);
    if (!res.ok) return null;
    const data = await res.json();
    let results = data.results || [];
    // Year filter sometimes causes misses — retry without it
    if (!results.length && year) {
      const res2 = await fetch(base);
      if (res2.ok) {
        const d2 = await res2.json();
        results = d2.results || [];
      }
    }
    return results[0] || null;
  } catch {
    return null;
  }
}

async function _tmdbDetailsForImport(id) {
  if (!state.tmdbKey || !id) return null;
  try {
    const [dr, c] = await Promise.all([
      fetch(
        `https://api.themoviedb.org/3/movie/${id}?api_key=${encodeURIComponent(state.tmdbKey)}`
      ),
      fetchMovieCredits(id),
    ]);
    if (!dr.ok) return null;
    const d = await dr.json();
    return { d, c };
  } catch {
    return null;
  }
}

// ── Main import runner ──
async function runLetterboxdImport() {
  if (!state._importRows.length || state._importActive) return;
  state._importActive = true;

  // Snapshot for undo
  state._importSnap = JSON.parse(JSON.stringify(state.movies));

  const total = state._importRows.length;
  let added = 0,
    updated = 0,
    noTmdb = 0;

  // Render progress UI
  document.getElementById('importBody').innerHTML = `
    <div class="import-progress-wrap">
      <div class="import-progress-title">
        Importing ${total} film${total !== 1 ? 's' : ''}…
        ${!state.tmdbKey ? '<span class="muted-caption"> (no TMDB key — title and date only)</span>' : ''}
      </div>
      <div class="import-progress-bar"><div class="import-progress-fill" id="impFill"></div></div>
      <div class="import-progress-meta">
        <span class="import-progress-label" id="impLabel">Starting…</span>
        <span class="import-progress-count" id="impCount">0 / ${total}</span>
      </div>
    </div>`;

  for (let i = 0; i < state._importRows.length; i++) {
    const row = state._importRows[i];
    const title = row.Name || '';
    const year = row.Year || '';
    // Letterboxd diary has both "Date" (log date) and "Watched Date" (actual viewing date)
    const watchedStr = row['Watched Date'] || row['Date'] || '';
    const watchedISO = diaryDateISO(watchedStr);

    // Update progress bar
    const pct = Math.round((i / total) * 100);
    const fill = document.getElementById('impFill');
    const label = document.getElementById('impLabel');
    const count = document.getElementById('impCount');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = title + (year ? ' (' + year + ')' : '');
    if (count) count.textContent = `${i} / ${total}`;
    // Yield to browser so the progress bar actually renders
    await new Promise((r) => setTimeout(r, 0));

    try {
      // Fetch TMDB data
      const hit = await _tmdbSearchForImport(title, year);
      const tmdbId = hit?.id || null;
      const details = tmdbId ? await _tmdbDetailsForImport(tmdbId) : null;
      if (!tmdbId) noTmdb++;

      const d = details?.d;
      const c = details?.c;
      const dir = c ? (c.crew || []).find((x) => x.job === 'Director') : null;

      // Match against existing list
      const existing = _findExistingForImport(tmdbId, title, year);

      if (existing) {
        // Always override the watched date with Letterboxd's date
        existing.watched = true;
        existing.watchingSoon = false;
        existing.graveyard = false;
        existing.rewatch = false;
        existing.rewatchingSoon = false;
        existing.dateWatched = watchedISO;
        // Backfill missing metadata while we have it
        if (tmdbId && !existing.tmdbId) existing.tmdbId = tmdbId;
        if (d?.poster_path && !existing.poster) existing.poster = TMDB_IMG + d.poster_path;
        if (d?.runtime && !existing.runtime) existing.runtime = d.runtime;
        if (d?.release_date && !existing.releaseDate) existing.releaseDate = d.release_date;
        if (d?.genres?.length && !existing.genre)
          existing.genre = d.genres.map((g) => g.name).join(', ');
        if (dir && !existing.director) existing.director = dir.name;
        if (d?.vote_average && !existing.rating)
          existing.rating = d.vote_average.toFixed(1) + '/10';
        updated++;
      } else {
        // Add as new watched film
        state.movies.push({
          id: crypto.randomUUID(),
          title: d?.title || title,
          year: d?.release_date ? d.release_date.slice(0, 4) : year,
          genre: d?.genres ? d.genres.map((g) => g.name).join(', ') : '',
          director: dir ? dir.name : '',
          rating: d?.vote_average ? d.vote_average.toFixed(1) + '/10' : '',
          runtime: d?.runtime || undefined,
          poster: d?.poster_path ? TMDB_IMG + d.poster_path : '',
          notes: '',
          otherName: '',
          collection: '',
          category: '',
          tmdbId: tmdbId,
          releaseDate: d?.release_date || undefined,
          watched: true,
          watchingSoon: false,
          graveyard: false,
          streaming: {},
          dateAdded: watchedISO,
          dateWatched: watchedISO,
        });
        added++;
      }
    } catch (err) {
      console.warn('[Import] Failed:', title, err);
      noTmdb++;
    }

    // ~6 films/sec — respectful of TMDB's rate limit
    await new Promise((r) => setTimeout(r, 160));
  }

  // Final tick
  const fill = document.getElementById('impFill');
  if (fill) fill.style.width = '100%';
  await new Promise((r) => setTimeout(r, 80));

  save();
  render();
  state._importActive = false;
  _renderImportResults(added, updated, noTmdb, total);
}

// ── Step 3: results ──
function _renderImportResults(added, updated, noTmdb, total) {
  document.getElementById('importBody').innerHTML = `
    <div class="import-results-header">
      <div class="import-success-icon">✓</div>
      <div class="import-success-title">Import complete</div>
      <div class="muted-caption">${total} entr${total !== 1 ? 'ies' : 'y'} processed</div>
    </div>
    <div class="import-results-stats">
      <div class="import-stat-row">
        <span class="import-stat-label">Films added</span>
        <span class="import-stat-value text-gold">${added}</span>
      </div>
      <div class="import-stat-row">
        <span class="import-stat-label">Films updated</span>
        <span class="import-stat-value">${updated}</span>
      </div>
      ${
        noTmdb > 0
          ? `<div class="import-stat-row">
        <span class="import-stat-label">Not found on TMDB</span>
        <span class="import-stat-value text-muted">${noTmdb}</span>
      </div>`
          : ''
      }
    </div>
    <div class="action-row">
      <button class="btn btn-primary button-fill" onclick="closeImportModal()">Done</button>
      ${state._importSnap ? `<button class="btn btn-ghost" onclick="_undoLetterboxdImport()">Undo Import</button>` : ''}
    </div>`;
}

function _undoLetterboxdImport() {
  if (!state._importSnap) return;
  state.movies = state._importSnap;
  state._importSnap = null;
  save();
  render();
  closeImportModal();
  showInfoToast('Letterboxd import undone.', 3500);
}

// Cmd/Ctrl+Z undoes the last service assignment while the categorise panel is open
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  if (!document.getElementById('importModal').classList.contains('open')) return;
  if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
  const list = document.getElementById('categoriseList');
  if (!list || !state._lastCategoriseAction) return;
  e.preventDefault();
  const { id, streaming, otherName } = state._lastCategoriseAction;
  state._lastCategoriseAction = null;
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  m.streaming = streaming;
  m.otherName = otherName;
  save();
  render();
  // Re-insert the row at the top of the list
  const temp = document.createElement('div');
  temp.innerHTML = _buildCategoriseRow(m);
  list.insertBefore(temp.firstElementChild, list.firstChild);
  const count = list.querySelectorAll('.categorise-film-row').length;
  const countEl = document.getElementById('categoriseCount');
  if (countEl)
    countEl.textContent = count + ' film' + (count !== 1 ? 's' : '') + ' without a service';
});

function renderImportCategorise() {
  const all = state.movies.filter((m) => hasNoStreaming(m) && !m.graveyard);
  const visible = all.filter((m) => !state._importCategoriseSkipped.has(m.id));
  document.getElementById('importBody').innerHTML = `
    <div class="categorise-header">
      <button class="btn btn-ghost btn-sm no-shrink" onclick="_renderImportSelect()">← Back</button>
      <div>
        <div class="import-heading">Assign streaming services</div>
        <div class="import-heading-meta" id="categoriseCount">${visible.length} film${visible.length !== 1 ? 's' : ''} without a service</div>
      </div>
    </div>
    <div id="categoriseList">
      ${visible.length ? visible.map((m) => _buildCategoriseRow(m)).join('') : _categoriseDoneMsg()}
    </div>`;
  // Align each JW chip with its corresponding Skip chip after layout settles
  requestAnimationFrame(() => requestAnimationFrame(_alignJWWithSkip));
}

// Nudge each JW row's right padding so JW sits directly above Skip
function _alignJWWithSkip() {
  document.querySelectorAll('.categorise-film-row').forEach((row) => {
    const skipBtn = row.querySelector('.categorise-svc-chip.skip');
    const jwDiv = row.querySelector('.jw-row');
    if (!skipBtn || !jwDiv) return;
    const skipRect = skipBtn.getBoundingClientRect();
    const containerRect = jwDiv.parentElement.getBoundingClientRect();
    const offset = Math.max(0, containerRect.right - skipRect.right);
    jwDiv.style.paddingRight = offset + 'px';
  });
}

function _categoriseDoneMsg() {
  return `<div class="categorise-done">All films have been assigned a service.</div>`;
}

function _buildCategoriseRow(m) {
  const thumb = m.poster
    ? `<img src="${esc(m.poster)}" class="categorise-film-thumb" onerror="this.style.background='var(--surface2)';this.removeAttribute('src')">`
    : `<div class="categorise-film-thumb"></div>`;
  const meta = [m.year, m.genre ? m.genre.split(',')[0].trim() : null].filter(Boolean).join(' · ');
  const jwUrl = `https://www.justwatch.com/au/search?q=${encodeURIComponent(m.title || '')}`;
  return `<div class="categorise-film-row" id="catrow-${esc(m.id)}">
    ${thumb}
    <div class="flex-content">
      <div class="categorise-film-title">${esc(m.title || '')}</div>
      <div class="categorise-meta-row">
        <div class="categorise-film-meta">${esc(meta || '')}</div>
        <a class="categorise-svc-chip jw-chip no-shrink" href="${esc(jwUrl)}" target="_blank" rel="noopener" title="Find on JustWatch">JW</a>
      </div>
      <div class="categorise-svc-chips categorise-chips-spaced" id="catrow-chips-${esc(m.id)}">
        ${_categoriseChipsHTML(m.id)}
      </div>
    </div>
  </div>`;
}

function _categoriseChipsHTML(id) {
  return `<button class="categorise-svc-chip netflix" onclick="assignServiceFromCategorise(${jsAttr(id)},'netflix')">Netflix</button>
    <button class="categorise-svc-chip disney"  onclick="assignServiceFromCategorise(${jsAttr(id)},'disney')">Disney+</button>
    <button class="categorise-svc-chip prime"   onclick="assignServiceFromCategorise(${jsAttr(id)},'prime')">Prime</button>
    <button class="categorise-svc-chip cinema"  onclick="assignServiceFromCategorise(${jsAttr(id)},'cinema')">Cinema</button>
    <button class="categorise-svc-chip other"   onclick="showCategoriseOtherInput(${jsAttr(id)})">Other</button>
    <button class="categorise-svc-chip skip"    onclick="skipFromCategorise(${jsAttr(id)})">Skip</button>`;
}

function showCategoriseOtherInput(id) {
  const chips = document.getElementById('catrow-chips-' + id);
  if (!chips) return;
  chips.innerHTML = `<input type="text" id="catother-${esc(id)}" placeholder="Service name (e.g. Apple TV)…"
    onkeydown="if(event.key==='Enter')confirmCategoriseOther(${jsAttr(id)});if(event.key==='Escape')restoreCategoriseChips(${jsAttr(id)})">
    <button class="categorise-svc-chip other" onclick="confirmCategoriseOther(${jsAttr(id)})">Set</button>
    <button class="categorise-svc-chip skip"  onclick="restoreCategoriseChips(${jsAttr(id)})">Cancel</button>`;
  setTimeout(() => document.getElementById('catother-' + id)?.focus(), 30);
}

function confirmCategoriseOther(id) {
  const name = (document.getElementById('catother-' + id)?.value || '').trim();
  assignServiceFromCategorise(id, 'other', name);
}

function restoreCategoriseChips(id) {
  const chips = document.getElementById('catrow-chips-' + id);
  if (chips) chips.innerHTML = _categoriseChipsHTML(id);
}

function assignServiceFromCategorise(id, svc, name) {
  const m = state.movies.find((x) => x.id === id);
  if (!m) return;
  // Snapshot for Cmd+Z undo
  state._lastCategoriseAction = { id, streaming: { ...m.streaming }, otherName: m.otherName };
  m.streaming = {};
  m.streaming[svc] = { direct: true, vpn: false, vpnCountry: '' };
  if (svc === 'other' && name) m.otherName = name;
  save();
  render();
  _removeCategoriseRow(id);
}

function skipFromCategorise(id) {
  state._importCategoriseSkipped.add(id);
  _removeCategoriseRow(id);
}

function _removeCategoriseRow(id) {
  const row = document.getElementById('catrow-' + id);
  if (!row) return;
  const h = row.offsetHeight;
  row.style.maxHeight = h + 'px';
  row.style.opacity = '0';
  row.style.paddingTop = '0';
  row.style.paddingBottom = '0';
  row.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    row.style.maxHeight = '0';
  });
  setTimeout(() => {
    row.remove();
    const list = document.getElementById('categoriseList');
    const count = list ? list.querySelectorAll('.categorise-film-row').length : 0;
    const countEl = document.getElementById('categoriseCount');
    if (countEl)
      countEl.textContent = count + ' film' + (count !== 1 ? 's' : '') + ' without a service';
    if (count === 0 && list) list.innerHTML = _categoriseDoneMsg();
  }, 310);
}

// ── Open / close ──────────────────────────────────────────────────────────
function openPasteImportModal() {
  if (document.getElementById('pasteImportModal').classList.contains('open')) return;
  state._pasteSession++;
  state._pasteTitles = '';
  state._pasteItems = [];
  state._pasteCategory = '';
  state._pasteWatched = false;
  state._pasteSearchActive = false;
  state._pasteConfirmActive = false;
  state._pasteSnap = null;
  state._openAltsIdx = -1;
  state._altHighlightIdx = -1;
  state._pasteCatHighlight = -1;
  _renderPasteStep1();
  document.getElementById('pasteImportModal').classList.add('open');
  lockScroll();
}

function closePasteImportModal() {
  if (state._pasteSearchActive || state._pasteConfirmActive) return;
  if (!document.getElementById('pasteImportModal').classList.contains('open')) return;
  document.getElementById('pasteImportModal').classList.remove('open');
  state._pasteSession++;
  state._openAltsIdx = -1;
  state._altHighlightIdx = -1;
  unlockScroll();
}

function handlePasteImportOverlay(e) {
  if (e.target === document.getElementById('pasteImportModal')) closePasteImportModal();
}

// ── Step 1: input ─────────────────────────────────────────────────────────
function _renderPasteStep1() {
  const hasKey = !!state.tmdbKey;
  document.getElementById('pasteImportBody').innerHTML = `
    <div class="paste-instructions">
      Paste a list of film titles — one per line. The best TMDB match for each title is chosen automatically, and you can review and swap results before saving.
      ${!hasKey ? `<br><span class="muted-caption">⚠ No TMDB key — films will be saved with title only. <a class="text-gold" href="#" onclick="closePasteImportModal();showApiSettings();return false;">Add a key</a> for posters and metadata.</span>` : ''}
    </div>
    <div class="spacing-bottom-md">
      <div class="paste-field-label">Film Titles</div>
      <textarea class="paste-textarea" id="pasteTitlesInput" placeholder="The Godfather
2001: A Space Odyssey
Spirited Away
Paddington 2
…one title per line. Markdown checkboxes (- [ ]) are stripped automatically."></textarea>
    </div>
    <div class="spacing-bottom-md">
      <div class="paste-field-label">Add to Category <span class="optional-label">(optional)</span></div>
      <div class="paste-cat-field">
        <input class="paste-cat-input" id="pasteCatInput" type="text" placeholder="e.g. Pixar, Horror Classics…" autocomplete="off"
          value="${esc(state._pasteCategory)}"
          oninput="_filterPasteCatSuggestions()"
          onfocus="_filterPasteCatSuggestions()"
          onblur="setTimeout(_hidePasteCatSuggestions,150)"
          onkeydown="_onPasteCatKeyDown(event)">
        <div id="pasteCategoryDropdown" style="display:none"></div>
      </div>
    </div>
    <div class="paste-watched-row">
      <label class="paste-watched-label">
        <input class="paste-watched-checkbox" type="checkbox" id="pasteWatchedToggle" ${state._pasteWatched ? 'checked' : ''}>
        Mark all as watched
      </label>
    </div>
    <button class="btn btn-primary button-full" onclick="_startPasteSearch()">
      Search TMDB →
    </button>`;
  document.getElementById('pasteTitlesInput').value = state._pasteTitles;
  document.getElementById('pasteTitlesInput').focus();
}

function _startPasteSearch() {
  state._pasteTitles = document.getElementById('pasteTitlesInput').value || '';
  const raw = state._pasteTitles.trim();
  const catInp = document.getElementById('pasteCatInput');
  if (catInp) state._pasteCategory = catInp.value.trim();
  state._pasteWatched = document.getElementById('pasteWatchedToggle').checked;
  const titles = raw
    .split('\n')
    .map((t) => {
      t = t.trim();
      // Strip markdown/todo checkbox prefixes in all common forms:
      // "- [ ] Title", "- [x] Title", "* [X] Title", "[ ] Title", etc.
      t = t.replace(/^[-*+]?\s*\[[xX \t✓✔]\]\s+/, '');
      // Strip remaining leading bullet/dash (e.g. "- Title", "* Title")
      t = t.replace(/^[-*+•]\s+/, '');
      // Strip leading numbered list ("1. ", "2) ")
      t = t.replace(/^\d+[.)]\s+/, '');
      return t.trim();
    })
    .filter(Boolean);
  if (!titles.length) {
    const ta = document.getElementById('pasteTitlesInput');
    if (ta) {
      ta.style.borderColor = 'var(--danger)';
      ta.focus();
    }
    return;
  }
  _runPasteSearch(titles);
}

// ── Step 2: search ────────────────────────────────────────────────────────
async function _runPasteSearch(titles) {
  if (state._pasteSearchActive) return;
  state._pasteSearchActive = true;
  const total = titles.length;
  const hasKey = !!state.tmdbKey;

  document.getElementById('pasteImportBody').innerHTML = `
    <div class="import-progress-wrap">
      <div class="import-progress-title">
        Searching for ${total} film${total !== 1 ? 's' : ''}…
        ${!hasKey ? '<span class="muted-caption"> (no TMDB key)</span>' : ''}
      </div>
      <div class="import-progress-bar"><div class="import-progress-fill" id="pasteFill"></div></div>
      <div class="import-progress-meta">
        <span class="import-progress-label" id="pasteProgLabel">Starting…</span>
        <span class="import-progress-count" id="pasteProgCount">0 / ${total}</span>
      </div>
    </div>`;

  state._pasteItems = [];

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    const fill = document.getElementById('pasteFill');
    const label = document.getElementById('pasteProgLabel');
    const count = document.getElementById('pasteProgCount');
    if (fill) fill.style.width = Math.round((i / total) * 100) + '%';
    if (label) label.textContent = title;
    if (count) count.textContent = `${i} / ${total}`;
    await new Promise((r) => setTimeout(r, 0));

    let results = [];
    if (hasKey) {
      try {
        const q = title
          .replace(/[-\u2010-\u2015]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const aliasKey = q.toLowerCase();
        const aliasKeyStr = aliasKey.replace(/\s+/g, '');
        const aliasId = TMDB_SEARCH_ALIASES[aliasKey] || TMDB_SEARCH_ALIASES[aliasKeyStr] || null;
        const base = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(state.tmdbKey)}&query=${encodeURIComponent(q)}&include_adult=false`;
        const fetches = [fetch(base)];
        if (aliasId)
          fetches.push(
            fetch(
              `https://api.themoviedb.org/3/movie/${aliasId}?api_key=${encodeURIComponent(state.tmdbKey)}`
            )
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null)
          );
        const [res, aliasMovie] = await Promise.all(fetches);
        if (res.ok) {
          const data = await res.json();
          results = (data.results || []).slice(0, 8);
          if (aliasMovie) {
            results = [aliasMovie, ...results.filter((m) => m.id !== aliasMovie.id)];
          }
        }
      } catch (e) {
        /* skip */
      }
    } else {
      // No TMDB key: keep the typed title as a manual entry so it can still be saved
      results = [{ id: null, title, release_date: '', _manual: true }];
    }
    state._pasteItems.push({
      inputTitle: title,
      results,
      selectedIdx: 0,
      removed: false,
      showingAlts: false,
    });
    await new Promise((r) => setTimeout(r, 160));
  }

  const fill = document.getElementById('pasteFill');
  if (fill) fill.style.width = '100%';
  await new Promise((r) => setTimeout(r, 80));
  state._pasteSearchActive = false;
  state._openAltsIdx = -1;
  state._altHighlightIdx = -1;
  _renderPasteReview();
}

// ── Step 3: review ────────────────────────────────────────────────────────
function _renderPasteReview() {
  const adding = _pasteAddingCount();
  const catLine = state._pasteCategory
    ? `<span class="paste-category-name">${esc(state._pasteCategory)}</span>`
    : `<span class="paste-category-none">none set</span>`;
  document.getElementById('pasteImportBody').innerHTML = `
    <div class="paste-review-header">
      <button class="btn btn-ghost btn-sm no-shrink" onclick="_renderPasteStep1()">← Back</button>
      <div class="flex-content">
        <div class="import-heading">Review results</div>
        <div class="import-heading-meta" id="pasteReviewMeta">${_pasteReviewMeta()}</div>
      </div>
    </div>
    ${
      state._pasteCategory
        ? `<div class="paste-category-summary">
      <span class="text-muted">Category:</span>
      ${catLine}
      <button onclick="_renderPasteStep1()" class="paste-change-button" style="color:var(--text-muted);" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color=''">Change</button>
    </div>`
        : ''
    }
    <div id="pasteResultsList">
      ${state._pasteItems.map((item, idx) => _buildPasteCard(item, idx)).join('')}
    </div>
    <div class="paste-confirm-row">
      <button class="btn btn-primary button-fill" id="pasteConfirmBtn"
        onclick="_pasteConfirmAll()" ${adding === 0 ? 'disabled' : ''}>
        Add ${adding} Film${adding !== 1 ? 's' : ''}
      </button>
    </div>`;
}

// ── Category dropdown (paste-specific, mirrors fCategory pattern exactly) ──
function _filterPasteCatSuggestions() {
  const dd = document.getElementById('pasteCategoryDropdown');
  const inp = document.getElementById('pasteCatInput');
  if (!dd || !inp) return;
  const q = inp.value.trim().toLowerCase();
  const cats = getCategoryNames();
  const matches = q ? cats.filter((n) => n.toLowerCase().includes(q)) : cats;
  state._pasteCatHighlight = -1;
  if (!matches.length) {
    dd.style.display = 'none';
    return;
  }
  dd.innerHTML = matches
    .map(
      (n) =>
        `<div class="cat-suggestion" data-name="${esc(n)}" onmousedown="_pickPasteCategory(${jsAttr(n)})">
      <span class="cat-icon">&#128196;</span>${esc(n)}
    </div>`
    )
    .join('');
  // Position using fixed coords so the dropdown escapes the modal's overflow clipping
  const rect = inp.getBoundingClientRect();
  dd.style.top = rect.bottom + 4 + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.style.display = ''; // removes inline "display:none", making element visible
}

function _hidePasteCatSuggestions() {
  state._pasteCatHighlight = -1;
  const dd = document.getElementById('pasteCategoryDropdown');
  if (dd) dd.style.display = 'none';
}

function _pickPasteCategory(name) {
  state._pasteCategory = name;
  const inp = document.getElementById('pasteCatInput');
  if (inp) inp.value = name;
  _hidePasteCatSuggestions();
}

function _onPasteCatKeyDown(e) {
  const dd = document.getElementById('pasteCategoryDropdown');
  if (!dd || dd.style.display === 'none') return;
  const items = dd.querySelectorAll('.cat-suggestion');
  if (!items.length) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state._pasteCatHighlight = Math.min(state._pasteCatHighlight + 1, items.length - 1);
    _updatePasteCatHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state._pasteCatHighlight = Math.max(state._pasteCatHighlight - 1, -1);
    _updatePasteCatHighlight(items);
  } else if (e.key === 'Enter') {
    const target = state._pasteCatHighlight >= 0 ? items[state._pasteCatHighlight] : items[0];
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      _pickPasteCategory(target.dataset.name);
    }
  } else if (e.key === 'Escape') {
    _hidePasteCatSuggestions();
  }
}

function _updatePasteCatHighlight(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === state._pasteCatHighlight));
  if (state._pasteCatHighlight >= 0)
    items[state._pasteCatHighlight].scrollIntoView({ block: 'nearest' });
}

// ── Review helpers ────────────────────────────────────────────────────────
function _pasteReviewMeta() {
  const total = state._pasteItems.length;
  const found = state._pasteItems.filter((i) => i.results.length > 0).length;
  const missing = total - found;
  const removed = state._pasteItems.filter((i) => i.removed && i.results.length > 0).length;
  const adding = _pasteAddingCount();
  const parts = [`${adding} of ${total} will be added`];
  if (missing) parts.push(`${missing} not found`);
  if (removed) parts.push(`${removed} removed`);
  return parts.join(' · ');
}

function _pasteAddingCount() {
  return state._pasteItems.filter((i) => !i.removed && i.results.length > 0).length;
}

function _buildPasteCard(item, idx) {
  const hit = item.results[item.selectedIdx] || null;
  const isRemoved = item.removed;
  const isDupe = hit
    ? !!_findExistingForImport(hit.id, hit.title, (hit.release_date || '').slice(0, 4))
    : false;

  let posterEl, infoEl;
  if (hit) {
    const yr = (hit.release_date || '').slice(0, 4) || '?';
    const vot = hit.vote_average ? ` · ★ ${hit.vote_average.toFixed(1)}` : '';
    posterEl = hit.poster_path
      ? `<img class="paste-result-poster" src="${TMDB_SM}${esc(hit.poster_path)}" alt="" loading="lazy">`
      : `<div class="paste-result-poster-ph">🎬</div>`;
    const origNote =
      item.inputTitle.toLowerCase().trim() !== hit.title.toLowerCase().trim()
        ? `<div class="paste-searched-title">searched: "${esc(item.inputTitle)}"</div>`
        : '';
    infoEl = `
      <div class="paste-result-title">${esc(hit.title)}${isDupe ? '<span class="paste-dupe-badge">In list</span>' : ''}</div>
      <div class="paste-result-meta">${esc(yr)}${vot}</div>${origNote}`;
  } else {
    posterEl = `<div class="paste-result-poster-ph">?</div>`;
    infoEl = `<div class="paste-result-title">${esc(item.inputTitle)}</div>
      <div class="paste-result-notfound">Not found on TMDB</div>`;
  }

  const canSearch = !hit?._manual && (!!hit || !!state.tmdbKey);
  const altsPanel = item.showingAlts && canSearch ? _buildPasteAltsPanel(item, idx) : '';
  const changeCls = item.showingAlts ? 'paste-action-btn pab-active' : 'paste-action-btn';

  return `<div class="paste-result-card ${isRemoved ? 'pr-removed' : ''}" id="paste-card-${idx}">
    <div class="flex-content">
      <div class="paste-card-content">
        ${posterEl}
        <div class="paste-result-info">${infoEl}</div>
        <div class="paste-result-actions">
          ${canSearch ? `<button class="${changeCls}" onclick="_pasteToggleAlts(${idx})">${item.showingAlts ? 'Hide' : 'Change'}</button>` : ''}
          ${
            isRemoved
              ? `<button class="paste-action-btn pab-restore" onclick="_pasteRestore(${idx})">Restore</button>`
              : `<button class="paste-action-btn pab-danger" onclick="_pasteRemove(${idx})">Remove</button>`
          }
        </div>
      </div>
      ${altsPanel}
    </div>
  </div>`;
}

function _buildPasteAltsPanel(item, idx) {
  const altRows = item.results
    .slice(0, 7)
    .map((r, i) => {
      const isSel = i === item.selectedIdx;
      const isHigh = i === state._altHighlightIdx && state._openAltsIdx === idx;
      const yr = (r.release_date || '').slice(0, 4) || '?';
      const thumb = r.poster_path
        ? `<img class="paste-alt-thumb" src="${TMDB_SM}${esc(r.poster_path)}" alt="" loading="lazy">`
        : `<div class="paste-alt-thumb-ph">🎬</div>`;
      const cls = ['paste-alt-item', isSel ? 'pai-selected' : '', isHigh ? 'pai-highlighted' : '']
        .filter(Boolean)
        .join(' ');
      return `<div class="${cls}" data-altidx="${i}" onclick="_pastePickAlt(${idx},${i})">
      ${thumb}
      <div class="flex-content">
        <div class="paste-alt-title">${esc(r.title)}</div>
        <div class="paste-alt-year">${esc(yr)}${r.vote_average ? ' · ★ ' + r.vote_average.toFixed(1) : ''}</div>
      </div>
      ${isSel ? '<span class="paste-alt-selected">✓</span>' : ''}
    </div>`;
    })
    .join('');

  return `<div class="paste-alts-panel" id="paste-alts-panel-${idx}">
    <div class="paste-alts-label">Pick a different result</div>
    <div id="paste-alts-list-${idx}">${altRows || '<div class="paste-no-alternatives">No alternatives found</div>'}</div>
    <div class="paste-alts-search-row">
      <input class="paste-alts-search-input" id="pasteAltSearch-${idx}" type="text"
        placeholder="Search for a different title…"
        onkeydown="_onPasteAltSearchKey(event,${idx})">
      <button class="paste-alts-search-btn" onclick="_pasteCustomSearch(${idx})">Search</button>
    </div>
  </div>`;
}

// ── Alt panel keyboard handler (on the search input) ─────────────────────
function _onPasteAltSearchKey(e, idx) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    const list = document.getElementById(`paste-alts-list-${idx}`);
    if (!list) return;
    const items = list.querySelectorAll('.paste-alt-item');
    if (e.key === 'ArrowDown')
      state._altHighlightIdx = Math.min(state._altHighlightIdx + 1, items.length - 1);
    else if (e.key === 'ArrowUp') state._altHighlightIdx = Math.max(state._altHighlightIdx - 1, 0);
    _updateAltHighlight(list);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation(); // stop global handler from seeing this
    const q = e.target.value.trim();
    if (q) {
      _pasteCustomSearch(idx); // runs search, keeps panel open
    } else {
      _pasteToggleAlts(idx); // empty search box → close panel
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    _pasteToggleAlts(idx);
  }
}

// ── Global keydown for alt panel navigation (arrow keys / Enter) ──────────
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('pasteImportModal').classList.contains('open')) return;
  if (state._openAltsIdx < 0) return;
  // Only intercept if we're NOT focused in the search input (that's handled separately)
  const searchInp = document.getElementById(`pasteAltSearch-${state._openAltsIdx}`);
  if (document.activeElement === searchInp) return;
  // Don't fire if a text field is active (category input etc.)
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')
    return;

  const list = document.getElementById(`paste-alts-list-${state._openAltsIdx}`);
  if (!list) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    state._altHighlightIdx = Math.min(state._altHighlightIdx + 1, items.length - 1);
    _updateAltHighlight(list);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    state._altHighlightIdx = Math.max(state._altHighlightIdx - 1, 0);
    _updateAltHighlight(list);
  } else if (e.key === 'Enter') {
    // Commit the keyboard-highlighted item (if any), then close the panel
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    if (state._altHighlightIdx >= 0 && items[state._altHighlightIdx]) {
      const ai = parseInt(items[state._altHighlightIdx].dataset.altidx);
      state._pasteItems[state._openAltsIdx].selectedIdx = ai;
    }
    state._pasteItems[state._openAltsIdx].showingAlts = false;
    const closedIdx = state._openAltsIdx;
    state._openAltsIdx = -1;
    state._altHighlightIdx = -1;
    _pasteReplaceCard(closedIdx);
    _pasteRefreshCounters();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    _pasteToggleAlts(state._openAltsIdx);
  }
});

function _updateAltHighlight(list) {
  const items = list.querySelectorAll('.paste-alt-item');
  items.forEach((el, i) => el.classList.toggle('pai-highlighted', i === state._altHighlightIdx));
  if (state._altHighlightIdx >= 0)
    items[state._altHighlightIdx].scrollIntoView({ block: 'nearest' });
}

// ── Card update helpers ───────────────────────────────────────────────────
function _pasteReplaceCard(idx) {
  const card = document.getElementById(`paste-card-${idx}`);
  if (!card) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _buildPasteCard(state._pasteItems[idx], idx);
  card.replaceWith(tmp.firstElementChild);
}

function _pasteRefreshCounters() {
  const metaEl = document.getElementById('pasteReviewMeta');
  if (metaEl) metaEl.textContent = _pasteReviewMeta();
  const btn = document.getElementById('pasteConfirmBtn');
  const adding = _pasteAddingCount();
  if (btn) {
    btn.disabled = adding === 0;
    btn.textContent = `Add ${adding} Film${adding !== 1 ? 's' : ''}`;
  }
}

function _pasteToggleAlts(idx) {
  const wasOpen = state._pasteItems[idx].showingAlts;
  // Close any other open panel first
  if (
    state._openAltsIdx >= 0 &&
    state._openAltsIdx !== idx &&
    state._pasteItems[state._openAltsIdx]
  ) {
    state._pasteItems[state._openAltsIdx].showingAlts = false;
    _pasteReplaceCard(state._openAltsIdx);
  }
  state._pasteItems[idx].showingAlts = !wasOpen;
  if (state._pasteItems[idx].showingAlts) {
    state._openAltsIdx = idx;
    state._altHighlightIdx = state._pasteItems[idx].selectedIdx; // start keyboard highlight at current pick
  } else {
    state._openAltsIdx = -1;
    state._altHighlightIdx = -1;
  }
  _pasteReplaceCard(idx);
}

function _pastePickAlt(idx, altIdx) {
  state._pasteItems[idx].selectedIdx = altIdx;
  state._altHighlightIdx = altIdx;
  _pasteReplaceCard(idx);
  _pasteRefreshCounters();
}

function _pasteRemove(idx) {
  if (state._openAltsIdx === idx) {
    state._openAltsIdx = -1;
    state._altHighlightIdx = -1;
  }
  state._pasteItems[idx].removed = true;
  state._pasteItems[idx].showingAlts = false;
  _pasteReplaceCard(idx);
  _pasteRefreshCounters();
}

function _pasteRestore(idx) {
  state._pasteItems[idx].removed = false;
  _pasteReplaceCard(idx);
  _pasteRefreshCounters();
}

async function _pasteCustomSearch(idx) {
  const session = state._pasteSession;
  const item = state._pasteItems[idx];
  const input = document.getElementById(`pasteAltSearch-${idx}`);
  if (!input || !state.tmdbKey) return;
  const q = input.value.trim();
  if (!q) return;
  const request = (item._searchRequest = (item._searchRequest || 0) + 1);
  const isCurrent = () =>
    session === state._pasteSession &&
    state._pasteItems[idx] === item &&
    item._searchRequest === request;
  input.disabled = true;
  const btn = input.nextElementSibling;
  if (btn) btn.disabled = true;
  try {
    const norm = q
      .replace(/[-\u2010-\u2015]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(state.tmdbKey)}&query=${encodeURIComponent(norm)}&include_adult=false`
    );
    if (res.ok) {
      const data = await res.json();
      if (!isCurrent()) return;
      const nr = (data.results || []).slice(0, 8);
      if (nr.length) {
        state._pasteItems[idx].results = nr;
        state._pasteItems[idx].selectedIdx = 0;
        state._altHighlightIdx = 0;
      }
    }
  } catch (e) {
    /* skip */
  }
  if (!isCurrent()) return;
  input.disabled = false;
  if (btn) btn.disabled = false;
  _pasteReplaceCard(idx);
  _pasteRefreshCounters();
}

// ── Step 4: confirm ───────────────────────────────────────────────────────
async function _pasteConfirmAll() {
  if (state._pasteConfirmActive) return;
  const toAdd = state._pasteItems.filter((i) => !i.removed && i.results.length > 0);
  if (!toAdd.length) return;
  state._pasteConfirmActive = true;
  const btn = document.getElementById('pasteConfirmBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }

  state._pasteSnap = JSON.parse(JSON.stringify(state.movies));
  let added = 0,
    skipped = 0;
  const now = new Date().toISOString();

  for (const item of toAdd) {
    const hit = item.results[item.selectedIdx];
    if (!hit) continue;
    const yr = (hit.release_date || '').slice(0, 4);
    if (_findExistingForImport(hit.id, hit.title, yr)) {
      skipped++;
      continue;
    }
    let d = null,
      crew = null;
    if (state.tmdbKey && hit.id) {
      try {
        const [dr, credits] = await Promise.all([
          fetch(
            `https://api.themoviedb.org/3/movie/${hit.id}?api_key=${encodeURIComponent(state.tmdbKey)}`
          ),
          fetchMovieCredits(hit.id),
        ]);
        if (dr.ok) d = await dr.json();
        crew = credits;
      } catch (e) {
        /* fallback to search result */
      }
    }
    const dir = crew ? (crew.crew || []).find((x) => x.job === 'Director') : null;
    state.movies.push({
      id: crypto.randomUUID(),
      title: d?.title || hit.title,
      year: (d?.release_date || hit.release_date || '').slice(0, 4),
      genre: d?.genres ? d.genres.map((g) => g.name).join(', ') : '',
      director: dir ? dir.name : '',
      rating: d?.vote_average ? d.vote_average.toFixed(1) + '/10' : '',
      runtime: d?.runtime || undefined,
      releaseDate: d?.release_date || hit.release_date || undefined,
      poster:
        d?.poster_path || hit.poster_path ? TMDB_IMG + (d?.poster_path || hit.poster_path) : '',
      notes: d?.overview || '',
      otherName: '',
      collection: '',
      category: state._pasteCategory,
      watchWith: '',
      tmdbId: hit.id || null,
      detachExempt: false,
      watched: state._pasteWatched,
      watchingSoon: false,
      streaming: {},
      dateAdded: now,
      dateWatched: state._pasteWatched ? now : undefined,
    });
    added++;
    await new Promise((r) => setTimeout(r, 40));
  }

  save();
  render();
  state._pasteConfirmActive = false;
  document.getElementById('pasteImportBody').innerHTML = `
    <div class="paste-results-header">
      <div class="import-success-icon">✓</div>
      <div class="import-success-title">Done</div>
      <div class="muted-caption">
        ${added} film${added !== 1 ? 's' : ''} added
        ${state._pasteCategory ? ` to <strong class="text-dim">${esc(state._pasteCategory)}</strong>` : ''}
        ${skipped ? ` · ${skipped} already in your list` : ''}
      </div>
    </div>
    <div class="action-row">
      <button class="btn btn-primary button-fill" onclick="closePasteImportModal()">Done</button>
      ${state._pasteSnap ? `<button class="btn btn-ghost" onclick="_undoPasteImport()">Undo</button>` : ''}
    </div>`;
}

function _undoPasteImport() {
  if (!state._pasteSnap) return;
  state.movies = state._pasteSnap;
  state._pasteSnap = null;
  save();
  render();
  closePasteImportModal();
  showInfoToast('Paste import undone.', 3500);
}
