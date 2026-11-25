// ── Date helpers ──
function formatDateAdded(dateStr){
  if(!dateStr || !Number.isFinite(new Date(dateStr).getTime()))return'Added: unknown';
  const todayStr=localDateStr(new Date()),addedStr=localDateStr(new Date(dateStr));
  const days=Math.round((new Date(todayStr)-new Date(addedStr))/86400000);
  if(days===0)return'Added today';if(days===1)return'Added yesterday';
  if(days<30)return`Added ${days} days ago`;if(days<60)return'Added ~1 month ago';
  if(days<365)return`Added ~${Math.floor(days/30)} months ago`;if(days<730)return'Added ~1 year ago';
  return`Added ~${Math.floor(days/365)} years ago`;
}
function formatDateWatched(dateStr){
  if(!dateStr || !Number.isFinite(new Date(dateStr).getTime()))return'Finished: unknown';
  const todayStr=localDateStr(new Date()),watchedStr=localDateStr(new Date(dateStr));
  const days=Math.round((new Date(todayStr)-new Date(watchedStr))/86400000);
  if(days===0)return'Finished today';if(days===1)return'Finished yesterday';
  if(days<30)return`Finished ${days} days ago`;if(days<60)return'Finished ~1 month ago';
  if(days<365)return`Finished ~${Math.floor(days/30)} months ago`;if(days<730)return'Finished ~1 year ago';
  return`Finished ~${Math.floor(days/365)} years ago`;
}

// ── Staleness (for unwatched shows) ──
function getStaleClass(m){
  if(m.watching||m.watched||m.graveyard||!m.dateAdded)return'';
  const days=(Date.now()-new Date(m.dateAdded).getTime())/86400000;
  if(days>365)return' card-stale-purple';
  if(days>180)return' card-stale-crimson';
  if(days>90)return' card-stale-red';
  if(days>60)return' card-stale-orange';
  if(days>30)return' card-stale-amber';
  return'';
}

// ── Sorting / grouping helpers ──
const timestamp = value => Date.parse(value) || 0;
const sortOldestFirst = (a, b) => (timestamp(a.dateAdded) || Infinity) - (timestamp(b.dateAdded) || Infinity);
const sortRecentlyFinished = (a, b) => timestamp(b.dateWatched) - timestamp(a.dateWatched);

function sortShows(items, defaultSort = 'dateAdded-asc') {
  return items.slice().sort((a, b) => {
    switch (currentSort || defaultSort) {
      case 'dateWatched-desc': return sortRecentlyFinished(a, b) || sortOldestFirst(a, b);
      case 'dateAdded-desc': return timestamp(b.dateAdded) - timestamp(a.dateAdded);
      case 'year-desc': return (parseInt(b.year) || 0) - (parseInt(a.year) || 0) || sortOldestFirst(a, b);
      case 'year-asc': return (parseInt(a.year) || Infinity) - (parseInt(b.year) || Infinity) || sortOldestFirst(a, b);
      case 'title-asc': {
        const title = value => value.replace(/^(the |a |an )/i, '').toLowerCase();
        return title(a.title).localeCompare(title(b.title));
      }
      case 'rating-desc': return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0) || sortOldestFirst(a, b);
      case 'runtime-asc': return (positiveInteger(a.episodeRuntime) || Infinity) - (positiveInteger(b.episodeRuntime) || Infinity) || sortOldestFirst(a, b);
      case 'runtime-desc': return (positiveInteger(b.episodeRuntime) || 0) - (positiveInteger(a.episodeRuntime) || 0) || sortOldestFirst(a, b);
      default: return sortOldestFirst(a, b);
    }
  });
}

function _postFilter(items, defaultSort) {
  const sorted = sortShows(items, defaultSort);
  if (!searchQuery) return sorted;
  const q = searchQuery.toLowerCase();
  return sorted.map(show => {
    const title = show.title.toLowerCase();
    let score = 0;
    if (title === q) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if ([show.genre, show.category, show.creator, show.watchWith, show.year, show.otherName, show.notes]
      .some(value => typeof value === 'string' && value.toLowerCase().includes(q))) score = 10;
    return { show, score };
  }).filter(result => result.score).sort((a, b) => b.score - a.score).map(result => result.show);
}

