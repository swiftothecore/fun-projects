function syncCollapsedTitle(){
  document.getElementById('collapsedTitleText').textContent=document.getElementById('fTitle').value.trim()||'Untitled';
  document.getElementById('collapsedTitleMeta').textContent=[document.getElementById('fYear').value.trim(),document.getElementById('fGenre').value.trim()].filter(Boolean).join(' · ');
}
function collapseMovieDetails(){
  syncCollapsedTitle();
  document.getElementById('movieDetailsCollapsible').classList.add('collapsed');
  document.getElementById('collapsedTitleBanner').classList.add('shown');
  document.getElementById('showMovieDetailsBtn').style.display='none';
}
function expandMovieDetails(){
  document.getElementById('movieDetailsCollapsible').classList.remove('collapsed');
  document.getElementById('collapsedTitleBanner').classList.remove('shown');
  document.getElementById('showMovieDetailsBtn').style.display='none';
}
function toggleMovieDetails(){
  if(document.getElementById('movieDetailsCollapsible').classList.contains('collapsed'))expandMovieDetails();
  else collapseMovieDetails();
}

function updateModalJustWatch(){
  const t=document.getElementById('fTitle').value.trim(),el=document.getElementById('modalJustWatch');
  if(t){el.href=`https://www.justwatch.com/au/search?q=${encodeURIComponent(t)}`;el.style.opacity='1';el.style.pointerEvents='';}
  else{el.href='#';el.style.opacity='0.35';el.style.pointerEvents='none';}
}

function updatePosterPreview(url){
  const t=document.getElementById('posterThumb');
  if(url)t.innerHTML=`<img src="${esc(url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='📺'">`;
  else t.innerHTML='📺';
}

function openAddModalWithCategory(cat){
  if (document.getElementById('addModal').classList.contains('open')) return;
  openAddModal();
  document.getElementById('fCategory').value = cat || '';
  populateCategorySuggestions();
}

// ── Category suggestions ────────────────────────────────────────────────────

function populateCategorySuggestions(){
  _categoryNames=[...new Set(shows.map(m=>m.category).filter(Boolean))].sort();
}

function filterCategorySuggestions(){
  const dd=document.getElementById('categoryDropdown');
  const q=document.getElementById('fCategory').value.trim().toLowerCase();
  const matches=q?_categoryNames.filter(n=>n.toLowerCase().includes(q)):_categoryNames;
  categoryHighlightIndex=-1;
  if(!matches.length){dd.style.display='none';return;}
  dd.innerHTML=matches.map(n=>`<div class="cat-suggestion" data-name="${esc(n)}" onmousedown="pickCategory(${jsAttr(n)})"><span class="cat-icon">&#128196;</span>${esc(n)}</div>`).join('');
  dd.style.display='';
}

function hideCategorySuggestions(){
  categoryHighlightIndex=-1;
  document.getElementById('categoryDropdown').style.display='none';
}

function pickCategory(name){
  document.getElementById('fCategory').value=name;
  hideCategorySuggestions();
}

function onCategoryKeyDown(e){
  const dd=document.getElementById('categoryDropdown');
  if(dd.style.display==='none')return;
  const items=dd.querySelectorAll('.cat-suggestion');
  if(!items.length)return;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    categoryHighlightIndex=Math.min(categoryHighlightIndex+1,items.length-1);
    _updateCategoryHighlight(items);
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    categoryHighlightIndex=Math.max(categoryHighlightIndex-1,-1);
    _updateCategoryHighlight(items);
  }else if(e.key==='Enter'){
    const target=categoryHighlightIndex>=0?items[categoryHighlightIndex]:items[0];
    if(target){e.preventDefault();e.stopPropagation();pickCategory(target.dataset.name);}
  }
}

function _updateCategoryHighlight(items){
  items.forEach((el,i)=>el.classList.toggle('active',i===categoryHighlightIndex));
  if(categoryHighlightIndex>=0)items[categoryHighlightIndex].scrollIntoView({block:'nearest'});
}

