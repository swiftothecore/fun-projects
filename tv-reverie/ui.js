window.addEventListener('resize', () => {
  const view = window.innerWidth <= 640 ? 'list' : desktopView;
  if (view !== currentView) {
    currentView = view;
    applyViewToggleUI();
    render();
  }
  clearTimeout(_filterBarResizeTimer);
  _filterBarResizeTimer = setTimeout(adjustFilterBar, 80);
});

function setView(view) {
  if (window.innerWidth <= 640) return;
  desktopView = currentView = view;
  tvStorageSet('tvshows_view', view);
  applyViewToggleUI();
  render();
}
function applyViewToggleUI(){
  document.getElementById('viewGrid')?.classList.toggle('active',currentView==='grid');
  document.getElementById('viewCompact')?.classList.toggle('active',currentView==='compact');
  document.getElementById('viewList')?.classList.toggle('active',currentView==='list');
  document.body.classList.toggle('compact-cards',currentView==='compact');
}

function setFilter(f,btn){
  exitSelectMode(false);
  if(currentFilter===f&&f!=='all'){
    currentFilter='all';currentCategory=null;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('filterAll').classList.add('active');
  }else{
    currentFilter=f;
    if(f!=='categories')currentCategory=null;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }
  document.getElementById('categoryBar').classList.toggle('visible',currentFilter==='categories');
  document.getElementById('categoryOptions').classList.toggle('visible',currentFilter==='categories'&&!!currentCategory);
  includeDetachedSearch = false;
  if (f === 'all') { currentCompanion = ''; clearSearchBar(); }
  else render();
}

// ── Categories ─────────────────────────────────────────────────────────────

function selectCategory(name){
  currentCategory=(currentCategory===name)?null:name;
  render();
}

function toggleCategoryDetached(){
  if(!currentCategory)return;
  if(!categorySettings[currentCategory])categorySettings[currentCategory]={};
  categorySettings[currentCategory].detached=!categorySettings[currentCategory].detached;
  saveCategorySettings();render();
}

function toggleCategoryDetachedByName(name){
  if(!categorySettings[name])categorySettings[name]={};
  categorySettings[name].detached=!categorySettings[name].detached;
  saveCategorySettings();render();
  const pop=document.getElementById('categoryPillPopover');
  const toggle=pop.querySelector('input[type=checkbox]');
  if(toggle)toggle.checked=!!(categorySettings[name]?.detached);
}

function toggleDetachExempt(id){
  const m=shows.find(x=>x.id===id);if(!m)return;
  m.detachExempt=!m.detachExempt;
  save();render();openDetail(id);
}

function dismissCategoryOptions(){
  categoryOptionsDismissed=true;
  tvStorageSet('category_options_tvshows_dismissed','1');
  document.getElementById('categoryOptions').classList.remove('visible');
  document.getElementById('categoryOptions').innerHTML='';
}

function openPillMenu(e,btn,name){
  e.stopPropagation();e.preventDefault();
  const isDetached=!!(categorySettings[name]?.detached);
  const pop=document.getElementById('categoryPillPopover');
  pop.innerHTML=`<div class="popover-label">Category options</div>
    <label class="toggle-row" style="gap:10px;cursor:pointer;">
      <input type="checkbox" onchange="toggleCategoryDetachedByName(${jsAttr(name)})" ${isDetached?'checked':''}>
      <span class="track"></span>
      <span class="toggle-label" style="text-transform:none;letter-spacing:0.03em;font-size:0.8rem;">Detached</span>
    </label>`;
  pop.style.display='block';
  const rect=btn.getBoundingClientRect();
  const pw=Math.max(pop.offsetWidth,196);
  let left=rect.left+window.scrollX,top=rect.bottom+window.scrollY+6;
  if(left+pw>window.innerWidth+window.scrollX-12)left=window.innerWidth+window.scrollX-pw-12;
  if(rect.bottom+pop.offsetHeight>window.innerHeight-12)top=rect.top+window.scrollY-pop.offsetHeight-6;
  pop.style.left=left+'px';pop.style.top=top+'px';
}

function closePillMenu(){document.getElementById('categoryPillPopover').style.display='none';}

const mobileSearchMedia = window.matchMedia('(max-width:640px)');

function focusLibrarySearch(select = false) {
  const input = document.getElementById(mobileSearchMedia.matches ? 'mobileSearchInput' : 'searchBar');
  if (!mobileSearchMedia.matches) document.getElementById('searchBarWrap').classList.add('expanded');
  input.focus({ preventScroll: true });
  if (select) input.select();
}