function buildCard(m,i){
  const stale=getStaleClass(m);
  const graveyardCls=m.graveyard?' card-graveyard':'';
  const finishedCls=(m.watched&&m.watchStatus==='finished_for_good')?' card-finished':'';
  const selectedCls=selectedIds.has(m.id)?' selected':'';
  const ph=m.poster
    ?`<img class="card-poster" src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="card-poster-placeholder" style="display:none">📺<span>No poster</span></div>`
    :`<div class="card-poster-placeholder">📺<span>No poster</span></div>`;
  let ov='';
  if(m.graveyard)ov=`<div class="card-graveyard-overlay"><span class="graveyard-stamp">💀 Dropped</span></div>`;
  else if(m.watching)ov=`<div class="card-watching-overlay"><span class="watching-stamp">Watching</span></div>`;
  else if(m.watched&&m.watchStatus==='more_to_come')ov=`<div class="card-more-overlay"><span class="more-stamp">More Seasons</span></div>`;
  else if(m.watched&&m.watchStatus==='finished_for_good')ov=`<div class="card-finished-overlay"><span class="finished-stamp">✓ Finished</span></div>`;
  if (m.watchSoon && !m.graveyard && !m.watching) {
    ov += `<span class="card-planned-tag">${m.watched ? 'Rewatch soon' : 'Watch soon'}</span>`;
  }
  const tooltip=m.watched?formatDateWatched(m.dateWatched):formatDateAdded(m.dateAdded);
  const binge=getBingeTime(m);
  const secondaryMeta = [binge ? `⏱ ${binge}` : '', m.rtRating ? `RT ${esc(m.rtRating)}` : ''].filter(Boolean).join(' · ');
  const clickFn=`selectionMode?toggleSelectShow(${jsAttr(m.id)}):openDetail(${jsAttr(m.id)})`;
  const exemptPip=(currentFilter==='categories'&&m.detachExempt&&categorySettings[m.category]?.detached)?`<div class="detach-exempt-pip">Visible</div>`:'';
  return`<div class="card${stale}${graveyardCls}${finishedCls}${selectedCls}" role="button" tabindex="0" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();this.click()}" onclick="${clickFn}" data-id="${esc(m.id)}" data-tooltip="${tooltip}" style="animation-delay:${i*0.03}s">${ph}${ov}${exemptPip}<div class="card-body"><div class="card-title">${esc(m.title)}</div><div class="card-meta">${[m.year,m.genre].filter(Boolean).map(esc).join(' &middot; ')}</div>${secondaryMeta ? `<div class="card-meta card-secondary-meta">${secondaryMeta}</div>` :''}<div class="card-services">${buildBadges(m,true)}</div></div></div>`;
}

function buildWatchingCard(m, i, upcoming = false){
  const img=m.poster
    ?`<img class="watching-card-poster" src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="watching-card-placeholder" style="display:none">📺</div>`
    :`<div class="watching-card-placeholder">📺</div>`;
  return`<div class="watching-card${selectedIds.has(m.id) ? ' selected' : ''}" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();this.click()}" onclick="selectionMode?toggleSelectShow(${jsAttr(m.id)}):openDetail(${jsAttr(m.id)})" data-id="${esc(m.id)}" style="animation-delay:${i*0.04}s">${m.watching ? '<div class="watching-pip"></div>' : ''}${img}<div class="watching-card-body"><div class="watching-card-title">${esc(m.title)}</div>${upcoming ? `<div class="watching-card-year">${formatAirDate(m.firstAirDate)}</div>`
    : m.year ? `<div class="watching-card-year">${esc(m.year)}</div>` : ''}</div></div>`;
}

function getOtherShort(name){
  if(typeof name !== 'string' || !name.trim())return'OTH';
  const n=name.trim().toLowerCase();
  if(n==='binge')return'BING';if(n==='foxtel')return'FOX';if(n==='stan')return'STAN';
  if(n==='paramount+'||n==='paramount plus')return'PARA';
  return name.slice(0,4).toUpperCase();
}
function buildBadges(m,compact){
  let o='';const s=m.streaming||{};
  const sh={netflix:'NFLX',disney:'D+',prime:'PRIME',hbomax:'MAX',appletv:'ATV+',other:getOtherShort(m.otherName)};
  const fl={netflix:'Netflix',disney:'Disney+',prime:'Prime Video',hbomax:'HBO Max',appletv:'Apple TV+',other:m.otherName||'Other'};
  for(const k of SERVICES){
    const l=compact?sh[k]:fl[k];
    if(s[k]?.direct)o+=`<span class="service-badge ${k}">${esc(l)}</span>`;
  }
  return o||`<span class="service-badge other">${compact?'OTHER':'Other'}</span>`;
}

