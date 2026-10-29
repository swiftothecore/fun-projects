// Letterboxd CSV import/export, service categorisation, and paste-list review/import.
// Classic scripts intentionally expose handler functions to inline HTML events.

// 'unwatched' | 'all'

function openExportModal(){
  _exportScope = 'unwatched';
  _renderExportSelect();
  document.getElementById('exportModal').classList.add('open');
  lockScroll();
}

function closeExportModal(){
  if(!document.getElementById('exportModal').classList.contains('open')) return;
  document.getElementById('exportModal').classList.remove('open');
  unlockScroll();
}

function handleExportOverlay(e){
  if(e.target === document.getElementById('exportModal')) closeExportModal();
}

function _exportPool(){
  // Respects Christmas Mode context — exports whichever list is currently active,
  // and never includes graveyarded films (already given up on, not "to watch").
  return movies.filter(m=>!m.graveyard);
}

function setExportScope(scope){
  _exportScope = scope;
  _renderExportSelect();
}

function _renderExportSelect(){
  const pool = _exportPool();
  const unwatchedCount = pool.filter(m=>!m.watched).length;
  const allCount = pool.length;
  const listLabel = christmasMode ? 'Christmas films' : 'films';
  document.getElementById('exportBody').innerHTML = `
    <div class="import-step-instructions">
      <p>Generate a CSV file of your${christmasMode?' Christmas':''} watchlist that Letterboxd can import.</p>
      <ol>
        <li>Pick which films to include below and click <strong>Download CSV</strong></li>
        <li>On Letterboxd, open your <a href="https://letterboxd.com/watchlist/" target="_blank" rel="noopener" style="color:var(--gold)">Watchlist</a>, then find the <strong>Import</strong> option</li>
        <li>Upload the downloaded file — films with a TMDB match will match exactly, others by title &amp; year</li>
      </ol>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button class="export-scope-btn${_exportScope==='unwatched'?' active':''}" onclick="setExportScope('unwatched')">
        <span>Unwatched ${listLabel}</span><span class="export-scope-count">${unwatchedCount}</span>
      </button>
      <button class="export-scope-btn${_exportScope==='all'?' active':''}" onclick="setExportScope('all')">
        <span>All ${listLabel}</span><span class="export-scope-count">${allCount}</span>
      </button>
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:18px;" onclick="runLetterboxdExport()">Download CSV</button>
  `;
}

// Letterboxd's CSV spec: quote fields containing commas/quotes/newlines,
// and escape internal quotes with a backslash (NOT doubled, per their docs).
function _lbCsvField(v){
  if(v===null||v===undefined) return '';
  v = String(v);
  if(/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g,'\\"') + '"';
  return v;
}

function runLetterboxdExport(){
  const pool = _exportPool();
  const list = _exportScope==='unwatched' ? pool.filter(m=>!m.watched) : pool;
  if(!list.length){ showInfoToast('Nothing to export.',2500); return; }
  const header = 'tmdbID,Title,Year,Directors';
  const rows = list.map(m=>[m.tmdbId||'', m.title||'', m.year||'', m.director||''].map(_lbCsvField).join(','));
  const csv = [header,...rows].join('\r\n') + '\r\n';
  const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${christmasMode?'christmas-':''}watchlist-letterboxd-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  closeExportModal();
  showInfoToast(`Exported ${list.length} film${list.length===1?'':'s'} for Letterboxd.`,3000);
}

function openImportModal(){
  _importRows   = [];
  _importSnap   = null;
  _importActive = false;
  _importCategoriseSkipped = new Set();
  _renderImportSelect();
  document.getElementById('importModal').classList.add('open');
  lockScroll();
}

function closeImportModal(){
  if(_importActive || !document.getElementById('importModal').classList.contains('open')) return;
  document.getElementById('importModal').classList.remove('open');
  unlockScroll();
}

function handleImportOverlay(e){
  if(e.target === document.getElementById('importModal')) closeImportModal();
}

// ── CSV parser ──
function _parseCSVLine(line){
  const out = [];
  let cur = '', inQ = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(ch === ',' && !inQ){
      out.push(cur.trim()); cur = '';
    } else { cur += ch; }
  }
  out.push(cur.trim());
  return out;
}

function _parseLetterboxdCSV(text){
  const lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim().split('\n');
  if(lines.length < 2) return [];
  const headers = _parseCSVLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const vals = _parseCSVLine(l);
      const obj = {};
      headers.forEach((h,i) => { obj[h] = vals[i] || ''; });
      return obj;
    });
}

// ── Step 1: file selection UI ──
function _renderImportSelect(){
  const hasKey = !!tmdbKey;
  const uncatCount = movies.filter(m=>hasNoStreaming(m)&&!m.graveyard).length;
  document.getElementById('importBody').innerHTML = `
    <div class="import-step-instructions">
      <p>Import your watch history from Letterboxd. Films already in your list will have their watched date updated with the Letterboxd date.</p>
      <ol>
        <li>On Letterboxd, go to <strong>Settings → Import &amp; Export</strong></li>
        <li>Under <em>Export</em>, click <strong>Export Your Data</strong></li>
        <li>Upload the <code>diary.csv</code> file below</li>
      </ol>
    </div>
    ${!hasKey ? `<div class="import-warning">⚠ <strong>No TMDB key set.</strong> Films will be imported with title and date only — no poster, genre, or director. <a href="#" onclick="closeImportModal();showApiSettings();return false;" style="color:var(--gold)">Add a key</a> for full details.</div>` : ''}
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
    ${uncatCount > 0 ? `
    <div class="import-categorise-prompt">
      <div>
        <div class="import-categorise-prompt-text-title">🗂 Assign streaming services</div>
        <div class="import-categorise-prompt-text-meta">${uncatCount} film${uncatCount!==1?'s':''} in your list have no service set yet</div>
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0;" onclick="renderImportCategorise()">Review →</button>
    </div>` : ''}`;
}

function importDragOver(e){
  e.preventDefault();
  document.getElementById('importDropzone')?.classList.add('drag-over');
}

function importDragLeave(e){
  document.getElementById('importDropzone')?.classList.remove('drag-over');
}

function importDrop(e){
  e.preventDefault();
  document.getElementById('importDropzone')?.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if(file) _readImportFile(file);
}

function importFileChosen(input){
  const file = input.files?.[0];
  if(file) _readImportFile(file);
}