function toggleSearchBar() {
  const wrap = document.getElementById('searchBarWrap');
  if (wrap.classList.contains('expanded') && !searchQuery) wrap.classList.remove('expanded');
  else focusLibrarySearch();
}

function onSearchBarInput(value) {
  if (selectionMode) exitSelectMode(false);
  searchQuery = value.trim();
  includeDetachedSearch = false;
  for (const id of ['searchBar', 'mobileSearchInput']) {
    const input = document.getElementById(id);
    if (input.value !== value) input.value = value;
  }
  const desktop = document.getElementById('searchBarWrap');
  desktop.classList.toggle('has-query', !!searchQuery);
  if (searchQuery) desktop.classList.add('expanded');
  document.getElementById('mobileSearch').classList.toggle('has-query', !!searchQuery);
  render();
}

function clearSearchBar(keepFocus = false) {
  onSearchBarInput('');
  if (keepFocus) focusLibrarySearch();
  else document.getElementById('searchBarWrap').classList.remove('expanded');
}

function onSearchBarKeyDown(event) {
  if (event.isComposing) return;
  if (event.key === 'Escape' || event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') clearSearchBar();
    event.currentTarget.blur();
  }
}

function onSearchBarBlur() {
  if (!searchQuery) document.getElementById('searchBarWrap').classList.remove('expanded');
}

// ── Bulk selection ──
function enterSelectMode(){
  if(selectionMode)return;
  selectionMode=true;
  selectedIds.clear();
  document.getElementById('selectModeBtn').classList.add('active');
  document.getElementById('bulkBar').classList.add('visible');
  updateBulkBar();
  render();
}
function exitSelectMode(doRender=true){
  selectionMode=false;
  selectedIds.clear();
  document.getElementById('selectModeBtn').classList.remove('active');
  document.getElementById('bulkBar').classList.remove('visible');
  if(doRender)render();
}
function toggleSelectShow(id){
  if(selectedIds.has(id))selectedIds.delete(id);
  else selectedIds.add(id);
  updateBulkBar();
  // Update just the affected card's selected class without full re-render
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(el=>{
    el.classList.toggle('selected',selectedIds.has(id));
  });
}
function bulkSelectAll(){
  const visible=document.querySelectorAll('#showGrid [data-id], .show-strip:not([hidden]) [data-id]');
  visible.forEach(el=>selectedIds.add(el.dataset.id));
  updateBulkBar();
  render();
}
function updateBulkBar(){
  const n=selectedIds.size;
  document.getElementById('bulkCount').textContent=n===0?'None selected':`${n} selected`;
  document.querySelectorAll('.bulk-action-btn').forEach(b=>b.disabled=n===0);
}

function selectedShows() {
  return shows.filter(show => selectedIds.has(show.id));
}

function bulkToggleWatching() {
  const items = selectedShows();
  if (!items.length) return;
  const status = items.every(show => show.watching) ? 'unwatched' : 'watching';
  items.forEach(show => applyShowStatus(show, status));
  save();
  exitSelectMode();
}

function bulkSetStatus(status) {
  const items = selectedShows();
  if (!items.length) return;
  items.forEach(show => applyShowStatus(show, status));
  save();
  exitSelectMode();
}

function bulkTogglePlan() {
  const items = selectedShows().filter(show => !show.watching && !show.graveyard);
  if (!items.length) return;
  const plan = !items.every(show => show.watchSoon);
  items.forEach(show => show.watchSoon = plan);
  save();
  exitSelectMode();
}

function bulkGraveyard() {
  const items = selectedShows();
  if (!items.length) return;
  const graveyard = !items.every(show => show.graveyard);
  items.forEach(show => setGraveyard(show, graveyard));
  save();
  exitSelectMode();
}

function bulkDelete() {
  const count = selectedIds.size;
  if (!count || !confirm(`Remove ${count} show${count === 1 ? '' : 's'}?`)) return;
  undoStack.push(JSON.parse(JSON.stringify(shows)));
  redoStack = [];
  shows = shows.filter(show => !selectedIds.has(show.id));
  save(true);
  exitSelectMode();
  showDeleteToast(`${count} show${count === 1 ? '' : 's'}`);
}

function filterByCompanion(name) {
  if (name) {
    closeDetail();
    setFilter('all', document.getElementById('filterAll'));
  }
  exitSelectMode(false);
  currentCompanion = name;
  render();
}