// ── Sub-group builder for service sections ──
function buildSubGroups(watching,unwatched,moreToCome,finished,listView){
  const nonEmpty=[watching,unwatched,moreToCome,finished].filter(g=>g.length);
  const showLabels=nonEmpty.length>1;
  const labels=['Watching','Want to Watch','More to Come','Finished for Good'];
  const labelCls=['sub-watching','sub-unwatched','sub-more','sub-finished'];
  const allSubs=[watching,unwatched,moreToCome,finished];
  let html='';let ci=0;
  allSubs.forEach((group,gi)=>{
    if(!group.length)return;
    const sorted=sortShows(group, gi >= 2 ? 'dateWatched-desc' : undefined);
    let subHtml='';
    if(listView){
      subHtml=sorted.map((m,i)=>buildListRow(m,ci+i)).join('');
      ci+=sorted.length;
      subHtml=`<div class="list-rows">${subHtml}</div>`;
    }else{
      subHtml=sorted.map((m,i)=>buildCard(m,ci+i)).join('');
      ci+=sorted.length;
      subHtml=`<div class="service-grid">${subHtml}</div>`;
    }
    if(showLabels){
      html+=`<div class="sub-section"><div class="sub-label ${labelCls[gi]}">${labels[gi]}</div>${subHtml}</div>`;
    }else{
      html+=subHtml;
    }
  });
  return html;
}

// ── Grouped "All" view ──
function buildGrouped(allShows,listView){
  const groups={netflix:[],disney:[],prime:[],hbomax:[],appletv:[],other:[]};
  for(const m of allShows){
    const s=m.streaming||{};
    let placed=false;
    for(const k of GROUP_ORDER){
      if(s[k]?.direct){groups[k].push(m);placed=true;break;}
    }
    if(!placed)groups.other.push(m);
  }
  let html='';
  for(const k of GROUP_ORDER){
    if(!groups[k].length)continue;
    const meta=SERVICE_META[k];
    const g=groups[k];
    const watching=g.filter(m=>m.watching);
    const unwatched=g.filter(m=>!m.watching&&!m.watched);
    const moreToCome=g.filter(m=>m.watched&&m.watchStatus==='more_to_come');
    const finished=g.filter(m=>m.watched&&m.watchStatus==='finished_for_good');
    const subHtml=buildSubGroups(watching,unwatched,moreToCome,finished,listView);
    const total=g.length;
    if(listView){
      html+=`<div class="list-section"><div class="service-section-heading" style="margin-bottom:10px;"><span class="service-section-dot" style="background:${meta.color};box-shadow:0 0 6px ${meta.color}60"></span><span class="service-section-label" style="color:${meta.color}">${meta.label}</span><span class="service-section-count">${total} show${total!==1?'s':''}</span><span class="service-section-rule" style="background:${meta.rule}"></span></div>${subHtml}</div>`;
    }else{
      html+=`<div class="service-section"><div class="service-section-heading"><span class="service-section-dot" style="background:${meta.color};box-shadow:0 0 6px ${meta.color}60"></span><span class="service-section-label" style="color:${meta.color}">${meta.label}</span><span class="service-section-count">${total} show${total!==1?'s':''}</span><span class="service-section-rule" style="background:${meta.rule}"></span></div>${subHtml}</div>`;
    }
  }
  return html;
}

// ── Single service view (with sub-groups) ──
function buildServiceView(serviceKey,allShows,listView){
  const watching=allShows.filter(m=>m.watching);
  const unwatched=allShows.filter(m=>!m.watching&&!m.watched);
  const moreToCome=allShows.filter(m=>m.watched&&m.watchStatus==='more_to_come');
  const finished=allShows.filter(m=>m.watched&&m.watchStatus==='finished_for_good');
  return buildSubGroups(watching,unwatched,moreToCome,finished,listView);
}