function _readImportFile(file){
  const reader = new FileReader();
  reader.onload = e => {
    const rows = _parseLetterboxdCSV(e.target.result);
    if(!rows.length || !('Name' in (rows[0]||{}))){
      const dz = document.getElementById('importDropzone');
      if(dz) dz.insertAdjacentHTML('afterend',
        `<p style="color:var(--danger);font-size:0.78rem;margin-top:10px;">
          Couldn't read this file. Make sure it's a Letterboxd <code>diary.csv</code> export.</p>`);
      return;
    }
    // Deduplicate rewatches: keep the entry with the most recent Watched Date
    const seen = new Map();
    for(const row of rows){
      const key = (row.Name||'').toLowerCase().trim() + '|' + (row.Year||'');
      const existing = seen.get(key);
      const d = row['Watched Date'] || '';
      if(!existing || d > (existing['Watched Date']||'')) seen.set(key, row);
    }
    _importRows = [...seen.values()];
    _renderImportPreview(_importRows, file.name);
  };
  reader.readAsText(file);
}

// ── Step 2: preview & confirm ──
function _renderImportPreview(rows, filename){
  const alreadyIn = rows.filter(r => _findExistingForImport(null, r.Name, r.Year)).length;
  const newCount  = rows.length - alreadyIn;
  const hasKey    = !!tmdbKey;
  const preview   = rows.slice(0,6).map(r =>
    `<li>${esc(r.Name||'')}${r.Year?' ('+esc(r.Year)+')':''}${r['Watched Date']?' · '+esc(r['Watched Date']):''}</li>`
  ).join('');
  const more = rows.length > 6 ? `<li style="color:var(--text-muted);">…and ${rows.length - 6} more</li>` : '';

  document.getElementById('importBody').innerHTML = `
    <div class="import-file-confirmed">
      <span class="import-file-icon">✓</span>
      <div style="flex:1;min-width:0;">
        <div class="import-file-name">${esc(filename)}</div>
        <div class="import-file-meta">${rows.length} entr${rows.length===1?'y':'ies'} found${alreadyIn?` · ${alreadyIn} already in your list`:''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0;" onclick="_renderImportSelect()">Change</button>
    </div>
    <div class="import-warning">
      ${alreadyIn ? `<strong>${alreadyIn} film${alreadyIn!==1?'s':''}</strong> already in your list — their watched date will be overridden with the Letterboxd date. ` : ''}
      ${newCount  ? `<strong>${newCount} new film${newCount!==1?'s':''}</strong> will be added as watched${hasKey?' with TMDB metadata (poster, genre, director)':' with title and date only'}. ` : ''}
      Streaming service info is not imported.
    </div>
    <div style="margin-bottom:18px;">
      <div style="font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px;">Preview</div>
      <ul class="import-preview-list">${preview}${more}</ul>
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="runLetterboxdImport()">
      📥 Import ${rows.length} Film${rows.length!==1?'s':''}
    </button>`;
}

// ── Existing-movie matcher ──
function _findExistingForImport(tmdbId, title, year){
  // Match against the active list — that's the list new films are pushed into,
  // saved by save(), and snapshotted for undo.
  const pool = movies;
  if(tmdbId){
    const m = pool.find(x => x.tmdbId && x.tmdbId === tmdbId);
    if(m) return m;
  }
  const tl = (title||'').toLowerCase().trim();
  return pool.find(m =>
    m.title.toLowerCase().trim() === tl &&
    String(m.year||'') === String(year||'')
  ) || null;
}

// ── TMDB helpers ──
async function _tmdbSearchForImport(title, year){
  if(!tmdbKey) return null;
  try {
    const q = title.replace(/[-\u2010-\u2015]/g,' ').replace(/\s+/g,' ').trim();
    const base = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(q)}&include_adult=false`;
    const res = await fetch(year ? base+'&year='+encodeURIComponent(year) : base);
    if(!res.ok) return null;
    const data = await res.json();
    let results = data.results || [];
    // Year filter sometimes causes misses — retry without it
    if(!results.length && year){
      const res2 = await fetch(base);
      if(res2.ok){ const d2 = await res2.json(); results = d2.results || []; }
    }
    return results[0] || null;
  } catch { return null; }
}

async function _tmdbDetailsForImport(id){
  if(!tmdbKey || !id) return null;
  try {
    const [dr, cr] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${encodeURIComponent(tmdbKey)}`),
      fetch(`https://api.themoviedb.org/3/movie/${id}/credits?api_key=${encodeURIComponent(tmdbKey)}`)
    ]);
    if(!dr.ok) return null;
    const d = await dr.json();
    const c = cr.ok ? await cr.json() : null;
    return { d, c };
  } catch { return null; }
}

