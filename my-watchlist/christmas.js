// Christmas list switching, snow, and decorative lights.
// Classic scripts intentionally expose handler functions to inline HTML events.

function toggleChristmasMode(){
  // Exit restores the normal watchlist; entering selects the Christmas list.
  // Both lists keep stable owners in state instead of swapping array globals.
  state.christmasMode=!state.christmasMode;
  // Clear ephemeral undo history when switching modes
  state.undoStack=[];state.redoStack=[];
  writeStorage('christmas_mode_active',state.christmasMode?'true':'false');
  document.body.classList.toggle('christmas-mode',state.christmasMode);
  document.getElementById('christmasToggleBtn').classList.toggle('active',state.christmasMode);
  document.getElementById('christmasBanner').classList.toggle('visible',state.christmasMode);
  if(state.christmasMode)startChristmasEffects();else stopChristmasEffects();
  // Reset filter to All
  state.currentFilter='all';state.currentCategory=null;
  document.getElementById('categoryBar').classList.remove('visible');
  document.getElementById('categoryOptions').classList.remove('visible');
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.filter-btn[onclick*="\'all\'"]')?.classList.add('active');
  applyViewToggleUI();
  render();
  showInfoToast(state.christmasMode?'🎄 Christmas Mode — films here are completely separate from your main watchlist.':'Returned to your main watchlist.',4000);
}

function _initSnowCanvas(){
  if(state._snowCvs)return;
  state._snowCvs=document.createElement('canvas');
  state._snowCvs.style.cssText='position:fixed;top:0;left:0;pointer-events:none;z-index:9990;';
  document.body.appendChild(state._snowCvs);
  state._snowCtx=state._snowCvs.getContext('2d');
  _resizeSnowCanvas();
  window.addEventListener('resize',_resizeSnowCanvas);
}

function _resizeSnowCanvas(){
  if(!state._snowCvs)return;
  state._snowCvs.width=window.innerWidth;state._snowCvs.height=window.innerHeight;
}

function _newFlake(){
  return{x:Math.random()*window.innerWidth,y:-30,sz:10+Math.random()*20,vy:0.45+Math.random()*1.1,vx:(Math.random()-0.5)*0.35,rot:Math.random()*Math.PI*2,vrot:(Math.random()-0.5)*0.014,op:0.3+Math.random()*0.6};
}

function _tickSnow(){
  if(!state._snowCvs)return;
  state._snowCtx.clearRect(0,0,state._snowCvs.width,state._snowCvs.height);
  if(state._snowFlakes.length<55&&Math.random()<0.25)state._snowFlakes.push(_newFlake());
  for(let i=state._snowFlakes.length-1;i>=0;i--){
    const f=state._snowFlakes[i];
    state._snowCtx.save();
    state._snowCtx.globalAlpha=f.op;
    state._snowCtx.font=`${f.sz}px serif`;
    state._snowCtx.fillStyle='#fff';
    state._snowCtx.translate(f.x,f.y);
    state._snowCtx.rotate(f.rot);
    state._snowCtx.fillText('❄',-(f.sz*0.44),(f.sz*0.4));
    state._snowCtx.restore();
    f.y+=f.vy;f.x+=f.vx;f.rot+=f.vrot;
    if(f.y>state._snowCvs.height+40)state._snowFlakes.splice(i,1);
  }
  state._snowRaf=requestAnimationFrame(_tickSnow);
}

function _startSnow(){_initSnowCanvas();state._snowFlakes=[];if(state._snowRaf)cancelAnimationFrame(state._snowRaf);state._snowCvs.style.display='';_tickSnow();}

function _stopSnow(){if(state._snowRaf){cancelAnimationFrame(state._snowRaf);state._snowRaf=null;}if(state._snowCvs){state._snowCtx.clearRect(0,0,state._snowCvs.width,state._snowCvs.height);state._snowCvs.style.display='none';}state._snowFlakes=[];}

function buildChristmasLights(){
  const el=document.getElementById('christmasLights');
  if(!el||el.style.display==='none')return;
  // clientWidth excludes scrollbar so the SVG never causes horizontal overflow
  const W=document.documentElement.clientWidth;
  const SAG=15,SY=7,H=50,spacing=54;
  const n=Math.max(6,Math.floor(W/spacing));

  let s=`<defs><filter id="xglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>`;
  // String
  s+=`<path d="M0,${SY} Q${W/2},${SY+SAG} ${W},${SY}" stroke="#2a2010" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

  for(let i=0;i<n;i++){
    const t=(i+0.5)/n;
    const x=+(t*W).toFixed(1);
    const y=+(SY+SAG*4*t*(1-t)).toFixed(1);
    const col=_bulbCols[i%_bulbCols.length];
    const delay=(Math.random()*4).toFixed(2);
    const dur=(1.3+Math.random()*2.4).toFixed(2);
    const anim=`animation:xmasTwinkle ${dur}s ${delay}s ease-in-out infinite`;
    // Wire — starts at string y, ends exactly where cap begins
    s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${y+10}" stroke="#2a2010" stroke-width="1.3"/>`;
    // Cap — sits flush on top of bulb, wire overlaps its top edge by 1px
    s+=`<rect x="${x-3}" y="${y+9}" width="6" height="5" rx="1.5" fill="#3a2e10"/>`;
    // Glow halo — center lines up with bulb center
    s+=`<ellipse cx="${x}" cy="${y+22}" rx="8" ry="10" fill="${col}" opacity="0.3" filter="url(#xglow)" style="${anim}"/>`;
    // Bulb body — top edge (cy - ry = y+22-8 = y+14) touches cap bottom (y+14) exactly
    s+=`<ellipse cx="${x}" cy="${y+22}" rx="5.5" ry="8" fill="${col}" style="${anim}"/>`;
    // Shine spot
    s+=`<ellipse cx="${x-1.5}" cy="${y+17}" rx="1.4" ry="2" fill="rgba(255,255,255,0.42)" style="${anim}"/>`;
  }

  el.innerHTML=`<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="overflow:visible;display:block;">${s}</svg>`;
}

function _onLightsResize(){
  clearTimeout(state._lightsResizeTimer);
  state._lightsResizeTimer=setTimeout(buildChristmasLights,120);
}

function startChristmasEffects(){
  const el=document.getElementById('christmasLights');
  if(el){el.style.display='';buildChristmasLights();}
  window.addEventListener('resize',_onLightsResize);
  _startSnow();
}

function stopChristmasEffects(){
  const el=document.getElementById('christmasLights');
  if(el){el.style.display='none';el.innerHTML='';}
  window.removeEventListener('resize',_onLightsResize);
  _stopSnow();
}