// ── Watched shows section builder (More to Come / Finished for Good) ──
function buildWatchedSection(title, sectionShows, type, listView){
  const sorted=sortShows(sectionShows, 'dateWatched-desc');
  const colorHex=type==='more'?'#c9a84c':'#4ade80';
  const ruleColor=type==='more'?'rgba(201,168,76,0.15)':'rgba(74,222,128,0.1)';
  let content='';
  if(listView){
    content=`<div class="list-rows">${sorted.map((m,i)=>buildListRow(m,i)).join('')}</div>`;
  }else{
    content=`<div class="service-grid">${sorted.map((m,i)=>buildCard(m,i)).join('')}</div>`;
  }
  const total=sectionShows.length;
  return`<div class="service-section watched-section">
    <div class="service-section-heading">
      <span class="service-section-dot" style="background:${colorHex};box-shadow:0 0 6px ${colorHex}60"></span>
      <span class="service-section-label" style="color:${colorHex}">${title}</span>
      <span class="service-section-count">${total} show${total!==1?'s':''}</span>
      <span class="service-section-rule" style="background:${ruleColor}"></span>
    </div>
    ${content}
  </div>`;
}

// ── Render ──
function render() {
  const main = shows.filter(show => !isDetachedShow(show));
  const count = main.filter(show => !show.graveyard).length;
  document.getElementById('headerCount').textContent = count === 1 ? '1 show' : `${count} shows`;
  const items = currentCompanion
    ? shows.filter(show => show.watchWith?.toLowerCase() === currentCompanion.toLowerCase())
    : shows;
  document.getElementById('companionFilter').hidden = !currentCompanion;
  document.getElementById('companionFilterName').textContent = currentCompanion;
  const listView = currentView === 'list';
  const grid = document.getElementById('showGrid');
  const mainItems = items.filter(show => !isDetachedShow(show));
  const allView = currentFilter === 'all' && !searchQuery;
  const today = localDateStr(new Date());
  const strips = {
    watching: items.filter(show => show.watching && !show.graveyard),
    upcoming: mainItems.filter(show => !show.watched && !show.graveyard && dateOnly(show.firstAirDate) > today),
    watchSoon: mainItems.filter(show => show.watchSoon && !show.watching && !show.watched && !show.graveyard),
    rewatchSoon: mainItems.filter(show => show.watchSoon && !show.watching && show.watched && !show.graveyard),
  };
  for (const [name, shows] of Object.entries(strips)) {
    const visible = allView && shows.length > 0;
    document.getElementById(name + 'Section').hidden = !visible;
    const order = name === 'upcoming'
      ? (a, b) => a.firstAirDate.localeCompare(b.firstAirDate)
      : null;
    const sorted = order ? shows.slice().sort(order) : sortShows(shows);
    document.getElementById(name + 'Strip').innerHTML = visible
      ? sorted.map((show, index) => buildWatchingCard(show, index, name === 'upcoming')).join('') : '';
  }

  updateSortLabel();
  if (currentFilter === 'categories') {
    renderCategoriesView(items);
    return;
  }

  const setFlat = results => {
    grid.className = listView ? 'list-container' : 'grid';
    grid.innerHTML = listView
      ? `<div class="list-rows">${results.map(buildListRow).join('')}</div>`
      : results.map(buildCard).join('');
  };
  if (searchQuery) {
    const results = _postFilter(includeDetachedSearch ? items : mainItems);
    if (results.length) setFlat(results);
    else {
      const detachedMatch = !includeDetachedSearch && _postFilter(items.filter(isDetachedShow)).length;
      grid.className = 'grid';
      grid.innerHTML = `<div class="empty-state"><span class="empty-icon">📺</span><p>No shows match "${esc(searchQuery)}"</p>
        ${detachedMatch ? '<button class="btn btn-ghost btn-sm" onclick="includeDetachedSearch = true; render()">Search detached categories</button>' : ''}</div>`;
    }
    return;
  }

  const active = mainItems.filter(show => !show.graveyard);
  const completed = status => active.filter(show => show.watched && show.watchStatus === status);
  if (allView) {
    grid.className = listView ? 'list-container' : 'show-container';
    const more = completed('more_to_come');
    const finished = completed('finished_for_good');
    const grouped = buildGrouped(active.filter(show => !show.watching && !show.watched), listView);
    grid.innerHTML = grouped
      + (more.length ? buildWatchedSection('More to Come', more, 'more', listView) : '')
      + (finished.length ? buildWatchedSection('Finished for Good', finished, 'finished', listView) : '');
    if (grid.innerHTML || Object.values(strips).some(group => group.length)) return;
  } else if (SERVICES.includes(currentFilter)) {
    grid.className = listView ? 'list-container' : 'show-container';
    grid.innerHTML = buildServiceView(currentFilter, active.filter(show => show.streaming?.[currentFilter]?.direct), listView);
    if (grid.innerHTML) return;
  } else {
    const finished = ['more_to_come', 'finished_for_good'].includes(currentFilter);
    const results = finished ? completed(currentFilter)
      : currentFilter === 'watching' ? strips.watching : mainItems.filter(show => show.graveyard);
    if (results.length) {
      setFlat(sortShows(results, finished ? 'dateWatched-desc' : undefined));
      return;
    }
  }
  grid.innerHTML = `<div class="empty-state"><span class="empty-icon">📺</span><p>${
    shows.length ? 'No shows match this filter.' : 'Your show list is empty.<br>Click <strong>Add Show</strong> to get started.'
  }</p></div>`;
}

