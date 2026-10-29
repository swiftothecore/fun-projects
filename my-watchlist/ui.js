// View/search controls, keyboard shortcuts, bulk selection/actions, and browser gestures.
// Classic scripts intentionally expose handler functions to inline HTML events.

window.addEventListener('resize',()=>{
  if(window.innerWidth<=640&&currentView!=='list'){
    currentView='list';applyViewToggleUI();render();
  }
  _checkSoonLayout();
});

function setView(v){
  if(window.selectionMode) exitSelectMode(false);
  currentView=v;
  localStorage.setItem('watchlist_view',v);
  applyViewToggleUI();
  render();
}

function applyViewToggleUI(){
  document.getElementById('viewGrid')?.classList.toggle('active',currentView==='grid');
  document.getElementById('viewCompact')?.classList.toggle('active',currentView==='compact');
  document.getElementById('viewList')?.classList.toggle('active',currentView==='list');
  document.body.classList.toggle('compact-cards',currentView==='compact');
  // Group toggle
  const groupBtn=document.getElementById('groupToggleBtn');
  if(groupBtn){
    const onAll=currentFilter==='all';
    groupBtn.classList.toggle('active',currentGrouping==='grouped'&&onAll);
    groupBtn.style.opacity=onAll?'':'0.35';
    groupBtn.style.pointerEvents=onAll?'':'none';
    groupBtn.title=currentGrouping==='grouped'
      ?'Switch to flat list (no service sections)'
      :'Group by streaming service';
  }
  // Hide-watched toggle
  const eyeBtn=document.getElementById('hideWatchedBtn');
  if(eyeBtn){
    eyeBtn.classList.toggle('active',hideWatched);
    eyeBtn.title=hideWatched?'Show watched films':'Hide watched films';
  }
}

function toggleGrouping(){
  if(currentFilter!=='all')return;
  currentGrouping=currentGrouping==='grouped'?'flat':'grouped';
  localStorage.setItem('watchlist_grouping',currentGrouping);
  applyViewToggleUI();
  render();
}

function toggleHideWatched(){
  hideWatched=!hideWatched;
  localStorage.setItem('watchlist_hideWatched',hideWatched);
  applyViewToggleUI();
  render();
}

function setFilter(f,btn){
  if(window.selectionMode) exitSelectMode(false);
  // Clicking All is a "show me everything" reset, so drop any search query too
  if(f==='all'&&searchQuery){
    document.getElementById('searchBar').value='';
    const mi=document.getElementById('mobileSearchBarInput');
    if(mi){ mi.value=''; document.getElementById('mobileSearchBar').classList.remove('msb-active'); }
    searchQuery='';
    searchIncludesDetached=false;
    document.getElementById('searchBarWrap').classList.remove('expanded','has-query');
  }
  if(currentFilter===f&&f!=='all'){
    currentFilter='all';currentCategory=null;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    document.querySelector('.filter-btn[onclick*="\'all\'"]').classList.add('active');
  }else{
    currentFilter=f;
    if(f!=='categories')currentCategory=null;
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  }
  document.getElementById('categoryBar').classList.toggle('visible',currentFilter==='categories');
  document.getElementById('categoryOptions').classList.toggle('visible',currentFilter==='categories'&&!!currentCategory);
  // If we've left the watched tab, drop dateWatched sort back to the default
  if(currentFilter!=='watched'&&currentSort.startsWith('dateWatched')){
    currentSort='dateAdded-asc';
    localStorage.setItem('watchlist_sort',currentSort);
    updateSortBtnLabel();
  }
  // When entering the watched tab, default to date watched newest first
  if(currentFilter==='watched'&&!currentSort.startsWith('dateWatched')){
    currentSort='dateWatched-desc';
    localStorage.setItem('watchlist_sort',currentSort);
    updateSortBtnLabel();
  }
  // Group toggle is only usable on the All tab — refresh its enabled state
  applyViewToggleUI();
  render();
}