// ── Detail modal ──
function buildDetailSvc(m){
  const s=m.streaming||{};
  const lb={netflix:'Netflix',disney:'Disney+',prime:'Prime Video',hbomax:'HBO Max',appletv:'Apple TV+',other:m.otherName||'Other'};
  let o='';
  for(const k of SERVICES){
    if(s[k]?.direct)o+=`<span class="detail-service-pill ${k}">${esc(lb[k])}</span>`;
  }
  return o||`<span class="detail-service-pill other">Other</span>`;
}

function openDetail(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  const posterInner=m.poster
    ?`<img class="detail-poster" src="${esc(m.poster)}" alt="${esc(m.title)}" onerror="this.outerHTML='<div class=\\'detail-poster-placeholder\\'>📺</div>'">`
    :`<div class="detail-poster-placeholder">📺</div>`;

  // Poster with context-sensitive overlay button (ported from film app, adapted for TV statuses)
  let posterOverlayBtn='';
  if(m.watched&&m.watchStatus==='finished_for_good'){
    posterOverlayBtn=`<button class="detail-watched-btn" onclick="setShowStatus(${jsAttr(m.id)},'unwatched');openDetail(${jsAttr(m.id)})">Finished for Good</button>`;
  }else if(m.watched&&m.watchStatus==='more_to_come'){
    posterOverlayBtn=`<button class="detail-more-btn" onclick="setShowStatus(${jsAttr(m.id)},'watching');openDetail(${jsAttr(m.id)})">More to Come</button>`;
  }else if(m.watching){
    posterOverlayBtn=`<button class="detail-soon-btn active" onclick="showDetailStatusPicker(${jsAttr(m.id)})">Watching</button>`;
  }else{
    posterOverlayBtn=`<button class="detail-soon-btn" onclick="setShowStatus(${jsAttr(m.id)},'watching');openDetail(${jsAttr(m.id)})">Start Watching</button>`;
  }

  const ph=m.graveyard
    ?posterInner
    :`<div class="detail-poster-wrap">${posterInner}${posterOverlayBtn}</div>`;

  const svc=buildDetailSvc(m);
  const jw = `https://www.justwatch.com/au/search?q=${encodeURIComponent(m.title)}`;
  const imdb = imdbSeriesId(m.imdbId) ? `https://www.imdb.com/title/${m.imdbId}/`
    : `https://www.imdb.com/find/?q=${encodeURIComponent(m.title)}&amp;s=tt`;
  const tmdbId = positiveInteger(m.tmdbId);
  const premiere = dateOnly(m.firstAirDate);
  const nextDate = dateOnly(m.nextEpisode?.airDate);
  const nextSeason = positiveInteger(m.nextEpisode?.season);
  const nextNumber = positiveInteger(m.nextEpisode?.episode);
  const episodeLabel = nextSeason && nextNumber ? ` · S${nextSeason} E${nextNumber}` : '';
  const planned = !m.graveyard && !m.watching;
  const plannedLabel = m.watched ? 'Rewatch Soon' : 'Watch Soon';


  // Meta line: year · genre · creator, then rating and seasons on new lines
  const metaTop=[m.year,m.genre,m.creator].filter(Boolean).map(esc).join(' · ');
  const ratingMeta = [m.rating ? `★ ${esc(m.rating)}` : '', m.rtRating ? `Rotten Tomatoes ${esc(m.rtRating)}` : ''].filter(Boolean).join(' · ');
  const metaSeasons=m.seasons?`<br>${esc(m.seasons)} season${parseInt(m.seasons)!==1?'s':''}`:'';
  const binge=getBingeTime(m);
  const bingeRow=binge
    ?`<div class="binge-time"><span>⏱</span><div>${binge} to binge<small>${Number(m.episodeCount)} episodes × ${Number(m.episodeRuntime)} min</small></div></div>`
    :'';
  // Graveyard badge
  const graveyardBadge=m.graveyard?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;"><span class="service-badge" style="background:rgba(80,60,80,0.25);color:#9a8a9a;border:1px solid rgba(120,100,120,0.4)">💀 Graveyard</span></div>`:'';

  // Date — if watched show the finished date, otherwise show added date (matches film app logic)
  const isDone=m.watched&&(m.watchStatus==='more_to_come'||m.watchStatus==='finished_for_good');
  const dateSpan=isDone&&m.dateWatched
    ?`<span id="detailDateWatched" onclick="editDateWatched(${jsAttr(m.id)})" title="Click to edit" style="cursor:pointer;font-size:0.68rem;color:var(--text-muted);letter-spacing:0.05em;border-bottom:1px dashed var(--border-hi);padding-bottom:1px;transition:color 0.15s;" onmouseover="this.style.color='var(--text-dim)'" onmouseout="this.style.color='var(--text-muted)'">${formatDateWatched(m.dateWatched)}</span>`
    :`<span id="detailDateAdded" onclick="editDateAdded(${jsAttr(m.id)})" title="Click to edit" style="cursor:pointer;font-size:0.68rem;color:var(--text-muted);letter-spacing:0.05em;border-bottom:1px dashed var(--border-hi);padding-bottom:1px;transition:color 0.15s;" onmouseover="this.style.color='var(--text-dim)'" onmouseout="this.style.color='var(--text-muted)'">${formatDateAdded(m.dateAdded)}</span>`;

  // Primary action button — three distinct states
  const primaryBtn=m.graveyard?''
    :m.watching
      ?`<button class="btn btn-primary" onclick="showDetailStatusPicker(${jsAttr(m.id)})">Mark Watched</button>`
      :m.watched
        ?`<button class="btn btn-primary" onclick="setShowStatus(${jsAttr(m.id)},'unwatched');openDetail(${jsAttr(m.id)})">Mark Unwatched</button>`
        :`<button class="btn btn-primary" onclick="setShowStatus(${jsAttr(m.id)},'watching');openDetail(${jsAttr(m.id)})">Start Watching</button>`;

  // Graveyard button label (matches film app)
  const graveyardBtnStyle=m.graveyard?'color:#c084fc;border-color:rgba(124,58,237,0.4);':'color:var(--text-muted);';
  const graveyardBtnLabel=m.graveyard?'💀 Unbury':'💀';

  document.getElementById('detailContent').innerHTML=`
    <div class="detail-poster-row">${ph}<div class="detail-info">
      <div class="detail-title">${esc(m.title)}</div>
      <div class="detail-meta">${[metaTop, ratingMeta].filter(Boolean).join('<br>')}${metaSeasons}</div>
      ${premiere ? `<div class="air-date">Premiere <time datetime="${premiere}">${formatAirDate(premiere)}</time></div>` : ''}
      ${nextDate && nextDate >= localDateStr(new Date()) ? `<div class="air-date upcoming">Next episode${episodeLabel} <time datetime="${nextDate}">${formatAirDate(nextDate)}</time></div>` : ''}
      ${m.watchWith ? `<button class="btn btn-ghost btn-sm detail-companion" onclick="filterByCompanion(${jsAttr(m.watchWith)})">Watch with ${esc(m.watchWith)}</button>` : ''}
      ${m.notes?`<div id="detailNotesWrap" class="detail-notes-wrap clamped"><div id="detailNotes" class="detail-notes">${esc(m.notes)}</div><button class="detail-notes-expander" onclick="toggleDetailNotes()">...</button></div>`:''}
      ${graveyardBadge}
      ${bingeRow}
      <div style="margin-top:8px;">${dateSpan}</div>
    </div></div>
    <div class="detail-services-section"><div class="detail-services-title">Where to Watch</div><div class="detail-services-grid">${svc}</div></div>
    ${categorySettings[m.category]?.detached?`<div style="margin-top:12px;display:flex;align-items:center;gap:12px;padding:9px 14px;background:rgba(96,165,250,0.04);border:1px solid rgba(96,165,250,0.12);border-radius:var(--radius);"><div style="flex:1;"><div style="font-size:0.68rem;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-dim);">Show in main list</div><div style="font-size:0.62rem;color:var(--text-muted);margin-top:1px;">Exception to detached category</div></div><label class="toggle-row" style="margin:0;flex-shrink:0;"><input type="checkbox" ${m.detachExempt?'checked':''} onchange="toggleDetachExempt(${jsAttr(m.id)})"><span class="track"></span></label></div>`:''}
    <div class="detail-links">
      <a class="btn-justwatch" href="${jw}" target="_blank" rel="noopener"><span class="jw-dot"></span>JustWatch AU</a>
      <a class="btn btn-ghost btn-sm detail-imdb" href="${imdb}" target="_blank" rel="noopener">IMDb</a>
      ${tmdbId ? `<a class="btn btn-ghost btn-sm detail-tmdb" href="https://www.themoviedb.org/tv/${tmdbId}" target="_blank" rel="noopener">TMDB</a>` : ''}
    </div>
    <div id="detailActionBar" style="margin-top:16px;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
      <div style="display:flex;gap:8px;align-items:center;">
        ${tmdbId ? `<button class="btn btn-ghost btn-sm" onclick="openTrailer(${tmdbId},this)">Trailer</button>` : ''}
        ${planned ? `<button class="btn btn-ghost btn-sm" aria-pressed="${!!m.watchSoon}" onclick="toggleShowPlan(${jsAttr(m.id)})">${plannedLabel}</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="toggleGraveyard(${jsAttr(m.id)})" title="${m.graveyard?'Restore from graveyard':'Move to graveyard'}" style="${graveyardBtnStyle}">${graveyardBtnLabel}</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="openEditFromDetail(${jsAttr(m.id)})">Edit</button>
        ${primaryBtn}
      </div>
    </div>`;
  const _detailWasOpen=document.getElementById('detailModal').classList.contains('open');
  document.getElementById('detailModal').classList.add('open');
  currentDetailId=id;
  if(!_detailWasOpen)lockScroll();
  // Auto-unclamp notes if they fit (matches film app)
  const dn=document.getElementById('detailNotes');
  const dw=document.getElementById('detailNotesWrap');
  if(dn&&dw&&dn.scrollHeight<=dn.clientHeight){dw.classList.remove('clamped');}
}

function showDetailStatusPicker(id){
  const bar=document.getElementById('detailActionBar');
  if(!bar)return;
  bar.innerHTML=`
    <span style="font-size:0.7rem;color:var(--text-muted);letter-spacing:0.08em;text-transform:uppercase;">Finished watching?</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;">
      <button class="btn btn-ghost btn-sm" onclick="setShowStatus(${jsAttr(id)},'more_to_come');closeDetail();">🔁 More to Come</button>
      <button class="btn btn-ghost btn-sm" onclick="setShowStatus(${jsAttr(id)},'finished_for_good');closeDetail();">✅ Finished for Good</button>
      <button class="btn btn-ghost btn-sm" onclick="openDetail(${jsAttr(id)})">Cancel</button>
    </div>`;
}

function toggleDetailNotes(){
  const w=document.getElementById('detailNotesWrap');
  if(!w)return;
  w.classList.toggle('clamped');
  const btn=w.querySelector('.detail-notes-expander');
  if(btn)btn.textContent=w.classList.contains('clamped')?'...':'Less';
}

function closeDetail(){const el=document.getElementById('detailModal');if(!el.classList.contains('open'))return;el.classList.remove('open');currentDetailId=null;unlockScroll();}
function handleDetailOverlay(e){if(e.target===document.getElementById('detailModal'))closeDetail();}
function openEditFromDetail(id){closeDetail();openEditModal(id);}

// ── Scroll lock (prevents background scroll while any modal is open) ──────
let _scrollLockY = 0, _scrollLockCount = 0;
function lockScroll() {
  if (_scrollLockCount === 0) {
    _scrollLockY = window.scrollY;
    document.body.style.setProperty('--scroll-y', `-${_scrollLockY}px`);
    document.body.classList.add('modal-open');
  }
  _scrollLockCount++;
}
function unlockScroll() {
  _scrollLockCount = Math.max(0, _scrollLockCount - 1);
  if (_scrollLockCount === 0) {
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--scroll-y');
    window.scrollTo({ top: _scrollLockY, behavior: 'instant' });
  }
}

// ── Add/Edit modal ──
function closeAddModal(){
  resetShowSearch();
  if(!document.getElementById('addModal').classList.contains('open'))return;
  document.getElementById('addModal').classList.remove('open');
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('searchHint').classList.remove('visible');
  editingId = null;
  editingShowSnapshot = null;
  unlockScroll();
}
function handleOverlayClick(e){if(e.target===document.getElementById('addModal'))closeAddModal();}
function showStatus(show) {
  if (show.graveyard) return 'unwatched';
  if (show.watching) return 'watching';
  return show.watched && show.watchStatus ? show.watchStatus : 'unwatched';
}

function applyShowStatus(show, status) {
  const wasWatched = show.watched;
  show.watching = status === 'watching';
  show.watched = ['more_to_come', 'finished_for_good'].includes(status);
  show.watchStatus = show.watched ? status : null;
  if (status !== 'unwatched') show.graveyard = false;
  if (show.watched && !wasWatched) show.dateWatched = new Date().toISOString();
  if (!show.watched) delete show.dateWatched;
  show.watchSoon = false;
}

function setShowStatus(id, status) {
  const show = shows.find(item => item.id === id);
  if (!show) return;
  applyShowStatus(show, status);
  save();
  render();
}

function toggleGraveyard(id) {
  const show = shows.find(item => item.id === id);
  if (!show) return;
  setGraveyard(show, !show.graveyard);
  save();
  closeDetail();
  render();
}

function setGraveyard(show, graveyard) {
  if (graveyard) applyShowStatus(show, 'unwatched');
  show.graveyard = graveyard;
}

function toggleShowPlan(id) {
  const show = shows.find(item => item.id === id);
  if (!show || show.graveyard || show.watching) return;
  show.watchSoon = !show.watchSoon;
  save();
  render();
  openDetail(id);
}

// ── Date editing in detail ──
function editDateWatched(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  const el=document.getElementById('detailDateWatched');if(!el)return;
  const cur=m.dateWatched?localDateStr(new Date(m.dateWatched)):localDateStr(new Date());
  const today=localDateStr(new Date());
  el.outerHTML=`<div id="detailDateInput" style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
    <input type="date" id="dateWatchedPicker" value="${cur}" max="${today}" style="background:var(--bg);border:1px solid var(--gold-dim);border-radius:var(--radius);color:var(--text);padding:5px 9px;font-family:'DM Sans',sans-serif;font-size:0.78rem;color-scheme:dark;">
    <button onclick="saveDateWatched(${jsAttr(id)})" style="background:var(--gold);color:#0c0b0a;border:none;border-radius:var(--radius);padding:5px 12px;font-family:'DM Sans',sans-serif;font-size:0.72rem;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Save</button>
    <button onclick="openDetail(${jsAttr(id)})" style="background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:var(--radius);padding:5px 12px;font-family:'DM Sans',sans-serif;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Cancel</button>
  </div>`;
  document.getElementById('dateWatchedPicker').focus();
}
function saveDateWatched(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  const val=document.getElementById('dateWatchedPicker')?.value;
  if(val && document.getElementById('dateWatchedPicker').checkValidity()){m.dateWatched=new Date(val+'T12:00:00').toISOString();save();render();}
  openDetail(id);
}
function editDateAdded(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  const el=document.getElementById('detailDateAdded');if(!el)return;
  const cur=m.dateAdded?localDateStr(new Date(m.dateAdded)):localDateStr(new Date());
  const today=localDateStr(new Date());
  el.outerHTML=`<div id="detailDateInput" style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
    <input type="date" id="dateAddedPicker" value="${cur}" max="${today}" style="background:var(--bg);border:1px solid var(--gold-dim);border-radius:var(--radius);color:var(--text);padding:5px 9px;font-family:'DM Sans',sans-serif;font-size:0.78rem;color-scheme:dark;">
    <button onclick="saveDateAdded(${jsAttr(id)})" style="background:var(--gold);color:#0c0b0a;border:none;border-radius:var(--radius);padding:5px 12px;font-family:'DM Sans',sans-serif;font-size:0.72rem;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Save</button>
    <button onclick="openDetail(${jsAttr(id)})" style="background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:var(--radius);padding:5px 12px;font-family:'DM Sans',sans-serif;font-size:0.72rem;letter-spacing:0.06em;text-transform:uppercase;cursor:pointer;">Cancel</button>
  </div>`;
  document.getElementById('dateAddedPicker').focus();
}
function saveDateAdded(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  const val=document.getElementById('dateAddedPicker')?.value;
  if(val && document.getElementById('dateAddedPicker').checkValidity()){m.dateAdded=new Date(val+'T12:00:00').toISOString();save();render();}
  openDetail(id);
}

const addModalMobile = window.matchMedia('(max-width:640px)');

function syncAddModalViewport(keepFocusVisible = false) {
  const viewport = window.visualViewport;
  const overlay = document.getElementById('addModal');
  if (!viewport || !overlay.classList.contains('open')) return;
  overlay.style.setProperty('--add-viewport-top', `${viewport.offsetTop}px`);
  overlay.style.setProperty('--add-viewport-height', `${viewport.height}px`);
  if (!keepFocusVisible || !addModalMobile.matches) return;
  const body = overlay.querySelector('.modal-body');
  const field = document.activeElement;
  if (!body.contains(field)) return;
  const visible = body.getBoundingClientRect();
  const bounds = field.getBoundingClientRect();
  if (bounds.top < visible.top) body.scrollTop += bounds.top - visible.top;
  else if (bounds.bottom > visible.bottom) body.scrollTop += bounds.bottom - visible.bottom;
}

window.visualViewport?.addEventListener('resize', () => syncAddModalViewport(true));
window.visualViewport?.addEventListener('scroll', () => syncAddModalViewport());

function showAddEditModal() {
  const overlay = document.getElementById('addModal');
  if (!overlay.classList.contains('open')) {
    overlay.classList.add('open');
    lockScroll();
  }
  syncAddModalViewport();
  overlay.querySelector('.modal-body').scrollTop = 0;
}

function openAddModal() {
  if (document.getElementById('addModal').classList.contains('open')) return;
  editingId = null;
  document.getElementById('modalTitle').textContent = 'Add Show';
  clearForm();
  document.getElementById('deleteRow').style.display = 'none';
  showAddEditModal();
  updateModalJustWatch();
  expandMovieDetails();
  populateCategorySuggestions();
  document.getElementById(addModalMobile.matches ? 'modalTitle' : tmdbKey ? 'searchInput' : 'fTitle')
    .focus({ preventScroll: true });
}

function openEditModal(id) {
  const show = shows.find(item => item.id === id);
  if (!show) return;
  clearForm();
  editingId = id;
  editingShowSnapshot = JSON.parse(JSON.stringify(show));
  document.getElementById('modalTitle').textContent = 'Edit Show';
  document.getElementById('deleteRow').style.display = 'flex';
  populateForm(show);
  showAddEditModal();
  updateModalJustWatch();
  populateCategorySuggestions();
  expandMovieDetails();
  document.getElementById('modalTitle').focus({ preventScroll: true });
}

function clearForm(){
  resetShowSearch(); hideCategorySuggestions();
  delete document.getElementById('fNotes').dataset.tmdbOverview;
  ['fTitle','fYear','fGenre','fCreator','fRating','fSeasons','fEpisodeRuntime','fEpisodeCount','fPoster','fNotes','fOtherName','fCategory','fWatchWith','fFirstAirDate','searchInput'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const uw=document.querySelector('input[name="showStatus"][value="unwatched"]');
  if(uw)uw.checked=true;
  document.querySelectorAll('.streaming-tile').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-pressed','false');});
  document.getElementById('fOtherName').classList.remove('visible');
  document.getElementById('posterThumb').innerHTML='📺';
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('searchHint').classList.remove('visible');
  _pendingTmdbId = null;
  pendingShowMetadata = null;
  document.getElementById('companionSuggestions').replaceChildren(
    ...[...new Set(shows.map(show => show.watchWith).filter(Boolean))].sort().map(name => new Option(name, name))
  );
}
function populateForm(m){
  document.getElementById('fTitle').value=m.title||'';
  document.getElementById('fYear').value=m.year||'';
  document.getElementById('fGenre').value=m.genre||'';
  document.getElementById('fCreator').value=m.creator||'';
  document.getElementById('fRating').value=m.rating||'';
  document.getElementById('fSeasons').value=m.seasons||'';
  document.getElementById('fEpisodeRuntime').value=m.episodeRuntime||'';
  document.getElementById('fEpisodeCount').value=m.episodeCount||'';
  document.getElementById('fPoster').value=m.poster||'';
  document.getElementById('fNotes').value=m.notes||'';
  document.getElementById('fOtherName').value=m.otherName||'';
  document.getElementById('fCategory').value = m.category || '';
  document.getElementById('fWatchWith').value = m.watchWith || '';
  document.getElementById('fFirstAirDate').value = dateOnly(m.firstAirDate);
  if (m.tmdbOverview && m.notes === m.tmdbOverview) document.getElementById('fNotes').dataset.tmdbOverview = m.tmdbOverview;
  updatePosterPreview(m.poster||'');
  // Set status radio
  let statusVal='unwatched';
  if(m.watching)statusVal='watching';
  else if(m.watched&&m.watchStatus==='more_to_come')statusVal='more_to_come';
  else if(m.watched&&m.watchStatus==='finished_for_good')statusVal='finished_for_good';
  const radio=document.querySelector(`input[name="showStatus"][value="${statusVal}"]`);
  if(radio)radio.checked=true;
  // Streaming tiles
  document.querySelectorAll('.streaming-tile').forEach(t=>{t.classList.remove('active');t.setAttribute('aria-pressed','false');});
  const s=m.streaming||{};
  for(const k of SERVICES){
    if(s[k]?.direct) document.querySelector(`.streaming-tile[data-service="${k}"]`)?.classList.add('active');
  }
  document.querySelectorAll('.streaming-tile').forEach(t=>t.setAttribute('aria-pressed',String(t.classList.contains('active'))));
  document.getElementById('fOtherName').classList.toggle('visible',!!(s.other?.direct));
}

function toggleTile(tile){
  tile.classList.toggle('active');
  tile.setAttribute('aria-pressed',String(tile.classList.contains('active')));
  if(tile.dataset.service==='other'){
    document.getElementById('fOtherName').classList.toggle('visible',tile.classList.contains('active'));
  }
}

function syncPremiereYear() {
  const date = dateOnly(document.getElementById('fFirstAirDate').value);
  if (date) document.getElementById('fYear').value = date.slice(0, 4);
  syncCollapsedTitle();
}

function saveShow(){
  const title=document.getElementById('fTitle').value.trim();
  if(!title){document.getElementById('fTitle').style.borderColor='var(--danger)';document.getElementById('fTitle').focus();setTimeout(()=>document.getElementById('fTitle').style.borderColor='',1500);return;}
  const streaming={};
  for(const k of SERVICES){
    const tile=document.querySelector(`.streaming-tile[data-service="${k}"]`);
    if(tile?.classList.contains('active'))streaming[k]={direct:true};
  }
  const latest = editingId ? shows.find(show => show.id === editingId) : null;
  if (editingId && !latest) {
    showInfoToast('This show was removed on another device.');
    return;
  }
  const existing = editingShowSnapshot || latest;
  const field = id => document.getElementById(id).value.trim();
  const year = field('fYear');
  const tmdbId = _pendingTmdbId || existing?.tmdbId || null;
  const duplicate = findSavedSeries(tmdbId, title, year);
  if (duplicate && duplicate.id !== editingId) {
    showInfoToast('This show is already in your list.');
    return;
  }

  const status = document.querySelector('input[name="showStatus"]:checked')?.value || 'unwatched';
  const reselected = !!pendingShowMetadata;
  const sameSeries = !!existing && String(tmdbId) === String(existing.tmdbId)
    && (tmdbId || (title === existing.title && year === String(existing.year || '')));
  const show = {
    ...existing,
    id: editingId || crypto.randomUUID(),
    title, year, streaming, tmdbId,
    firstAirDate: dateOnly(field('fFirstAirDate')),
    genre: field('fGenre'),
    creator: field('fCreator'),
    rating: field('fRating'),
    seasons: field('fSeasons'),
    poster: field('fPoster'),
    notes: field('fNotes'),
    otherName: field('fOtherName'),
    category: field('fCategory'),
    watchWith: field('fWatchWith'),
    episodeRuntime: positiveInteger(field('fEpisodeRuntime')),
    episodeCount: positiveInteger(field('fEpisodeCount')),
    dateAdded: existing?.dateAdded || new Date().toISOString(),
    detachExempt: existing?.category === field('fCategory') && !!existing.detachExempt,
  };
  if (!sameSeries) {
    for (const key of ['imdbId', 'nextEpisode', 'tmdbCheckedAt', 'tmdbRuntimeCheckedAt', 'rtRating', 'rtCheckedAt', 'tmdbOverview', 'metadataOmissions']) {
      delete show[key];
    }
  }
  if (reselected) {
    for (const key of ['imdbId', 'nextEpisode', 'tmdbCheckedAt', 'tmdbOverview']) show[key] = pendingShowMetadata[key];
  }
  const previous = pendingShowMetadata || (sameSeries ? existing : null);
  const omissions = new Set(reselected ? [] : show.metadataOmissions || []);
  for (const key of ['firstAirDate', 'episodeRuntime', 'episodeCount']) {
    if (show[key]) omissions.delete(key);
    else if (previous?.[key]) omissions.add(key);
  }
  if (omissions.size) show.metadataOmissions = [...omissions];
  else delete show.metadataOmissions;

  if (!existing || status !== showStatus(existing)) applyShowStatus(show, status);
  if (latest) shows[shows.indexOf(latest)] = mergeSavedShow(existing, show, latest);
  else shows.push(show);
  save();
  closeAddModal();
  render();
  scheduleMetadata();
}

function deleteCurrentShow(){
  if(!editingId)return;
  const m=shows.find(x=>x.id===editingId);if(!m)return;
  undoStack.push(JSON.parse(JSON.stringify(shows)));redoStack=[];
  shows=shows.filter(x=>x.id!==editingId);
  save(true);closeAddModal();render();
  showDeleteToast(m.title);
}

// Forward trackpad/wheel scroll on the backdrop into the modal.
// On desktop the scrollable element is .modal (the card); on mobile it's .modal-body.
(function(){
  const overlay=document.getElementById('addModal');
  if(!overlay)return;
  overlay.addEventListener('wheel',function(e){
    if(!overlay.classList.contains('open'))return;
    const card=overlay.querySelector('.modal');
    if(!card)return;
    if(card.contains(e.target))return; // inside the card — scroll naturally
    const scrollEl=card.scrollHeight>card.clientHeight
      ?card
      :(card.querySelector('.modal-body')||card);
    e.preventDefault();
    let delta=e.deltaY;
    if(e.deltaMode===1)delta*=16;
    if(e.deltaMode===2)delta*=scrollEl.clientHeight;
    scrollEl.scrollTop+=delta;
  },{passive:false});
})();