function isDetachedShow(m){
  if(!m.category)return false;
  if(m.detachExempt)return false;
  return!!(categorySettings[m.category]?.detached);
}

function getCategoryNames(){
  const map=Object.create(null);
  for(const m of shows){
    if(!m.category)continue;
    const t=m.dateAdded?new Date(m.dateAdded).getTime():Infinity;
    if(!(m.category in map)||t<map[m.category])map[m.category]=t;
  }
  return Object.keys(map).sort((a,b)=>map[a]-map[b]);
}

function renderCategoriesView(items = shows){
  const g=document.getElementById('showGrid');
  const strip=document.getElementById('categoryPillStrip');
  const opts=document.getElementById('categoryOptions');
  const cats=getCategoryNames();

  const addPill=`<button class="category-pill" style="border-color:var(--text-muted);gap:5px;" onclick="openAddModalWithCategory(${jsAttr(currentCategory||'')})">&#43; Add Show</button>`;
  strip.innerHTML=addPill+cats.map(c=>{
    const count=shows.filter(m=>m.category===c).length;
    const active=currentCategory===c?'active':'';
    const detached=categorySettings[c]?.detached;
    const detachedCls=detached?'detached':'';
    const lockPrefix=detached?'🔒 ':'';
    const menuBtn=active?`<span class="pill-menu-btn" onclick="openPillMenu(event,this,${jsAttr(c)})" title="Category options">&middot;&middot;&middot;</span>`:'';
    return`<button class="category-pill ${active} ${detachedCls}" onclick="selectCategory(${jsAttr(c)}) " oncontextmenu="openPillMenu(event,this,${jsAttr(c)});return false;">${lockPrefix}${esc(c)}<span class="category-pill-count">${count}</span>${menuBtn}</button>`;
  }).join('');

  if(!cats.length){
    opts.classList.remove('visible');opts.innerHTML='';
    g.className='grid';
    g.innerHTML=`<div class="category-empty-state"><span class="empty-icon">📂</span><p>No categories yet.<br>Add a category to a show when editing or adding it.</p></div>`;
    return;
  }
  if(!currentCategory){
    opts.classList.remove('visible');opts.innerHTML='';
    g.className='grid';
    g.innerHTML=`<div class="category-empty-state"><span class="empty-icon">👆</span><p>Select a category above to browse its shows.</p></div>`;
    return;
  }

  if(!categoryOptionsDismissed){
    const isDetached=!!(categorySettings[currentCategory]?.detached);
    opts.innerHTML=`<div class="category-options-row">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
        <div>
          <div class="category-options-label">Detached</div>
          <div class="category-options-desc">Hidden from all tabs except Currently Watching</div>
        </div>
        <label class="toggle-row" style="margin:0;flex-shrink:0;">
          <input type="checkbox" id="categoryDetachedToggle" onchange="toggleCategoryDetached()" ${isDetached?'checked':''}>
          <span class="track"></span>
        </label>
      </div>
      <button onclick="dismissCategoryOptions()" title="Dismiss" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:1.2rem;line-height:1;padding:2px 6px;margin-left:4px;transition:color 0.15s;flex-shrink:0;" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color=''">&times;</button>
    </div>`;
    opts.classList.add('visible');
  }else{
    opts.classList.remove('visible');opts.innerHTML='';
  }

  const sorted = _postFilter(items.filter(m=>m.category===currentCategory), 'year-asc');
  if(!sorted.length){
    g.className='grid';
    g.innerHTML=`<div class="category-empty-state"><span class="empty-icon">📺</span><p>${searchQuery ? 'No shows match this search in the category.' : 'No shows in this category yet.'}</p></div>`;
    return;
  }
  if(currentView==='list'){
    g.className='list-container';
    g.innerHTML=`<div class="list-rows">${sorted.map((m,i)=>buildListRow(m,i)).join('')}</div>`;
  }else{
    g.className='grid';
    g.innerHTML=sorted.map((m,i)=>buildCard(m,i)).join('');
  }
}

