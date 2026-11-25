function init(){
  updateBanner();updateSearchSection();
  if(window.innerWidth<=640){currentView='list';}
  applyViewToggleUI();
  render();
  requestAnimationFrame(adjustFilterBar);
  scheduleMetadata(1500);
}

init();