// ── Main import runner ──
async function runLetterboxdImport(){
  if(!_importRows.length || _importActive) return;
  _importActive = true;

  // Snapshot for undo
  _importSnap = JSON.parse(JSON.stringify(movies));

  const total = _importRows.length;
  let added = 0, updated = 0, noTmdb = 0;

  // Render progress UI
  document.getElementById('importBody').innerHTML = `
    <div style="padding:8px 0;">
      <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:14px;">
        Importing ${total} film${total!==1?'s':''}…
        ${!tmdbKey?'<span style="color:var(--text-muted);font-size:0.72rem;"> (no TMDB key — title and date only)</span>':''}
      </div>
      <div class="import-progress-bar"><div class="import-progress-fill" id="impFill"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-top:4px;">
        <span id="impLabel" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Starting…</span>
        <span id="impCount" style="flex-shrink:0;margin-left:12px;">0 / ${total}</span>
      </div>
    </div>`;

  for(let i = 0; i < _importRows.length; i++){
    const row     = _importRows[i];
    const title   = row.Name  || '';
    const year    = row.Year  || '';
    // Letterboxd diary has both "Date" (log date) and "Watched Date" (actual viewing date)
    const watchedStr = row['Watched Date'] || row['Date'] || '';
    const watchedISO = watchedStr
      ? new Date(watchedStr + 'T12:00:00').toISOString()
      : new Date().toISOString();

    // Update progress bar
    const pct = Math.round((i / total) * 100);
    const fill  = document.getElementById('impFill');
    const label = document.getElementById('impLabel');
    const count = document.getElementById('impCount');
    if(fill)  fill.style.width  = pct + '%';
    if(label) label.textContent = title + (year ? ' ('+year+')' : '');
    if(count) count.textContent = `${i} / ${total}`;
    // Yield to browser so the progress bar actually renders
    await new Promise(r => setTimeout(r, 0));

    try {
      // Fetch TMDB data
      const hit     = await _tmdbSearchForImport(title, year);
      const tmdbId  = hit?.id || null;
      const details = tmdbId ? await _tmdbDetailsForImport(tmdbId) : null;
      if(!tmdbId) noTmdb++;

      const d   = details?.d;
      const c   = details?.c;
      const dir = c ? (c.crew||[]).find(x => x.job === 'Director') : null;

      // Match against existing list
      const existing = _findExistingForImport(tmdbId, title, year);

      if(existing){
        // Always override the watched date with Letterboxd's date
        existing.watched      = true;
        existing.watchingSoon = false;
        existing.graveyard    = false;
        existing.dateWatched  = watchedISO;
        // Backfill missing metadata while we have it
        if(tmdbId  && !existing.tmdbId)   existing.tmdbId   = tmdbId;
        if(d?.poster_path && !existing.poster)
          existing.poster = TMDB_IMG + d.poster_path;
        if(d?.runtime && !existing.runtime)
          existing.runtime = d.runtime;
        if(d?.genres?.length && !existing.genre)
          existing.genre = d.genres.map(g=>g.name).join(', ');
        if(dir && !existing.director)
          existing.director = dir.name;
        if(d?.vote_average && !existing.rating)
          existing.rating = d.vote_average.toFixed(1)+'/10';
        updated++;
      } else {
        // Add as new watched film
        movies.push({
          id:          crypto.randomUUID(),
          title:       d?.title || title,
          year:        d?.release_date ? d.release_date.slice(0,4) : year,
          genre:       d?.genres ? d.genres.map(g=>g.name).join(', ') : '',
          director:    dir ? dir.name : '',
          rating:      d?.vote_average ? d.vote_average.toFixed(1)+'/10' : '',
          runtime:     d?.runtime || undefined,
          poster:      d?.poster_path ? TMDB_IMG+d.poster_path : '',
          notes:       '',
          otherName:   '',
          collection:  '',
          category:    '',
          tmdbId:      tmdbId,
          watched:     true,
          watchingSoon:false,
          graveyard:   false,
          streaming:   {},
          dateAdded:   watchedISO,
          dateWatched: watchedISO,
        });
        added++;
      }
    } catch(err){
      console.warn('[Import] Failed:', title, err);
      noTmdb++;
    }

    // ~6 films/sec — respectful of TMDB's rate limit
    await new Promise(r => setTimeout(r, 160));
  }

  // Final tick
  const fill = document.getElementById('impFill');
  if(fill) fill.style.width = '100%';
  await new Promise(r => setTimeout(r, 80));

  save();
  render();
  _importActive = false;
  _renderImportResults(added, updated, noTmdb, total);
}

// ── Step 3: results ──
function _renderImportResults(added, updated, noTmdb, total){
  document.getElementById('importBody').innerHTML = `
    <div style="text-align:center;padding:10px 0 22px;">
      <div style="font-size:2.2rem;margin-bottom:8px;">✓</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:4px;">Import complete</div>
      <div style="font-size:0.72rem;color:var(--text-muted);">${total} entr${total!==1?'ies':'y'} processed</div>
    </div>
    <div style="border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:20px;">
      <div class="import-stat-row">
        <span class="import-stat-label">Films added</span>
        <span class="import-stat-value" style="color:var(--gold);">${added}</span>
      </div>
      <div class="import-stat-row">
        <span class="import-stat-label">Films updated</span>
        <span class="import-stat-value">${updated}</span>
      </div>
      ${noTmdb > 0 ? `<div class="import-stat-row">
        <span class="import-stat-label">Not found on TMDB</span>
        <span class="import-stat-value" style="color:var(--text-muted);">${noTmdb}</span>
      </div>` : ''}
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="closeImportModal()">Done</button>
      ${_importSnap ? `<button class="btn btn-ghost" onclick="_undoLetterboxdImport()">Undo Import</button>` : ''}
    </div>`;
}

function _undoLetterboxdImport(){
  if(!_importSnap) return;
  movies = _importSnap;
  _importSnap = null;
  save();
  render();
  closeImportModal();
  showInfoToast('Letterboxd import undone.', 3500);
}

// { id, streaming, otherName } — for Cmd+Z undo

// Cmd/Ctrl+Z undoes the last service assignment while the categorise panel is open
document.addEventListener('keydown', e=>{
  if(!(e.metaKey||e.ctrlKey)||e.key!=='z') return;
  const list = document.getElementById('categoriseList');
  if(!list||!_lastCategoriseAction) return;
  e.preventDefault();
  const {id, streaming, otherName} = _lastCategoriseAction;
  _lastCategoriseAction = null;
  const m = movies.find(x=>x.id===id);
  if(!m) return;
  m.streaming = streaming;
  m.otherName  = otherName;
  save();
  // Re-insert the row at the top of the list
  const temp = document.createElement('div');
  temp.innerHTML = _buildCategoriseRow(m);
  list.insertBefore(temp.firstElementChild, list.firstChild);
  const count = list.querySelectorAll('.categorise-film-row').length;
  const countEl = document.getElementById('categoriseCount');
  if(countEl) countEl.textContent = count+' film'+(count!==1?'s':'')+' without a service';
});