function formatBingeTime(totalMins){
  if(!totalMins||totalMins<=0)return null;
  const h=Math.floor(totalMins/60),m=totalMins%60;
  if(h===0)return`${m}m`;
  if(h<24)return m>0?`${h}h ${m}m`:`${h}h`;
  const d=Math.floor(h/24),rh=h%24;
  return [`${d}d`,rh?`${rh}h`:'',m?`${m}m`:''].filter(Boolean).join(' ');
}
function getBingeTime(m){
  const runtime=positiveInteger(m.episodeRuntime), count=positiveInteger(m.episodeCount);
  if(!runtime||!count)return null;
  return formatBingeTime(runtime*count);
}

function buildListRow(m,i){
  const thumb=m.poster
    ?`<img class="list-thumb" src="${esc(m.poster)}" alt="${esc(m.title)}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="list-thumb-placeholder" style="display:none">📺</div>`
    :`<div class="list-thumb-placeholder">📺</div>`;
  const premiere = dateOnly(m.firstAirDate);
  const watchingPip=m.watching?`<span class="list-soon-pip"></span>`:'';
  const binge=getBingeTime(m);
  const metaWithBinge=[premiere > localDateStr(new Date()) ? `Premieres ${formatAirDate(premiere)}` : esc(m.year),binge?`⏱ ${binge}`:null,m.rating?`★ ${esc(m.rating)}`:null,m.rtRating ? `RT ${esc(m.rtRating)}` : null,esc(m.genre),esc(m.creator)].filter(Boolean).join(' · ');
  const badges=buildBadges(m,true);
  const staleClass=getStaleClass(m);
  let statusTag='';
  if(m.graveyard)statusTag=`<span class="list-status graveyard">💀 Dropped</span>`;
  else if(m.watching)statusTag=`<span class="list-status watching">Watching</span>`;
  else if(m.watched&&m.watchStatus==='more_to_come')statusTag=`<span class="list-status more">More Seasons</span>`;
  else if(m.watched&&m.watchStatus==='finished_for_good')statusTag=`<span class="list-status finished">✓ Finished</span>`;
  if (m.watchSoon && !m.watching && !m.graveyard) {
    statusTag += `<span class="list-status planned">${m.watched ? 'Rewatch soon' : 'Watch soon'}</span>`;
  }
  const dateLabel=m.watched?formatDateWatched(m.dateWatched):formatDateAdded(m.dateAdded);
  const exemptTag=(currentFilter==='categories'&&m.detachExempt&&categorySettings[m.category]?.detached)?`<span class="list-status" style="background:rgba(96,165,250,0.08);color:#60a5fa;border:1px solid rgba(96,165,250,0.22);">👁 Visible</span>`:'';
  const selectedCls=selectedIds.has(m.id)?' selected':'';
  const rowClass=`list-row${m.graveyard?' list-row-graveyard':''}${staleClass?staleClass.replace('card-stale','list-stale'):''}${selectedCls}`;
  const clickFn=`selectionMode?toggleSelectShow(${jsAttr(m.id)}):openDetail(${jsAttr(m.id)})`;
  return`<div class="${rowClass}" role="button" tabindex="0" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();this.click()}" onclick="${clickFn}" data-id="${esc(m.id)}" style="animation-delay:${i*0.02}s">
    <div class="list-thumb-wrap">${thumb}${watchingPip}</div>
    <div class="list-info">
      <div class="list-title">${esc(m.title)}</div>
      ${metaWithBinge?`<div class="list-meta">${metaWithBinge}</div>`:''}
      <div class="list-badges">${badges}</div>
    </div>
    <div class="list-right">
      ${statusTag}${exemptTag}
      <span class="list-date">${dateLabel}</span>
    </div>
  </div>`;
}