function toggleSortMenu(){
  const menu=document.getElementById('sortMenu');
  const btn=document.getElementById('sortBtn');
  if(!menu||!btn)return;
  if(menu.classList.contains('open')){closeSortMenu();return;}
  // Show the date-watched options only on the watched tab
  document.getElementById('watchedSortSection').style.display=currentFilter==='watched'?'block':'none';
  // Position the menu directly below the button, aligned to its right edge
  const rect=btn.getBoundingClientRect();
  menu.style.top=(rect.bottom+window.scrollY+6)+'px';
  menu.style.right=Math.max(8,window.innerWidth-rect.right)+'px';
  menu.style.left='auto';
  menu.classList.add('open');
  btn.classList.add('active');
  // Mark the currently-active option with a checkmark
  menu.querySelectorAll('.sort-menu-item').forEach(item=>{
    item.classList.toggle('active',item.dataset.sort===currentSort);
  });
}

function closeSortMenu(){
  document.getElementById('sortMenu')?.classList.remove('open');
  document.getElementById('sortBtn')?.classList.remove('active');
}

function setSort(value){
  if(currentSort===value){closeSortMenu();return;}
  currentSort=value;
  localStorage.setItem('watchlist_sort',value);
  closeSortMenu();
  updateSortBtnLabel();
  if(window.selectionMode)exitSelectMode(false);
  render();
}

function updateSortBtnLabel(){
  const el=document.getElementById('sortBtnLabel');
  if(el)el.textContent=SORT_LABELS[currentSort]||'Sort';
}

// Close the sort menu on any click outside of it
document.addEventListener('mousedown',e=>{
  const menu=document.getElementById('sortMenu');
  if(!menu||!menu.classList.contains('open'))return;
  if(!e.target.closest('#sortMenu')&&!e.target.closest('#sortBtn'))closeSortMenu();
});

// ── Inline text search bar ────────────────────────────────────────────────
function toggleSearchBar(){
  const w=document.getElementById('searchBarWrap');
  const i=document.getElementById('searchBar');
  if(w.classList.contains('expanded')){
    // Only collapse if empty — otherwise the icon does nothing while there's text
    if(!i.value){
      w.classList.remove('expanded');
    } else {
      i.focus();
    }
  } else {
    w.classList.add('expanded');
    setTimeout(()=>i.focus(),60);
  }
}

function onSearchBarInput(v){
  if(window.selectionMode)exitSelectMode(false);
  searchQuery=v.trim();
  searchIncludesDetached=false;
  document.getElementById('searchBarWrap').classList.toggle('has-query',!!searchQuery);
  render();
}

function clearSearchBar(){
  const i=document.getElementById('searchBar');
  i.value='';
  const mi=document.getElementById('mobileSearchBarInput');
  if(mi){ mi.value=''; document.getElementById('mobileSearchBar').classList.remove('msb-active'); }
  if(window.selectionMode)exitSelectMode(false);
  searchQuery='';
  searchIncludesDetached=false;
  const w=document.getElementById('searchBarWrap');
  w.classList.remove('has-query');
  render();
  if(mi && window.innerWidth<=640) mi.focus(); else i.focus();
}

function onSearchBarKeyDown(e){
  if(e.key==='Escape'){
    e.preventDefault();
    const i=document.getElementById('searchBar');
    const w=document.getElementById('searchBarWrap');
    // Escape always clears and fully dismisses in one go
    const hadQuery=!!i.value;
    i.value='';
    if(window.selectionMode)exitSelectMode(false);
    searchQuery='';
    searchIncludesDetached=false;
    w.classList.remove('expanded','has-query');
    if(hadQuery)render();
    const sy=window.scrollY;
    i.blur();
    window.scrollTo(0,sy);
  }
}

function onSearchBarBlur(){
  // Auto-collapse on blur if the input is empty so the controls bar stays tidy
  const w=document.getElementById('searchBarWrap');
  const i=document.getElementById('searchBar');
  if(!i.value)setTimeout(()=>w.classList.remove('expanded'),100);
}