function openSurprise() {
  const modal = document.getElementById('surpriseModal');
  if (modal.classList.contains('open')) return;
  document.getElementById('surpriseService').replaceChildren(new Option('Any service', ''),
    ...SERVICES.map(service => new Option(SERVICE_META[service].label, service)));
  if (SERVICES.includes(currentFilter)) document.getElementById('surpriseService').value = currentFilter;
  document.getElementById('surpriseStatus').textContent = '';
  modal.classList.add('open');
  lockScroll();
  document.getElementById('surpriseService').focus({ preventScroll:true });
}

function closeSurprise() {
  const modal = document.getElementById('surpriseModal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  unlockScroll();
}

function surpriseMe() {
  const service = document.getElementById('surpriseService').value;
  const runtime = positiveInteger(document.getElementById('surpriseRuntime').value);
  const planned = document.getElementById('surprisePlan').checked;
  const today = localDateStr(new Date());
  const candidates = _postFilter(shows.filter(show => {
    if (show.watched || show.watching || show.graveyard || dateOnly(show.firstAirDate) > today) return false;
    if (planned && !show.watchSoon) return false;
    if (service && !show.streaming?.[service]?.direct) return false;
    if (runtime && (!positiveInteger(show.episodeRuntime) || Number(show.episodeRuntime) > runtime)) return false;
    if (currentCompanion && show.watchWith?.toLowerCase() !== currentCompanion.toLowerCase()) return false;
    return currentCategory ? show.category === currentCategory : !isDetachedShow(show);
  }));
  if (!candidates.length) {
    document.getElementById('surpriseStatus').textContent = 'No unwatched shows match these filters.';
    return;
  }
  closeSurprise();
  openDetail(candidates[Math.floor(Math.random() * candidates.length)].id);
}

// ── Sort dropdown (matches movie watchlist) ──
const SORT_LABELS = {
  'dateAdded-asc':'Oldest', 'dateAdded-desc':'Newest', 'year-desc':'Year ↓', 'year-asc':'Year ↑',
  'title-asc':'A–Z', 'rating-desc':'Rating', 'runtime-asc':'Runtime ↑', 'runtime-desc':'Runtime ↓',
  'dateWatched-desc':'Recently finished',
};
function effectiveSort() {
  if (Object.hasOwn(SORT_LABELS, currentSort)) return currentSort;
  if (['finished_for_good', 'more_to_come'].includes(currentFilter)) return 'dateWatched-desc';
  return currentFilter === 'categories' ? 'year-asc' : 'dateAdded-asc';
}
function updateSortLabel() {
  document.getElementById('sortBtnLabel').textContent = SORT_LABELS[effectiveSort()];
}
function toggleSortMenu(){
  const menu=document.getElementById('sortMenu');
  const btn=document.getElementById('sortBtn');
  if(!menu||!btn)return;
  if(menu.classList.contains('open')){closeSortMenu();return;}
  const rect=btn.getBoundingClientRect();
  menu.style.top=(rect.bottom+window.scrollY+6)+'px';
  menu.style.right=Math.max(8,window.innerWidth-rect.right)+'px';
  menu.style.left='auto';
  menu.classList.add('open');
  btn.classList.add('active');
  menu.querySelectorAll('.sort-menu-item').forEach(item=>{
    item.classList.toggle('active',item.dataset.sort===effectiveSort());
  });
}
function closeSortMenu(){
  document.getElementById('sortMenu')?.classList.remove('open');
  document.getElementById('sortBtn')?.classList.remove('active');
}
function setSort(val){
  if(currentSort===val){closeSortMenu();return;}
  currentSort=val;
  tvStorageSet('tvshows_sort',val);
  closeSortMenu();
  document.getElementById('sortBtnLabel').textContent=SORT_LABELS[val]||'Sort';
  render();
}
document.addEventListener('click',e=>{
  const menu=document.getElementById('sortMenu');
  if(!menu||!menu.classList.contains('open'))return;
  if(!e.target.closest('#sortMenu')&&!e.target.closest('#sortBtn'))closeSortMenu();
});

function adjustFilterBar(){
  if(window.innerWidth<=640)return;
  // Hide "Watching" tab if the bar wraps (watching shows are visible in the strip)
  const watchingBtn=document.querySelector('.filter-btn[onclick*="\'watching\'"]');
  const filterBar=document.querySelector('.filter-bar');
  if(!watchingBtn||!filterBar)return;
  watchingBtn.style.display='';
  const buttons=Array.from(filterBar.querySelectorAll('.filter-btn'));
  if(buttons.length<2)return;
  const firstTop=buttons[0].getBoundingClientRect().top;
  const wraps=buttons.some(btn=>btn.getBoundingClientRect().top>firstTop+4);
  watchingBtn.style.display=wraps?'none':'';
  if(wraps&&currentFilter==='watching'){
    currentFilter='all';currentCategory=null;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.filter-btn[onclick*="\'all\'"]')?.classList.add('active');
    render();
  }
}

// ── List view builders ──

document.addEventListener('keydown',e=>{
  if (e.defaultPrevented || e.isComposing) return;
  const dialogs = { bulkEditModal: closeBulkEdit, pasteImportModal: closePasteImport, surpriseModal: closeSurprise, exportModal: closeExport };
  const dialog = Object.keys(dialogs).find(id => document.getElementById(id).classList.contains('open'));
  if (dialog) {
    if (e.key === 'Escape') dialogs[dialog]();
    return;
  }
  if(e.key==='Escape'){
    const so=document.getElementById('shortcutsOverlay');
    if(so&&so.classList.contains('open')){closeShortcutsPanel();return;}
    const hadModal = document.querySelector('.modal-overlay.open');
    closePillMenu();closeSortMenu();closeAddModal();closeDetail();
    if (!hadModal && (searchQuery || document.getElementById('searchBarWrap').classList.contains('expanded'))) clearSearchBar();
    else if (!hadModal && selectionMode) exitSelectMode();
    return;
  }
  if(e.key==='Enter'&&!e.shiftKey){
    const modalOpen=document.getElementById('addModal').classList.contains('open');
    if(modalOpen){
      const active=document.activeElement;
      if(active&&active.matches('textarea,button,a,input[type=checkbox],input[type=radio],select,[contenteditable]'))return;
      if(document.getElementById('searchResults').classList.contains('open'))return;
      if(document.getElementById('categoryDropdown').style.display!=='none')return;
      e.preventDefault();
      saveShow();
      return;
    }
  }
  const inField=!!document.activeElement.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  // ── Detail modal shortcuts ──
  if(document.getElementById('detailModal').classList.contains('open')&&!document.getElementById('addModal').classList.contains('open')){
    if(!inField&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
      const linkClass = { j: 'btn-justwatch', i: 'detail-imdb', t: 'detail-tmdb' }[e.key.toLowerCase()];
      if (linkClass) {
        e.preventDefault();
        document.querySelector(`#detailContent .${linkClass}`)?.click();
        return;
      }
      if(e.key==='Enter' && !document.activeElement.matches('button,a,select,[contenteditable]')){
        const m=currentDetailId?shows.find(x=>x.id===currentDetailId):null;
        if(m&&!m.graveyard){
          e.preventDefault();
          if(!m.watching&&!m.watched){setShowStatus(currentDetailId,'watching');openDetail(currentDetailId);}
          else if(m.watching){showDetailStatusPicker(currentDetailId);}
          else{setShowStatus(currentDetailId,'unwatched');openDetail(currentDetailId);}
        }
        return;
      }
    }
  }
  // ── Add modal shortcuts ──
  if(document.getElementById('addModal').classList.contains('open')&&!inField&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
    if(e.key.toUpperCase()==='J'){
      e.preventDefault();
      const jw=document.getElementById('modalJustWatch');
      if(jw&&jw.style.pointerEvents!=='none')jw.click();
      return;
    }
    const svcMap={'N':'netflix','D':'disney','P':'prime','H':'hbomax','A':'appletv','O':'other'};
    const svc=svcMap[e.key.toUpperCase()];
    if(svc){
      e.preventDefault();
      const tile=document.querySelector(`.streaming-tile[data-service="${svc}"]`);
      if(tile)toggleTile(tile);
      return;
    }
  }
  const modalOpen = document.querySelector('.modal-overlay.open, .shortcuts-overlay.open');
  if (modalOpen) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    focusLibrarySearch(true);
    return;
  }
  if (!inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); openAddModalWithCategory(currentCategory); return; }
    if (e.key.toLowerCase() === 's') { e.preventDefault(); openSurprise(); return; }
    if (e.key === '?') { e.preventDefault(); openShortcutsPanel(); return; }
    if (e.key === '/') { e.preventDefault(); focusLibrarySearch(true); return; }
  }
  if (e.altKey && e.code === 'KeyT' && !inField) {
    e.preventDefault();
    openAddModalWithCategory(currentCategory);
    return;
  }
  // ── Global: ⌘+1/2/3 switch views ──
  if((e.metaKey||e.ctrlKey)&&!inField){
    if(e.key==='1'){e.preventDefault();setView('grid');return;}
    if(e.key==='2'){e.preventDefault();setView('compact');return;}
    if(e.key==='3'){e.preventDefault();setView('list');return;}
  }
  if(e.key.toLowerCase()==='z'&&(e.metaKey||e.ctrlKey)&&!e.shiftKey&&!inField){
    e.preventDefault();
    if(undoStack.length){redoStack.push(JSON.parse(JSON.stringify(shows)));shows=undoStack.pop();save(true);render();document.querySelectorAll('.toast').forEach(t=>dismissToast(t));showInfoToast(action + ' undone.',3000);}
  }
  if(e.key.toLowerCase()==='z'&&(e.metaKey||e.ctrlKey)&&e.shiftKey&&!inField){e.preventDefault();redoDelete();}
});

