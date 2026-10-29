// Start only after every classic script and all markup are available.
// Classic scripts intentionally expose handler functions to inline HTML events.

function init() {
  updateBanner();
  updateSearchSection();
  if (window.innerWidth <= 640) {
    state.currentView = 'list';
  }
  applyViewToggleUI();
  if (state.christmasMode) {
    document.body.classList.add('christmas-mode');
    document.getElementById('christmasToggleBtn').classList.add('active');
    document.getElementById('christmasBanner').classList.add('visible');
  }
  render();
  updateSortBtnLabel();
  if (state.christmasMode) requestAnimationFrame(startChristmasEffects);
  // Backfill runtimes for any existing movies that don't have one yet
  scheduleBackfills(1000);
}

init();

// Run immediately if supabase loaded synchronously; otherwise the script's
// onload fires _sbLibReady() once the async download completes.
if (typeof supabase !== 'undefined') {
  _sbRun();
} else {
  window._sbLibReady = _sbRun;
}