// Cmd/Ctrl+K opens & focuses the inline search bar from anywhere on the page.
// Skipped when typing in another input or while a modal is open, to avoid
// hijacking text shortcuts the user actually wants.
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key==='k'){
    const inModalInput=e.target.closest('.modal-overlay.open input, .modal-overlay.open textarea');
    if(inModalInput)return;
    e.preventDefault();
    const w=document.getElementById('searchBarWrap');
    if(!w)return;
    w.classList.add('expanded');
    document.getElementById('searchBar').focus();
    document.getElementById('searchBar').select();
  }
});

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){const so=document.getElementById('shortcutsOverlay');if(so&&so.classList.contains('open')){closeShortcutsPanel();return;}if(window.selectionMode)exitSelectMode();closeSortMenu();closePillMenu();closeAddModal();closeDetail();if(typeof closePasteImportModal==='function')closePasteImportModal();if(typeof closeSurpriseModal==='function')closeSurpriseModal();if(typeof closeExportModal==='function')closeExportModal();if(typeof closeImportModal==='function')closeImportModal();return;}
  if(e.key==='Enter'&&!e.shiftKey){
    const modalOpen=document.getElementById('addModal').classList.contains('open');
    if(modalOpen){
      const active=document.activeElement;
      if(active&&active.tagName==='TEXTAREA')return;
      if(document.getElementById('searchResults').classList.contains('open'))return;
      if(document.getElementById('collectionDropdown').style.display!=='none')return;
      if(document.getElementById('categoryDropdown').style.display!=='none')return;
      e.preventDefault();
      saveMovie();
    }
  }

  // ── Streaming / status keyboard shortcuts (only when add modal is open, not in a text field) ──
  if(document.getElementById('addModal').classList.contains('open')){
    const active=document.activeElement;
    const inTextField=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA');
    if(!inTextField&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
      const key=e.key.toUpperCase();
      // N=Netflix, D=Disney+, P=Prime, C=Cinema, O=Other
      const SERVICE_KEYS={N:'netflix',D:'disney',P:'prime',C:'cinema',O:'other'};
      if(SERVICE_KEYS[key]){
        e.preventDefault();
        const service=SERVICE_KEYS[key];
        // Cinema has no VPN — Shift+C means "coming soon" instead
        const type=e.shiftKey?(service==='cinema'?'coming':'vpn'):'direct';
        const chip=document.querySelector(`.toggle-chip[data-service="${service}"][data-type="${type}"]`);
        if(chip){
          toggleChip(chip);
          chip.scrollIntoView({block:'nearest',behavior:'smooth'});
          // After activating, focus the relevant text input
          if(chip.classList.contains('active')){
            if(type==='vpn'){
              const vpnInput=document.getElementById(`fVpnCountry-${service}`);
              if(vpnInput&&vpnInput.classList.contains('visible'))vpnInput.focus();
            } else if(service==='other'){
              const otherInput=document.getElementById('fOtherName');
              if(otherInput&&otherInput.classList.contains('visible'))otherInput.focus();
            }
          }
        }
        return;
      }
      // / = focus the first visible VPN country input
      if(e.key==='/'){
        const vpnInput=document.querySelector('.vpn-country-input.visible');
        if(vpnInput){e.preventDefault();vpnInput.focus();}
        return;
      }
      // J = open JustWatch
      if(key==='J'){
        e.preventDefault();
        const jw=document.getElementById('modalJustWatch');
        if(jw&&jw.style.pointerEvents!=='none')jw.click();
        return;
      }
      // L = open Letterboxd
      if(key==='L'){
        e.preventDefault();
        const lb=document.getElementById('modalLetterboxd');
        if(lb&&lb.style.pointerEvents!=='none')lb.click();
        return;
      }
      if(key==='W'){
        e.preventDefault();
        if(e.shiftKey){
          const cb=document.getElementById('fWatched');
          if(cb){cb.checked=!cb.checked;cb.dispatchEvent(new Event('change'));cb.closest('label')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
        }else{
          const cb=document.getElementById('fWatchingSoon');
          if(cb){cb.checked=!cb.checked;cb.dispatchEvent(new Event('change'));cb.closest('label')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
        }
        return;
      }
    }
  }

  // ── Detail modal keyboard shortcuts ──
  if(document.getElementById('detailModal').classList.contains('open')&&!document.getElementById('addModal').classList.contains('open')){
    const inField=document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA';
    if(!inField&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
      const key=e.key.toUpperCase();
      if(key==='J'){
        e.preventDefault();
        const jw=document.querySelector('#detailContent .btn-justwatch');
        if(jw)jw.click();
        return;
      }
      if(key==='L'){
        e.preventDefault();
        const lb=document.querySelector('#detailContent .btn-letterboxd');
        if(lb)lb.click();
        return;
      }
      if(key==='T'){
        e.preventDefault();
        const tb=document.querySelector('#detailContent .btn-tmdb');
        if(tb)tb.click();
        return;
      }
      if(key==='I'){
        e.preventDefault();
        const ib=document.querySelector('#detailContent .btn-imdb');
        if(ib)ib.click();
        return;
      }
      if(key==='E'){
        e.preventDefault();
        if(currentDetailId) openEditFromDetail(currentDetailId);
        return;
      }
      if(e.key==='Enter'){
        const m=currentDetailId?movies.find(x=>x.id===currentDetailId):null;
        if(m&&!m.graveyard){e.preventDefault();toggleWatched(currentDetailId);}
        return;
      }
    }
  }

  const inField=document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA';
  const noModal=!document.querySelector('.modal-overlay.open')&&!document.getElementById('shortcutsOverlay')?.classList.contains('open');
  if(!inField&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&noModal){
    const key=e.key.toUpperCase();
    if(key==='A'){e.preventDefault();if(currentCategory)openAddModalWithCategory(currentCategory);else openAddModal();return;}
    if(key==='R'||key==='S'){e.preventDefault();openSurpriseModal();return;}
    if(key==='H'){e.preventDefault();toggleHideWatched();return;}
    if(key==='L'){e.preventDefault();openImportModal();return;}
    if(key==='P'){e.preventDefault();openPasteImportModal();return;}
    if(e.key==='?'){e.preventDefault();openShortcutsPanel();return;}
    if(e.key==='/'){e.preventDefault();const w=document.getElementById('searchBarWrap');if(w){w.classList.add('expanded');const sb=document.getElementById('searchBar');sb.focus();sb.select();}return;}
  }
  if(!inField&&(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey&&noModal){
    if(e.key==='1'){e.preventDefault();setView('grid');return;}
    if(e.key==='2'){e.preventDefault();setView('compact');return;}
    if(e.key==='3'){e.preventDefault();setView('list');return;}
  }
  if(e.altKey&&e.code==='KeyT'&&!inField&&!document.getElementById('addModal').classList.contains('open')){
    e.preventDefault();
    if(currentCategory) openAddModalWithCategory(currentCategory);
    else openAddModal();
    return;
  }
  // Require no open modal: the categorise panel has its own Cmd+Z undo, and both
  // firing at once would also roll back an unrelated earlier deletion.
  if(e.key==='z'&&(e.metaKey||e.ctrlKey)&&!e.shiftKey&&!inField&&noModal){
    e.preventDefault();
    if(undoStack.length){redoStack.push(JSON.parse(JSON.stringify(movies)));movies=undoStack.pop();save();render();document.querySelectorAll('.toast').forEach(t=>dismissToast(t));showInfoToast('Deletion undone.',3000);}
  }
  if(e.key==='z'&&(e.metaKey||e.ctrlKey)&&e.shiftKey&&!inField&&noModal){e.preventDefault();redoDelete();}
});

document.addEventListener('mousedown',e=>{
  const pop=document.getElementById('categoryPillPopover');
  if(pop&&pop.style.display!=='none'&&!pop.contains(e.target))closePillMenu();
});

// ── Drag-to-dismiss for mobile bottom sheets ─────────────────────────────
function initSheetDrag(modalId, closeFn) {
  const isMobile  = () => window.matchMedia('(max-width:600px)').matches;
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
    initSheetDrag('detailModal',      closeDetail);
    initSheetDrag('addModal',         closeAddModal);
    initSheetDrag('surpriseModal',    closeSurpriseModal);
    initSheetDrag('importModal',      closeImportModal);
    initSheetDrag('pasteImportModal', closePasteImportModal);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// ── Lazy image loading — custom observer with aggressive pre-fetch ─────────
// 800px rootMargin means posters start loading well before they reach the
// viewport, so by the time the user scrolls to them they're already done.
(function(){
  const obs = new IntersectionObserver((entries, ob) => {
    for(const e of entries){
      if(!e.isIntersecting) continue;
      const img = e.target;
      const src = img.dataset.src;
      if(src){ img.src = src; img.removeAttribute('data-src'); }
      ob.unobserve(img);
    }
  }, { rootMargin:'800px 0px' });

  // Watch for new img[data-src] elements added anywhere in the DOM
  // (fires whenever render() or any other function sets innerHTML)
  new MutationObserver(muts => {
    for(const mut of muts){
      for(const node of mut.addedNodes){
        if(node.nodeType !== 1) continue;
        if(node.tagName === 'IMG' && node.dataset.src) obs.observe(node);
        if(node.querySelectorAll) node.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
      }
    }
  }).observe(document.body, { childList:true, subtree:true });

  // Catch any img[data-src] elements already in the DOM from the initial render
  // (MutationObserver only sees future additions, not past ones)
  document.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
})();

// ── Bulk Selection ─────────────────────────────────────────────────────────

window.selectionMode = false;

window.selectedIds   = new Set();

function enterSelectMode(){
  window.selectionMode = true;
  window.selectedIds   = new Set();
  document.getElementById('selectModeBtn')?.classList.add('active');
  document.getElementById('movieGrid').classList.add('selection-mode');
  document.getElementById('bulkBar').classList.add('visible');
  document.body.classList.add('bulk-mode');
  // Label flips based on which list is currently active
  const xBtn = document.getElementById('bulkChristmasBtn');
  if(xBtn) xBtn.textContent = christmasMode ? '📋 Normal List' : '🎄 Christmas';
  updateBulkBar();
}

// doRender=false lets callers run render() themselves after cleanup,
// avoiding a double render when called from setFilter/setView/bulk actions.
// Cancel and Escape pass no argument and get false — no re-render needed
// since no data has changed, only visual selection state is being cleared.
function exitSelectMode(doRender=false){
  if(!window.selectionMode) return;
  window.selectionMode = false;
  window.selectedIds   = new Set();
  document.getElementById('selectModeBtn')?.classList.remove('active');
  document.getElementById('movieGrid').classList.remove('selection-mode');
  document.querySelectorAll('.card-selected').forEach(el=>el.classList.remove('card-selected'));
  document.getElementById('bulkBar').classList.remove('visible');
  closeBulkSubpanel();
  document.body.classList.remove('bulk-mode');
  if(doRender) render();
}

function toggleSelect(id){
  const els = document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`);
  if(window.selectedIds.has(id)){
    window.selectedIds.delete(id);
    els.forEach(el=>el.classList.remove('card-selected'));
  } else {
    window.selectedIds.add(id);
    els.forEach(el=>el.classList.add('card-selected'));
  }
  updateBulkBar();
}

function bulkSelectAll(){
  const visibleIds = [...new Set(
    [...document.querySelectorAll('#movieGrid [data-id]')].map(el=>el.dataset.id)
  )];
  const allSelected = visibleIds.length > 0 &&
    visibleIds.every(id => window.selectedIds.has(id));

  if(allSelected){
    window.selectedIds.clear();
    document.querySelectorAll('#movieGrid .card-selected').forEach(el=>el.classList.remove('card-selected'));
  } else {
    visibleIds.forEach(id=>{
      window.selectedIds.add(id);
      document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(el=>el.classList.add('card-selected'));
    });
  }
  updateBulkBar();
}

function updateBulkBar(){
  const n = window.selectedIds.size;
  const countEl = document.getElementById('bulkCount');
  if(countEl) countEl.textContent = n === 0 ? 'None selected' : `${n} selected`;

  const allBtn = document.getElementById('bulkSelectAllBtn');
  if(allBtn){
    const visEls = document.querySelectorAll('#movieGrid [data-id]');
    const allSel = visEls.length > 0 && [...visEls].every(el=>window.selectedIds.has(el.dataset.id));
    allBtn.textContent = allSel ? 'Deselect All' : 'Select All';
  }

  document.querySelectorAll('.bulk-action-btn').forEach(btn=>{ btn.disabled = n === 0; });
}

function openBulkSubpanel(type){
  _bulkPanel = type;
  const sp = document.getElementById('bulkSubpanel');
  const n  = window.selectedIds.size;

  if(type === 'service'){
    sp.innerHTML = `
      <div class="bulk-subpanel-label">Set streaming service — replaces existing info on ${n} film${n!==1?'s':''}</div>
      <div class="bulk-subpanel-chips">
        <button class="bulk-svc-chip" data-svc="netflix" onclick="onBulkSvcPick(this)"><span style="width:5px;height:5px;border-radius:50%;background:#e50914;display:inline-block;flex-shrink:0;"></span>Netflix</button>
        <button class="bulk-svc-chip" data-svc="disney"  onclick="onBulkSvcPick(this)"><span style="width:5px;height:5px;border-radius:50%;background:#3b82f6;display:inline-block;flex-shrink:0;"></span>Disney+</button>
        <button class="bulk-svc-chip" data-svc="prime"   onclick="onBulkSvcPick(this)"><span style="width:5px;height:5px;border-radius:50%;background:#00a8e1;display:inline-block;flex-shrink:0;"></span>Prime</button>
        <button class="bulk-svc-chip" data-svc="cinema"  onclick="onBulkSvcPick(this)"><span style="width:5px;height:5px;border-radius:50%;background:#818cf8;display:inline-block;flex-shrink:0;"></span>Cinema</button>
        <button class="bulk-svc-chip" data-svc="other"   onclick="onBulkSvcPick(this)"><span style="width:5px;height:5px;border-radius:50%;background:#4a7c59;display:inline-block;flex-shrink:0;"></span>Other</button>
        <button class="bulk-svc-chip" data-svc="clear"   onclick="onBulkSvcPick(this)">✕ Clear service</button>
      </div>
      <div class="bulk-subpanel-options" id="bulkSvcOpts" style="display:none;">
        <label class="toggle-row" id="bulkVpnLabel" style="margin:0;">
          <input type="checkbox" id="bulkSvcVpn" onchange="document.getElementById('bulkSvcCountry').style.display=this.checked?'':'none'">
          <span class="track"></span>
          <span class="toggle-label">VPN only</span>
        </label>
        <input type="text" id="bulkSvcCountry" placeholder="VPN country…" style="display:none;max-width:160px;">
        <input type="text" id="bulkOtherName"  placeholder="Service name (e.g. Apple TV)…" style="display:none;flex:1;">
        <button class="bulk-btn" style="border-color:var(--gold-dim);color:var(--gold);" onclick="applyBulkService()">Apply</button>
        <button class="bulk-btn" onclick="closeBulkSubpanel()">Cancel</button>
      </div>`;
  } else if(type === 'category'){
    const existing = [...new Set(movies.map(m=>m.category).filter(Boolean))].sort();
    const chips = existing.map(c =>
      `<button class="bulk-svc-chip" onclick="document.getElementById('bulkCatInput').value=${jsAttr(c)}">${esc(c)}</button>`
    ).join('');
    sp.innerHTML = `
      <div class="bulk-subpanel-label">Set category on ${n} film${n!==1?'s':''} — leave blank to clear</div>
      ${chips ? `<div class="bulk-subpanel-chips">${chips}</div>` : ''}
      <div class="bulk-subpanel-options">
        <input type="text" id="bulkCatInput" placeholder="Category name… (leave blank to clear)" style="flex:1;">
        <button class="bulk-btn" style="border-color:var(--gold-dim);color:var(--gold);" onclick="applyBulkCategory()">Apply</button>
        <button class="bulk-btn" onclick="closeBulkSubpanel()">Cancel</button>
      </div>`;
  }
  sp.classList.add('visible');
}

function onBulkSvcPick(btn){
  document.querySelectorAll('#bulkSubpanel .bulk-svc-chip').forEach(c=>c.classList.remove('active'));
  btn.classList.add('active');
  const svc  = btn.dataset.svc;
  const opts = document.getElementById('bulkSvcOpts');
  const vpnL = document.getElementById('bulkVpnLabel');
  const oth  = document.getElementById('bulkOtherName');
  if(!opts) return;
  opts.style.display = '';
  if(vpnL)  vpnL.style.display  = (svc==='cinema'||svc==='clear') ? 'none' : '';
  if(oth)   oth.style.display   = svc === 'other' ? '' : 'none';
}

function closeBulkSubpanel(){
  _bulkPanel = null;
  const sp = document.getElementById('bulkSubpanel');
  if(sp){ sp.classList.remove('visible'); sp.innerHTML=''; }
}

// ── Bulk action implementations ──

function applyBulkService(){
  const chip = document.querySelector('#bulkSubpanel .bulk-svc-chip.active');
  if(!chip) return;
  // Read all values before any DOM teardown
  const svc       = chip.dataset.svc;
  const isVpn     = document.getElementById('bulkSvcVpn')?.checked || false;
  const country   = document.getElementById('bulkSvcCountry')?.value.trim() || '';
  const otherName = document.getElementById('bulkOtherName')?.value.trim() || '';
  const targets   = movies.filter(m=>window.selectedIds.has(m.id));

  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{
    m.streaming = {};
    if(svc === 'clear'){ m.otherName=''; return; }
    if(svc === 'other') m.otherName = otherName;
    m.streaming[svc] = { direct:!isVpn, vpn:!!isVpn, vpnCountry:isVpn?country:'' };
  });
  save(); exitSelectMode(false); render();
  showInfoToast(`Service updated for ${targets.length} film${targets.length!==1?'s':''}.`, 3000);
}

function applyBulkCategory(){
  const cat     = (document.getElementById('bulkCatInput')?.value||'').trim();
  const targets = movies.filter(m=>window.selectedIds.has(m.id));
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{ m.category=cat; });
  save(); exitSelectMode(false); render();
  showInfoToast(
    cat ? `Category set to "${cat}" for ${targets.length} film${targets.length!==1?'s':''}.`
        : `Category cleared for ${targets.length} film${targets.length!==1?'s':''}.`,
    3000
  );
}

function bulkWatch(){
  if(!window.selectedIds.size) return;
  const now     = new Date().toISOString();
  const targets = movies.filter(m=>window.selectedIds.has(m.id));
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{ m.watched=true; m.watchingSoon=false; if(!m.dateWatched)m.dateWatched=now; });
  save(); exitSelectMode(false); render();
  showInfoToast(`${targets.length} film${targets.length!==1?'s':''} marked as watched.`, 3000);
}

function bulkUnwatch(){
  if(!window.selectedIds.size) return;
  const targets = movies.filter(m=>window.selectedIds.has(m.id));
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{ m.watched=false; m.dateWatched=undefined; m.rewatch=false; m.rewatchingSoon=false; });
  save(); exitSelectMode(false); render();
  showInfoToast(`${targets.length} film${targets.length!==1?'s':''} marked as unwatched.`, 3000);
}

function bulkWatchingSoon(){
  if(!window.selectedIds.size) return;
  const targets = movies.filter(m=>window.selectedIds.has(m.id)&&!m.watched&&!m.graveyard);
  if(!targets.length){
    showInfoToast('No eligible films — watched or graveyard films are skipped.', 3000);
    return;
  }
  const allSoon = targets.every(m=>m.watchingSoon);
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{ m.watchingSoon=!allSoon; });
  save(); exitSelectMode(false); render();
  showInfoToast(`${targets.length} film${targets.length!==1?'s':''} ${allSoon?'removed from':'added to'} Watching Soon.`, 3000);
}

function bulkGraveyard(){
  if(!window.selectedIds.size) return;
  const targets     = movies.filter(m=>window.selectedIds.has(m.id));
  const allInGrave  = targets.every(m=>m.graveyard);
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  targets.forEach(m=>{
    m.graveyard=!allInGrave;
    if(m.graveyard){ m.watched=false; m.watchingSoon=false; m.rewatch=false; m.rewatchingSoon=false; m.dateWatched=undefined; }
  });
  save(); exitSelectMode(false); render();
  showInfoToast(`${targets.length} film${targets.length!==1?'s':''} ${allInGrave?'removed from':'moved to'} Graveyard.`, 3000);
}

function bulkMoveToChristmas(){
  if(!window.selectedIds.size) return;
  const targets = movies.filter(m=>window.selectedIds.has(m.id));
  const n = targets.length;

  if(!christmasMode){
    // Normal → Christmas: remove from normal list, add to christmas list
    movies = movies.filter(m=>!window.selectedIds.has(m.id));
    christmasMovies = [...(christmasMovies||[]), ...targets];
    save(); // saves updated normal movies to watchlist_v2
    localStorage.setItem('christmas_watchlist_v1', JSON.stringify(christmasMovies));
    if(window._sbSyncNow&&!window._sbPaused) window._sbSyncNow();
    exitSelectMode(false); render();
    showInfoToast(`${n} film${n!==1?'s':''} moved to Christmas list. 🎄`, 3500);
  } else {
    // Christmas → Normal: remove from christmas list, add to normal list
    // In christmas mode: movies = christmas list, _normalMovies = normal list
    movies = movies.filter(m=>!window.selectedIds.has(m.id));
    _normalMovies = [...(_normalMovies||[]), ...targets];
    save(); // saves updated christmas movies to christmas_watchlist_v1
    localStorage.setItem('watchlist_v2', JSON.stringify(_normalMovies));
    if(window._sbSyncNow&&!window._sbPaused) window._sbSyncNow();
    exitSelectMode(false); render();
    showInfoToast(`${n} film${n!==1?'s':''} moved to Normal list.`, 3500);
  }
}

function bulkDelete(){
  if(!window.selectedIds.size) return;
  const n   = window.selectedIds.size;
  const ids = new Set(window.selectedIds); // capture before exitSelectMode clears it
  undoStack.push(JSON.parse(JSON.stringify(movies))); redoStack=[];
  movies = movies.filter(m=>!ids.has(m.id));
  save(); exitSelectMode(false); render();
  // Undo toast (matches existing single-delete pattern)
  const DUR = 8000;
  const t   = document.createElement('div'); t.className='toast';
  t.innerHTML=`<span class="toast-msg"><strong>${n} film${n!==1?'s':''}</strong> deleted.</span><button class="toast-undo" onclick="undoDelete(this.closest('.toast'))">Undo</button><div class="toast-progress" style="animation:toastProgress ${DUR}ms linear forwards;width:100%"></div>`;
  document.getElementById('toastContainer').appendChild(t);
  t._timer=setTimeout(()=>dismissToast(t),DUR);
}

// Forward trackpad/wheel scroll on the backdrop into the modal.
// On desktop the scrollable element is .modal (the card); on mobile it's .modal-body.
(function(){
  const overlay = document.getElementById('addModal');
  if(!overlay) return;
  overlay.addEventListener('wheel', function(e){
    if(!overlay.classList.contains('open')) return;
    const card = overlay.querySelector('.modal');
    if(!card) return;
    if(card.contains(e.target)) return; // inside the card — scroll naturally
    // Pick whichever element actually scrolls
    const scrollEl = card.scrollHeight > card.clientHeight
      ? card
      : (card.querySelector('.modal-body') || card);
    e.preventDefault();
    let delta = e.deltaY;
    if(e.deltaMode === 1) delta *= 16;
    if(e.deltaMode === 2) delta *= scrollEl.clientHeight;
    scrollEl.scrollTop += delta;
  }, { passive: false });
})();

// Uses the capturing phase so this fires before the card's inline onclick="openDetail(id)",
// letting stopPropagation() prevent openDetail from running.
document.addEventListener('click', function(e){
  if(!e.shiftKey && !e.metaKey && !e.ctrlKey) return;
  const card = e.target.closest('[data-id]');
  if(!card) return;
  e.stopPropagation();
  e.preventDefault();
  if(!window.selectionMode) enterSelectMode();
  toggleSelect(card.dataset.id);
}, true);

function openShortcutsPanel(){
  document.getElementById('shortcutsOverlay').classList.add('open');
  lockScroll();
}

function closeShortcutsPanel(){
  const el=document.getElementById('shortcutsOverlay');
  if(!el.classList.contains('open'))return;
  el.classList.remove('open');
  unlockScroll();
}

// ── Mobile bottom search bar helpers ─────────────────────────────────────
function _msbInput(v){
  onSearchBarInput(v);
  document.getElementById('mobileSearchBar').classList.toggle('msb-active', !!v.trim());
}

function _msbClear(){
  const inp = document.getElementById('mobileSearchBarInput');
  if(inp){ inp.value = ''; inp.focus(); }
  _msbInput('');
}