// ── Tooltip ──
(()=>{
  const tip=document.getElementById('cardTooltip');
  let timer=null;
  document.addEventListener('mouseover',e=>{
    const card=e.target.closest('[data-tooltip]');
    if(!card){clearTimeout(timer);tip.style.opacity='0';return;}
    clearTimeout(timer);
    timer=setTimeout(()=>{tip.textContent=card.dataset.tooltip;tip.style.opacity='1';},400);
  });
  document.addEventListener('mouseout',e=>{if(!e.target.closest('[data-tooltip]')){clearTimeout(timer);tip.style.opacity='0';}});
  document.addEventListener('mousemove',e=>{tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY+14)+'px';});
})();

document.addEventListener('click',e=>{
  const pop=document.getElementById('categoryPillPopover');
  if(pop&&pop.style.display!=='none'&&!pop.contains(e.target))closePillMenu();
});

// ── Toasts ──
function showDeleteToast(title) {
  showChangeToast(`${title} removed.`, 'Deletion');
}

function showChangeToast(message, action) {
  document.querySelectorAll('#toastContainer .toast:has(.toast-undo)').forEach(dismissToast);
  const DURATION=6000;
  const t=document.createElement('div');t.className='toast';
  t.innerHTML=`<span class="toast-msg">${esc(message)}</span><button class="toast-undo" onclick="undoDelete(this.closest('.toast'),${jsAttr(action)})">Undo</button><div class="toast-progress" style="animation:toastProgress ${DURATION}ms linear forwards;width:100%"></div>`;
  document.getElementById('toastContainer').appendChild(t);
  t._timer=setTimeout(()=>dismissToast(t),DURATION);
}
function dismissToast(t){clearTimeout(t._timer);t.classList.add('out');setTimeout(()=>t.remove(),220);}
function undoDelete(toast, action = 'Change'){
  if(!undoStack.length)return;
  redoStack.push(JSON.parse(JSON.stringify(shows)));
  shows=undoStack.pop();save(true);render();dismissToast(toast);
  showInfoToast('Change undone.',3000);
}
function redoDelete(){
  if(!redoStack.length)return;
  undoStack.push(JSON.parse(JSON.stringify(shows)));
  shows=redoStack.pop();save(true);render();
  showInfoToast('Change redone.',3000);
}
function showInfoToast(msg,dur=3000){
  const t=document.createElement('div');t.className='toast';
  t.innerHTML=`<span class="toast-msg">${esc(msg)}</span><div class="toast-progress" style="animation:toastProgress ${dur}ms linear forwards;width:100%"></div>`;
  document.getElementById('toastContainer').appendChild(t);
  t._timer=setTimeout(()=>dismissToast(t),dur);
}