function renderImportCategorise(){
  const all     = movies.filter(m=>hasNoStreaming(m)&&!m.graveyard);
  const visible = all.filter(m=>!_importCategoriseSkipped.has(m.id));
  document.getElementById('importBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <button class="btn btn-ghost btn-sm" onclick="_renderImportSelect()" style="flex-shrink:0;">← Back</button>
      <div>
        <div style="font-size:0.82rem;font-weight:500;color:var(--text);">Assign streaming services</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;" id="categoriseCount">${visible.length} film${visible.length!==1?'s':''} without a service</div>
      </div>
    </div>
    <div id="categoriseList">
      ${visible.length ? visible.map(m=>_buildCategoriseRow(m)).join('') : _categoriseDoneMsg()}
    </div>`;
  // Align each JW chip with its corresponding Skip chip after layout settles
  requestAnimationFrame(()=>requestAnimationFrame(_alignJWWithSkip));
}

// Nudge each JW row's right padding so JW sits directly above Skip
function _alignJWWithSkip(){
  document.querySelectorAll('.categorise-film-row').forEach(row=>{
    const skipBtn = row.querySelector('.categorise-svc-chip.skip');
    const jwDiv   = row.querySelector('.jw-row');
    if(!skipBtn||!jwDiv) return;
    const skipRect      = skipBtn.getBoundingClientRect();
    const containerRect = jwDiv.parentElement.getBoundingClientRect();
    const offset = Math.max(0, containerRect.right - skipRect.right);
    jwDiv.style.paddingRight = offset + 'px';
  });
}

function _categoriseDoneMsg(){
  return `<div style="text-align:center;padding:28px 0;color:var(--text-muted);font-size:0.82rem;">All films have been assigned a service.</div>`;
}

function _buildCategoriseRow(m){
  const thumb = m.poster
    ? `<img src="${esc(m.poster)}" class="categorise-film-thumb" onerror="this.style.background='var(--surface2)';this.removeAttribute('src')">`
    : `<div class="categorise-film-thumb"></div>`;
  const meta = [m.year, m.genre?m.genre.split(',')[0].trim():null].filter(Boolean).join(' · ');
  const jwUrl = `https://www.justwatch.com/au/search?q=${encodeURIComponent(m.title||'')}`;
  return `<div class="categorise-film-row" id="catrow-${esc(m.id)}">
    ${thumb}
    <div style="flex:1;min-width:0;">
      <div class="categorise-film-title">${esc(m.title||'')}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:2px;">
        <div class="categorise-film-meta">${esc(meta||'')}</div>
        <a class="categorise-svc-chip jw-chip" href="${esc(jwUrl)}" target="_blank" rel="noopener" title="Find on JustWatch" style="flex-shrink:0;">JW</a>
      </div>
      <div class="categorise-svc-chips" id="catrow-chips-${esc(m.id)}" style="margin-top:6px;justify-content:space-between;">
        ${_categoriseChipsHTML(m.id)}
      </div>
    </div>
  </div>`;
}

function _categoriseChipsHTML(id){
  return `<button class="categorise-svc-chip netflix" onclick="assignServiceFromCategorise(${jsAttr(id)},'netflix')">Netflix</button>
    <button class="categorise-svc-chip disney"  onclick="assignServiceFromCategorise(${jsAttr(id)},'disney')">Disney+</button>
    <button class="categorise-svc-chip prime"   onclick="assignServiceFromCategorise(${jsAttr(id)},'prime')">Prime</button>
    <button class="categorise-svc-chip cinema"  onclick="assignServiceFromCategorise(${jsAttr(id)},'cinema')">Cinema</button>
    <button class="categorise-svc-chip other"   onclick="showCategoriseOtherInput(${jsAttr(id)})">Other</button>
    <button class="categorise-svc-chip skip"    onclick="skipFromCategorise(${jsAttr(id)})">Skip</button>`;
}

function showCategoriseOtherInput(id){
  const chips = document.getElementById('catrow-chips-'+id);
  if(!chips) return;
  chips.innerHTML = `<input type="text" id="catother-${esc(id)}" placeholder="Service name (e.g. Apple TV)…"
    onkeydown="if(event.key==='Enter')confirmCategoriseOther(${jsAttr(id)});if(event.key==='Escape')restoreCategoriseChips(${jsAttr(id)})">
    <button class="categorise-svc-chip other" onclick="confirmCategoriseOther(${jsAttr(id)})">Set</button>
    <button class="categorise-svc-chip skip"  onclick="restoreCategoriseChips(${jsAttr(id)})">Cancel</button>`;
  setTimeout(()=>document.getElementById('catother-'+id)?.focus(), 30);
}

function confirmCategoriseOther(id){
  const name = (document.getElementById('catother-'+id)?.value||'').trim();
  assignServiceFromCategorise(id, 'other', name);
}

function restoreCategoriseChips(id){
  const chips = document.getElementById('catrow-chips-'+id);
  if(chips) chips.innerHTML = _categoriseChipsHTML(id);
}

function assignServiceFromCategorise(id, svc, name){
  const m = movies.find(x=>x.id===id);
  if(!m) return;
  // Snapshot for Cmd+Z undo
  _lastCategoriseAction = { id, streaming:{...m.streaming}, otherName:m.otherName };
  m.streaming = {};
  m.streaming[svc] = { direct:true, vpn:false, vpnCountry:'' };
  if(svc==='other'&&name) m.otherName = name;
  save();
  _removeCategoriseRow(id);
}

function skipFromCategorise(id){
  _importCategoriseSkipped.add(id);
  _removeCategoriseRow(id);
}

function _removeCategoriseRow(id){
  const row = document.getElementById('catrow-'+id);
  if(!row) return;
  const h = row.offsetHeight;
  row.style.maxHeight = h+'px';
  row.style.opacity   = '0';
  row.style.paddingTop='0';
  row.style.paddingBottom='0';
  row.style.overflow  ='hidden';
  requestAnimationFrame(()=>{ row.style.maxHeight='0'; });
  setTimeout(()=>{
    row.remove();
    const list  = document.getElementById('categoriseList');
    const count = list ? list.querySelectorAll('.categorise-film-row').length : 0;
    const countEl = document.getElementById('categoriseCount');
    if(countEl) countEl.textContent = count+' film'+(count!==1?'s':'')+' without a service';
    if(count===0 && list) list.innerHTML = _categoriseDoneMsg();
  }, 310);
}

// keyboard highlight in category dropdown

// ── Open / close ──────────────────────────────────────────────────────────
function openPasteImportModal(){
  _pasteItems = []; _pasteCategory = ''; _pasteWatched = false;
  _pasteSearchActive = false; _pasteConfirmActive = false; _pasteSnap = null;
  _openAltsIdx = -1; _altHighlightIdx = -1; _pasteCatHighlight = -1;
  _renderPasteStep1();
  document.getElementById('pasteImportModal').classList.add('open');
  lockScroll();
}

function closePasteImportModal(){
  if(_pasteSearchActive || _pasteConfirmActive) return;
  if(!document.getElementById('pasteImportModal').classList.contains('open')) return;
  document.getElementById('pasteImportModal').classList.remove('open');
  unlockScroll();
}

function handlePasteImportOverlay(e){
  if(e.target === document.getElementById('pasteImportModal')) closePasteImportModal();
}

// ── Step 1: input ─────────────────────────────────────────────────────────
function _renderPasteStep1(){
  const hasKey = !!tmdbKey;
  document.getElementById('pasteImportBody').innerHTML = `
    <div style="font-size:0.8rem;color:var(--text-dim);line-height:1.65;margin-bottom:18px;">
      Paste a list of film titles — one per line. The best TMDB match for each title is chosen automatically, and you can review and swap results before saving.
      ${!hasKey ? `<br><span style="color:var(--text-muted);font-size:0.72rem;">⚠ No TMDB key — films will be saved with title only. <a href="#" onclick="closePasteImportModal();showApiSettings();return false;" style="color:var(--gold)">Add a key</a> for posters and metadata.</span>` : ''}
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:7px;">Film Titles</div>
      <textarea class="paste-textarea" id="pasteTitlesInput" placeholder="The Godfather
2001: A Space Odyssey
Spirited Away
Paddington 2
…one title per line. Markdown checkboxes (- [ ]) are stripped automatically."></textarea>
    </div>
    <div style="margin-bottom:14px;">
      <div style="font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:7px;">Add to Category <span style="font-weight:300;text-transform:none;letter-spacing:0;">(optional)</span></div>
      <div class="paste-cat-field">
        <input class="paste-cat-input" id="pasteCatInput" type="text" placeholder="e.g. Pixar, Horror Classics…" autocomplete="off"
          value="${esc(_pasteCategory)}"
          oninput="_filterPasteCatSuggestions()"
          onfocus="_filterPasteCatSuggestions()"
          onblur="setTimeout(_hidePasteCatSuggestions,150)"
          onkeydown="_onPasteCatKeyDown(event)">
        <div id="pasteCategoryDropdown" style="display:none"></div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px;">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.8rem;color:var(--text-dim);user-select:none;">
        <input type="checkbox" id="pasteWatchedToggle" style="accent-color:var(--gold);width:14px;height:14px;" ${_pasteWatched?'checked':''}>
        Mark all as watched
      </label>
    </div>
    <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="_startPasteSearch()">
      Search TMDB →
    </button>`;
  document.getElementById('pasteTitlesInput').focus();
}

function _startPasteSearch(){
  const raw = (document.getElementById('pasteTitlesInput').value || '').trim();
  const catInp = document.getElementById('pasteCatInput');
  if(catInp) _pasteCategory = catInp.value.trim();
  _pasteWatched = document.getElementById('pasteWatchedToggle').checked;
  const titles = raw.split('\n')
    .map(t => {
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
  if(!titles.length){
    const ta = document.getElementById('pasteTitlesInput');
    if(ta){ ta.style.borderColor = 'var(--danger)'; ta.focus(); }
    return;
  }
  _runPasteSearch(titles);
}

// ── Step 2: search ────────────────────────────────────────────────────────
async function _runPasteSearch(titles){
  if(_pasteSearchActive) return;
  _pasteSearchActive = true;
  const total = titles.length;
  const hasKey = !!tmdbKey;

  document.getElementById('pasteImportBody').innerHTML = `
    <div style="padding:8px 0;">
      <div style="font-size:0.82rem;color:var(--text-dim);margin-bottom:14px;">
        Searching for ${total} film${total!==1?'s':''}…
        ${!hasKey?'<span style="color:var(--text-muted);font-size:0.72rem;"> (no TMDB key)</span>':''}
      </div>
      <div class="import-progress-bar"><div class="import-progress-fill" id="pasteFill"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-muted);margin-top:4px;">
        <span id="pasteProgLabel" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Starting…</span>
        <span id="pasteProgCount" style="flex-shrink:0;margin-left:12px;">0 / ${total}</span>
      </div>
    </div>`;

  _pasteItems = [];

  for(let i = 0; i < titles.length; i++){
    const title = titles[i];
    const fill  = document.getElementById('pasteFill');
    const label = document.getElementById('pasteProgLabel');
    const count = document.getElementById('pasteProgCount');
    if(fill)  fill.style.width = Math.round((i / total) * 100) + '%';
    if(label) label.textContent = title;
    if(count) count.textContent = `${i} / ${total}`;
    await new Promise(r => setTimeout(r, 0));

    let results = [];
    if(hasKey){
      try {
        const q           = title.replace(/[-\u2010-\u2015]/g,' ').replace(/\s+/g,' ').trim();
        const aliasKey    = q.toLowerCase();
        const aliasKeyStr = aliasKey.replace(/\s+/g,'');
        const aliasId     = TMDB_SEARCH_ALIASES[aliasKey] || TMDB_SEARCH_ALIASES[aliasKeyStr] || null;
        const base        = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(q)}&include_adult=false`;
        const fetches     = [fetch(base)];
        if(aliasId) fetches.push(fetch(`https://api.themoviedb.org/3/movie/${aliasId}?api_key=${encodeURIComponent(tmdbKey)}`));
        const [res, aliasRes] = await Promise.all(fetches);
        if(res.ok){
          const data = await res.json();
          results = (data.results || []).slice(0, 8);
          if(aliasRes && aliasRes.ok){
            const aliasMovie = await aliasRes.json();
            results = [aliasMovie, ...results.filter(m => m.id !== aliasMovie.id)];
          }
        }
      } catch(e){ /* skip */ }
    } else {
      // No TMDB key: keep the typed title as a manual entry so it can still be saved
      results = [{ id:null, title, release_date:'', _manual:true }];
    }
    _pasteItems.push({ inputTitle:title, results, selectedIdx:0, removed:false, showingAlts:false });
    await new Promise(r => setTimeout(r, 160));
  }

  const fill = document.getElementById('pasteFill');
  if(fill) fill.style.width = '100%';
  await new Promise(r => setTimeout(r, 80));
  _pasteSearchActive = false;
  _openAltsIdx = -1; _altHighlightIdx = -1;
  _renderPasteReview();
}

// ── Step 3: review ────────────────────────────────────────────────────────
function _renderPasteReview(){
  const adding = _pasteAddingCount();
  const catLine = _pasteCategory
    ? `<span style="color:var(--gold);font-weight:500;">${esc(_pasteCategory)}</span>`
    : `<span style="color:var(--text-muted);font-style:italic;">none set</span>`;
  document.getElementById('pasteImportBody').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <button class="btn btn-ghost btn-sm" onclick="_renderPasteStep1()" style="flex-shrink:0;">← Back</button>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.82rem;font-weight:500;color:var(--text);">Review results</div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;" id="pasteReviewMeta">${_pasteReviewMeta()}</div>
      </div>
    </div>
    ${_pasteCategory ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;padding:8px 12px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.18);border-radius:var(--radius);font-size:0.75rem;">
      <span style="color:var(--text-muted);">Category:</span>
      ${catLine}
      <button onclick="_renderPasteStep1()" style="margin-left:auto;background:none;border:none;color:var(--text-muted);font-size:0.68rem;cursor:pointer;font-family:'DM Sans',sans-serif;text-decoration:underline;padding:0;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color=''">Change</button>
    </div>` : ''}
    <div id="pasteResultsList">
      ${_pasteItems.map((item,idx) => _buildPasteCard(item, idx)).join('')}
    </div>
    <div style="padding-top:16px;border-top:1px solid var(--border);display:flex;gap:8px;">
      <button class="btn btn-primary" id="pasteConfirmBtn" style="flex:1;justify-content:center;"
        onclick="_pasteConfirmAll()" ${adding===0?'disabled':''}>
        Add ${adding} Film${adding!==1?'s':''}
      </button>
    </div>`;
}

// ── Category dropdown (paste-specific, mirrors fCategory pattern exactly) ──
function _filterPasteCatSuggestions(){
  const dd  = document.getElementById('pasteCategoryDropdown');
  const inp = document.getElementById('pasteCatInput');
  if(!dd || !inp) return;
  const q   = inp.value.trim().toLowerCase();
  const cats = getCategoryNames();
  const matches = q ? cats.filter(n => n.toLowerCase().includes(q)) : cats;
  _pasteCatHighlight = -1;
  if(!matches.length){ dd.style.display = 'none'; return; }
  dd.innerHTML = matches.map(n =>
    `<div class="cat-suggestion" data-name="${esc(n)}" onmousedown="_pickPasteCategory(${jsAttr(n)})">
      <span class="cat-icon">&#128196;</span>${esc(n)}
    </div>`).join('');
  // Position using fixed coords so the dropdown escapes the modal's overflow clipping
  const rect = inp.getBoundingClientRect();
  dd.style.top   = (rect.bottom + 4) + 'px';
  dd.style.left  = rect.left + 'px';
  dd.style.width = rect.width + 'px';
  dd.style.display = ''; // removes inline "display:none", making element visible
}

function _hidePasteCatSuggestions(){
  _pasteCatHighlight = -1;
  const dd = document.getElementById('pasteCategoryDropdown');
  if(dd) dd.style.display = 'none';
}

function _pickPasteCategory(name){
  _pasteCategory = name;
  const inp = document.getElementById('pasteCatInput');
  if(inp) inp.value = name;
  _hidePasteCatSuggestions();
}

function _onPasteCatKeyDown(e){
  const dd = document.getElementById('pasteCategoryDropdown');
  if(!dd || dd.style.display === 'none') return;
  const items = dd.querySelectorAll('.cat-suggestion');
  if(!items.length) return;
  if(e.key === 'ArrowDown'){
    e.preventDefault();
    _pasteCatHighlight = Math.min(_pasteCatHighlight + 1, items.length - 1);
    _updatePasteCatHighlight(items);
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    _pasteCatHighlight = Math.max(_pasteCatHighlight - 1, -1);
    _updatePasteCatHighlight(items);
  } else if(e.key === 'Enter'){
    const target = _pasteCatHighlight >= 0 ? items[_pasteCatHighlight] : items[0];
    if(target){ e.preventDefault(); e.stopPropagation(); _pickPasteCategory(target.dataset.name); }
  } else if(e.key === 'Escape'){
    _hidePasteCatSuggestions();
  }
}

function _updatePasteCatHighlight(items){
  items.forEach((el,i) => el.classList.toggle('active', i === _pasteCatHighlight));
  if(_pasteCatHighlight >= 0) items[_pasteCatHighlight].scrollIntoView({block:'nearest'});
}

// ── Review helpers ────────────────────────────────────────────────────────
function _pasteReviewMeta(){
  const total   = _pasteItems.length;
  const found   = _pasteItems.filter(i => i.results.length > 0).length;
  const missing = total - found;
  const removed = _pasteItems.filter(i => i.removed && i.results.length > 0).length;
  const adding  = _pasteAddingCount();
  const parts   = [`${adding} of ${total} will be added`];
  if(missing) parts.push(`${missing} not found`);
  if(removed)  parts.push(`${removed} removed`);
  return parts.join(' · ');
}

function _pasteAddingCount(){
  return _pasteItems.filter(i => !i.removed && i.results.length > 0).length;
}

function _buildPasteCard(item, idx){
  const hit       = item.results[item.selectedIdx] || null;
  const isRemoved = item.removed;
  const isDupe    = hit ? !!_findExistingForImport(hit.id, hit.title, (hit.release_date||'').slice(0,4)) : false;

  let posterEl, infoEl;
  if(hit){
    const yr  = (hit.release_date||'').slice(0,4) || '?';
    const vot = hit.vote_average ? ` · ★ ${hit.vote_average.toFixed(1)}` : '';
    posterEl  = hit.poster_path
      ? `<img class="paste-result-poster" src="${TMDB_SM}${esc(hit.poster_path)}" alt="" loading="lazy">`
      : `<div class="paste-result-poster-ph">🎬</div>`;
    const origNote = item.inputTitle.toLowerCase().trim() !== hit.title.toLowerCase().trim()
      ? `<div style="font-size:0.63rem;color:var(--text-muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">searched: "${esc(item.inputTitle)}"</div>`
      : '';
    infoEl = `
      <div class="paste-result-title">${esc(hit.title)}${isDupe?'<span class="paste-dupe-badge">In list</span>':''}</div>
      <div class="paste-result-meta">${esc(yr)}${vot}</div>${origNote}`;
  } else {
    posterEl = `<div class="paste-result-poster-ph">?</div>`;
    infoEl   = `<div class="paste-result-title">${esc(item.inputTitle)}</div>
      <div class="paste-result-notfound">Not found on TMDB</div>`;
  }

  const altsPanel = (item.showingAlts && hit) ? _buildPasteAltsPanel(item, idx) : '';
  const changeCls = item.showingAlts ? 'paste-action-btn pab-active' : 'paste-action-btn';

  return `<div class="paste-result-card ${isRemoved?'pr-removed':''}" id="paste-card-${idx}">
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        ${posterEl}
        <div class="paste-result-info">${infoEl}</div>
        <div class="paste-result-actions">
          ${hit && !hit._manual ? `<button class="${changeCls}" onclick="_pasteToggleAlts(${idx})">${item.showingAlts?'Hide':'Change'}</button>` : ''}
          ${isRemoved
            ? `<button class="paste-action-btn pab-restore" onclick="_pasteRestore(${idx})">Restore</button>`
            : `<button class="paste-action-btn pab-danger" onclick="_pasteRemove(${idx})">Remove</button>`}
        </div>
      </div>
      ${altsPanel}
    </div>
  </div>`;
}

function _buildPasteAltsPanel(item, idx){
  const altRows = item.results.slice(0, 7).map((r, i) => {
    const isSel  = i === item.selectedIdx;
    const isHigh = i === _altHighlightIdx && _openAltsIdx === idx;
    const yr     = (r.release_date||'').slice(0,4) || '?';
    const thumb  = r.poster_path
      ? `<img class="paste-alt-thumb" src="${TMDB_SM}${esc(r.poster_path)}" alt="" loading="lazy">`
      : `<div class="paste-alt-thumb-ph">🎬</div>`;
    const cls = ['paste-alt-item', isSel?'pai-selected':'', isHigh?'pai-highlighted':''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-altidx="${i}" onclick="_pastePickAlt(${idx},${i})">
      ${thumb}
      <div style="flex:1;min-width:0;">
        <div class="paste-alt-title">${esc(r.title)}</div>
        <div class="paste-alt-year">${esc(yr)}${r.vote_average?' · ★ '+r.vote_average.toFixed(1):''}</div>
      </div>
      ${isSel?'<span style="color:var(--gold);font-size:0.8rem;flex-shrink:0;">✓</span>':''}
    </div>`;
  }).join('');

  return `<div class="paste-alts-panel" id="paste-alts-panel-${idx}">
    <div class="paste-alts-label">Pick a different result</div>
    <div id="paste-alts-list-${idx}">${altRows||'<div style="font-size:0.74rem;color:var(--text-muted);padding:4px 0;">No alternatives found</div>'}</div>
    <div class="paste-alts-search-row">
      <input class="paste-alts-search-input" id="pasteAltSearch-${idx}" type="text"
        placeholder="Search for a different title…"
        onkeydown="_onPasteAltSearchKey(event,${idx})">
      <button class="paste-alts-search-btn" onclick="_pasteCustomSearch(${idx})">Search</button>
    </div>
  </div>`;
}

// ── Alt panel keyboard handler (on the search input) ─────────────────────
function _onPasteAltSearchKey(e, idx){
  if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
    e.preventDefault(); e.stopPropagation();
    const list = document.getElementById(`paste-alts-list-${idx}`);
    if(!list) return;
    const items = list.querySelectorAll('.paste-alt-item');
    if(e.key === 'ArrowDown')      _altHighlightIdx = Math.min(_altHighlightIdx + 1, items.length - 1);
    else if(e.key === 'ArrowUp')   _altHighlightIdx = Math.max(_altHighlightIdx - 1, 0);
    _updateAltHighlight(list);
  } else if(e.key === 'Enter'){
    e.preventDefault(); e.stopPropagation(); // stop global handler from seeing this
    const q = e.target.value.trim();
    if(q){
      _pasteCustomSearch(idx); // runs search, keeps panel open
    } else {
      _pasteToggleAlts(idx); // empty search box → close panel
    }
  } else if(e.key === 'Escape'){
    e.preventDefault(); e.stopPropagation();
    _pasteToggleAlts(idx);
  }
}

// ── Global keydown for alt panel navigation (arrow keys / Enter) ──────────
document.addEventListener('keydown', e => {
  if(_openAltsIdx < 0) return;
  // Only intercept if we're NOT focused in the search input (that's handled separately)
  const searchInp = document.getElementById(`pasteAltSearch-${_openAltsIdx}`);
  if(document.activeElement === searchInp) return;
  // Don't fire if a text field is active (category input etc.)
  if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

  const list = document.getElementById(`paste-alts-list-${_openAltsIdx}`);
  if(!list) return;

  if(e.key === 'ArrowDown'){
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    _altHighlightIdx = Math.min(_altHighlightIdx + 1, items.length - 1);
    _updateAltHighlight(list);
  } else if(e.key === 'ArrowUp'){
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    _altHighlightIdx = Math.max(_altHighlightIdx - 1, 0);
    _updateAltHighlight(list);
  } else if(e.key === 'Enter'){
    // Commit the keyboard-highlighted item (if any), then close the panel
    e.preventDefault();
    const items = list.querySelectorAll('.paste-alt-item');
    if(_altHighlightIdx >= 0 && items[_altHighlightIdx]){
      const ai = parseInt(items[_altHighlightIdx].dataset.altidx);
      _pasteItems[_openAltsIdx].selectedIdx = ai;
    }
    _pasteItems[_openAltsIdx].showingAlts = false;
    const closedIdx = _openAltsIdx;
    _openAltsIdx = -1; _altHighlightIdx = -1;
    _pasteReplaceCard(closedIdx);
    _pasteRefreshCounters();
  } else if(e.key === 'Escape'){
    e.preventDefault();
    _pasteToggleAlts(_openAltsIdx);
  }
});

function _updateAltHighlight(list){
  const items = list.querySelectorAll('.paste-alt-item');
  items.forEach((el, i) => el.classList.toggle('pai-highlighted', i === _altHighlightIdx));
  if(_altHighlightIdx >= 0) items[_altHighlightIdx].scrollIntoView({block:'nearest'});
}

// ── Card update helpers ───────────────────────────────────────────────────
function _pasteReplaceCard(idx){
  const card = document.getElementById(`paste-card-${idx}`);
  if(!card) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = _buildPasteCard(_pasteItems[idx], idx);
  card.replaceWith(tmp.firstElementChild);
}

function _pasteRefreshCounters(){
  const metaEl = document.getElementById('pasteReviewMeta');
  if(metaEl) metaEl.textContent = _pasteReviewMeta();
  const btn    = document.getElementById('pasteConfirmBtn');
  const adding = _pasteAddingCount();
  if(btn){ btn.disabled = adding === 0; btn.textContent = `Add ${adding} Film${adding!==1?'s':''}`; }
}

function _pasteToggleAlts(idx){
  const wasOpen = _pasteItems[idx].showingAlts;
  // Close any other open panel first
  if(_openAltsIdx >= 0 && _openAltsIdx !== idx && _pasteItems[_openAltsIdx]){
    _pasteItems[_openAltsIdx].showingAlts = false;
    _pasteReplaceCard(_openAltsIdx);
  }
  _pasteItems[idx].showingAlts = !wasOpen;
  if(_pasteItems[idx].showingAlts){
    _openAltsIdx     = idx;
    _altHighlightIdx = _pasteItems[idx].selectedIdx; // start keyboard highlight at current pick
  } else {
    _openAltsIdx = -1; _altHighlightIdx = -1;
  }
  _pasteReplaceCard(idx);
}

function _pastePickAlt(idx, altIdx){
  _pasteItems[idx].selectedIdx = altIdx;
  _altHighlightIdx = altIdx;
  _pasteReplaceCard(idx);
  _pasteRefreshCounters();
}

function _pasteRemove(idx){
  if(_openAltsIdx === idx){ _openAltsIdx = -1; _altHighlightIdx = -1; }
  _pasteItems[idx].removed = true; _pasteItems[idx].showingAlts = false;
  _pasteReplaceCard(idx); _pasteRefreshCounters();
}

function _pasteRestore(idx){
  _pasteItems[idx].removed = false;
  _pasteReplaceCard(idx); _pasteRefreshCounters();
}

async function _pasteCustomSearch(idx){
  const input = document.getElementById(`pasteAltSearch-${idx}`);
  if(!input || !tmdbKey) return;
  const q = input.value.trim();
  if(!q) return;
  input.disabled = true;
  const btn = input.nextElementSibling;
  if(btn) btn.disabled = true;
  try {
    const norm = q.replace(/[-\u2010-\u2015]/g,' ').replace(/\s+/g,' ').trim();
    const res  = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(tmdbKey)}&query=${encodeURIComponent(norm)}&include_adult=false`);
    if(res.ok){
      const data = await res.json();
      const nr   = (data.results||[]).slice(0, 8);
      if(nr.length){ _pasteItems[idx].results = nr; _pasteItems[idx].selectedIdx = 0; _altHighlightIdx = 0; }
    }
  } catch(e){ /* skip */ }
  input.disabled = false;
  if(btn) btn.disabled = false;
  _pasteReplaceCard(idx); _pasteRefreshCounters();
}

// ── Step 4: confirm ───────────────────────────────────────────────────────
async function _pasteConfirmAll(){
  if(_pasteConfirmActive) return;
  const toAdd = _pasteItems.filter(i => !i.removed && i.results.length > 0);
  if(!toAdd.length) return;
  _pasteConfirmActive = true;
  const btn = document.getElementById('pasteConfirmBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }

  _pasteSnap = JSON.parse(JSON.stringify(movies));
  let added = 0, skipped = 0;
  const now = new Date().toISOString();

  for(const item of toAdd){
    const hit = item.results[item.selectedIdx];
    if(!hit) continue;
    const yr = (hit.release_date||'').slice(0,4);
    if(_findExistingForImport(hit.id, hit.title, yr)){ skipped++; continue; }
    let d = null, crew = null;
    if(tmdbKey && hit.id){
      try {
        const [dr, cr] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/${hit.id}?api_key=${encodeURIComponent(tmdbKey)}`),
          fetch(`https://api.themoviedb.org/3/movie/${hit.id}/credits?api_key=${encodeURIComponent(tmdbKey)}`)
        ]);
        if(dr.ok) d    = await dr.json();
        if(cr.ok) crew = await cr.json();
      } catch(e){ /* fallback to search result */ }
    }
    const dir = crew ? (crew.crew||[]).find(x => x.job==='Director') : null;
    movies.push({
      id:           crypto.randomUUID(),
      title:        d?.title        || hit.title,
      year:         (d?.release_date||hit.release_date||'').slice(0,4),
      genre:        d?.genres       ? d.genres.map(g=>g.name).join(', ') : '',
      director:     dir             ? dir.name : '',
      rating:       d?.vote_average ? d.vote_average.toFixed(1)+'/10' : '',
      runtime:      d?.runtime      || undefined,
      releaseDate:  d?.release_date || hit.release_date || undefined,
      poster:       (d?.poster_path||hit.poster_path) ? TMDB_IMG+(d?.poster_path||hit.poster_path) : '',
      notes:        d?.overview     || '',
      otherName:    '',
      collection:   '',
      category:     _pasteCategory,
      watchWith:    '',
      tmdbId:       hit.id || null,
      detachExempt: false,
      watched:      _pasteWatched,
      watchingSoon: false,
      streaming:    {},
      dateAdded:    now,
      dateWatched:  _pasteWatched ? now : undefined,
    });
    added++;
    await new Promise(r => setTimeout(r, 40));
  }

  save(); render(); _pasteConfirmActive = false;
  document.getElementById('pasteImportBody').innerHTML = `
    <div style="text-align:center;padding:10px 0 24px;">
      <div style="font-size:2.2rem;margin-bottom:8px;">✓</div>
      <div style="font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:4px;">Done</div>
      <div style="font-size:0.72rem;color:var(--text-muted);">
        ${added} film${added!==1?'s':''} added
        ${_pasteCategory?` to <strong style="color:var(--text-dim);">${esc(_pasteCategory)}</strong>`:''}
        ${skipped?` · ${skipped} already in your list`:''}
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" style="flex:1;justify-content:center;" onclick="closePasteImportModal()">Done</button>
      ${_pasteSnap?`<button class="btn btn-ghost" onclick="_undoPasteImport()">Undo</button>`:''}
    </div>`;
}

function _undoPasteImport(){
  if(!_pasteSnap) return;
  movies = _pasteSnap; _pasteSnap = null;
  save(); render(); closePasteImportModal();
  showInfoToast('Paste import undone.', 3500);
}