// ── Drag-to-dismiss for mobile bottom sheets ─────────────────────────────
function initSheetDrag(modalId, closeFn) {
  const isMobile  = () => window.matchMedia('(max-width:640px)').matches;
  const overlay   = document.getElementById(modalId);
  const sheet     = overlay.querySelector('.modal');
  const body      = overlay.querySelector('.modal-body');

  const DISMISS_THRESHOLD = 100; // px dragged before auto-dismiss fires
  const HANDLE_ZONE       = 56;  // px from top of sheet treated as the handle area

  let startY    = null;
  let currentDY = 0;
  let dragging  = false;
  let eligible  = false;

  function snapBack() {
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
    sheet.style.transform  = '';
    setTimeout(() => { sheet.style.transition = ''; }, 300);
  }

  sheet.addEventListener('touchstart', e => {
    if (!isMobile()) return;
    const touch  = e.touches[0];
    const rect   = sheet.getBoundingClientRect();
    const localY = touch.clientY - rect.top;
    const bodyScrolled = body ? body.scrollTop > 0 : false;

    // Eligible when touching the handle zone, OR touching the body while at scroll top
    eligible  = localY < HANDLE_ZONE || !bodyScrolled;
    if (!eligible) return;

    startY    = touch.clientY;
    currentDY = 0;
    dragging  = false;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!eligible || startY === null) return;

    const dy = e.touches[0].clientY - startY;

    // Upward drag or body was scrolled — abandon the gesture
    if (dy < 0 || (!dragging && body && body.scrollTop > 0)) {
      eligible = false;
      snapBack();
      return;
    }

    dragging  = true;
    currentDY = dy;
    e.preventDefault();
    sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: false });

  function onEnd() {
    if (!eligible || !dragging) {
      eligible = dragging = false;
      startY = null;
      return;
    }

    const dy  = currentDY;
    eligible  = dragging = false;
    startY    = null;
    currentDY = 0;

    if (dy >= DISMISS_THRESHOLD) {
      sheet.style.transition = 'transform 0.22s cubic-bezier(0.32,0,0.67,0)';
      sheet.style.transform  = 'translateY(110%)';
      setTimeout(() => {
        sheet.style.transform  = '';
        sheet.style.transition = '';
        closeFn();
      }, 220);
    } else {
      snapBack();
    }
  }

  sheet.addEventListener('touchend',    onEnd, { passive: true });
  sheet.addEventListener('touchcancel', onEnd, { passive: true });
}

(function() {
  function setup() {
    initSheetDrag('detailModal', closeDetail);
    initSheetDrag('addModal', closeAddModal);
    initSheetDrag('pasteImportModal', closePasteImport);
    initSheetDrag('bulkEditModal', closeBulkEdit);
    initSheetDrag('surpriseModal', closeSurprise);
    initSheetDrag('exportModal', closeExport);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

function openShortcutsPanel(){
  const overlay = document.getElementById('shortcutsOverlay');
  if (overlay.classList.contains('open')) return;
  overlay.classList.add('open');
  lockScroll();
}
function closeShortcutsPanel(){
  const el=document.getElementById('shortcutsOverlay');
  if(!el.classList.contains('open'))return;
  el.classList.remove('open');
  unlockScroll();
}

function openBulkEdit() {
  const modal = document.getElementById('bulkEditModal');
  if (!selectedIds.size || modal.classList.contains('open')) return;
  for (const id of ['bulkSetCategory', 'bulkSetCompanion']) document.getElementById(id).checked = false;
  for (const id of ['bulkCategory', 'bulkCompanion', 'bulkOther']) document.getElementById(id).value = '';
  document.getElementById('bulkOther').hidden = true;
  document.getElementById('bulkCategories').replaceChildren(...getCategoryNames().map(name => new Option(name, name)));
  document.getElementById('companionSuggestions').replaceChildren(
    ...[...new Set(shows.map(show => show.watchWith).filter(Boolean))].sort().map(name => new Option(name, name))
  );
  document.getElementById('bulkService').replaceChildren(new Option('Keep existing services', ''),
    ...SERVICES.map(service => new Option(SERVICE_META[service].label, service)), new Option('Clear all services', 'clear'));
  modal.classList.add('open');
  lockScroll();
}

function closeBulkEdit() {
  const modal = document.getElementById('bulkEditModal');
  if (!modal.classList.contains('open')) return;
  modal.classList.remove('open');
  unlockScroll();
}

function applyBulkEdit() {
  const value = id => document.getElementById(id).value.trim();
  const items = selectedShows();
  const service = value('bulkService');
  const changeCategory = document.getElementById('bulkSetCategory').checked;
  const changeCompanion = document.getElementById('bulkSetCompanion').checked;
  if (items.length && (changeCategory || changeCompanion || service)) {
    for (const show of items) {
      if (changeCategory && show.category !== value('bulkCategory')) {
        show.category = value('bulkCategory');
        show.detachExempt = false;
      }
      if (changeCompanion) show.watchWith = value('bulkCompanion');
      if (service) {
        show.streaming = service === 'clear' ? {} : { [service]: { direct:true } };
        show.otherName = service === 'other' ? value('bulkOther') : '';
      }
    }
    save();
  }
  closeBulkEdit();
  exitSelectMode();
}
