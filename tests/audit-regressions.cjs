/* Additional regressions for the audit starting at 1ef9219. External services are mocked. */
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=process.env.FUN_PROJECTS_ROOT||path.resolve(__dirname,'..');
const cases=[];
const test=(id,app,name,run,storage={},options={})=>cases.push({id,app,name,run,storage,options});

test(1,'reading-room','unknown book dates are not labelled added today',()=>getAgeInfo('invalid').label.toLowerCase().includes('unknown'));
test(2,'reading-room','typing hides previously clickable book results immediately',()=>{
  renderResults([{key:'old',title:'Old'}]);titleInput.value='new';debounceSearch();clearTimeout(searchTimer);
  return getSelectableRows().length===0;
});
test(3,'reading-room','failed searches clear the previous keyboard selection model',async()=>{
  renderResults([{key:'old',title:'Old'}]);window.fetch=async()=>({ok:false});await doSearch('new','');
  selectResult(0);return state.wantToRead.length===0;
});
test(4,'reading-room','arrow navigation preserves a text selection',()=>{
  authorInput.value='Author';authorInput.focus();authorInput.setSelectionRange(0,4);
  const ev=new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});authorInput.dispatchEvent(ev);
  return document.activeElement===authorInput&&!ev.defaultPrevented;
});
test(5,'reading-room','global shortcuts preserve contenteditable typing',()=>{
  const el=document.createElement('div');el.contentEditable='true';document.body.append(el);el.focus();
  const ev=new KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});el.dispatchEvent(ev);
  return !ev.defaultPrevented&&document.activeElement===el;
});
test(6,'reading-room','a selected edition cover renders before its cache request finishes',async()=>{
  state.wantToRead=[{id:'a',title:'A'}];renderAll();window.fetch=()=>new Promise(()=>{});
  openFloatingMenu(document.querySelector('.card-menu-btn'),'a','wantToRead');
  const b=document.createElement('button');b.dataset.action='pick-cover';b.dataset.coverId='123';floatingMenu.append(b);b.click();
  return document.querySelector('.book-thumb img')?.getAttribute('src').includes('123');
});
test(7,'reading-room','author grouping handles prototype-named authors',()=>{
  state.read=[{id:'a',title:'A',author:'constructor'},{id:'b',title:'B',author:'constructor'}];renderAll();
  return document.querySelectorAll('#body-read .author-group').length===1;
});
test(8,'reading-room','theme action label follows the active theme',()=>{
  applyTheme(true);return document.getElementById('theme-toggle').getAttribute('aria-label')==='Switch to light mode';
});
test(9,'reading-room','cover chooser buttons identify their cover to screen readers',async()=>{
  state.read=[{id:'a',title:'A'}];renderAll();window.fetch=async()=>({ok:true,json:async()=>({entries:[{covers:[123]}]})});
  openFloatingMenu(document.querySelector('.card-menu-btn'),'a','read');floatingMenu.querySelector('[data-action="change-cover"]').click();
  await new Promise(r=>setTimeout(r,0));return !!floatingMenu.querySelector('[data-cover-id="123"]')?.getAttribute('aria-label');
});
test(10,'album-atlas','new album input hides old clickable search results',()=>{
  renderResults([{id:'old',title:'Old'}]);inputAlbum.value='new';scheduleSearch();clearTimeout(searchTimer);
  return getSelectableRows().length===0;
});
test(11,'album-atlas','album search result years render as text',()=>{
  renderResults([{id:'a',title:'A','first-release-date':'<b>1'}]);return !resultsWrap.querySelector('b');
});
test(12,'album-atlas','album search cover IDs cannot inject attributes',()=>{
  renderResults([{id:'a" data-injected="yes',title:'A'}]);return !resultsWrap.querySelector('[data-injected]');
});
test(13,'album-atlas','Escape closes album search and card menus',()=>{
  pickResult({id:'a',title:'A'});const card=document.querySelector('.album-card');openMenu(card,card.querySelector('.card-menu'));
  renderResults([{id:'b',title:'B'}]);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  return resultsWrap.style.display==='none'&&card.querySelector('.card-menu').style.display==='none';
});
test(14,'album-atlas','search shortcut does not steal textarea input',()=>{
  const el=document.createElement('textarea');document.body.append(el);el.focus();const ev=new KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});el.dispatchEvent(ev);
  return document.activeElement===el&&!ev.defaultPrevented;
});
test(15,'album-atlas','sort control describes its current direction',()=>{
  document.getElementById('sort-age-btn').click();renderAll();return !listenSortOldest&&document.getElementById('sort-age-btn').textContent.includes('Newest');
});
test(16,'album-atlas','album search labels are associated with their fields',()=>['input-album','input-artist'].every(id=>document.getElementById(id).labels.length>0));
test(17,'album-atlas','desktop view toggle icon matches its destination',()=>{
  currentView='kanban';applyViewState();return vtIconGrid.style.display!=='none'&&vtIconKanban.style.display==='none';
});
test(18,'album-atlas','malformed cached artwork falls back to the cover service',()=>{
  coverCache.a={bad:true};return typeof cachedCover({mbid:'a'})==='string'&&cachedCover({mbid:'a'}).includes('coverartarchive');
});
test(19,'album-atlas','album context actions are keyboard focusable',()=>{
  pickResult({id:'a',title:'A'});return [...document.querySelectorAll('[data-move],.menu-remove,.menu-set-date')].every(el=>el.matches('button,[tabindex="0"]'));
});
test(20,'album-atlas','cloud replacement dismisses obsolete search results',()=>{
  renderResults([{id:'new',title:'New'}]);window._sbOnLoad({listen:[{id:'new',title:'New'}]});
  return resultsWrap.style.display==='none';
});

test(21,'tv-reverie','typing a TV query immediately removes old selectable results',()=>{
  openAddModal();document.getElementById('searchResults').innerHTML='<div data-show-id="1"></div>';document.getElementById('searchResults').classList.add('open');
  onSearchInput('New');clearTimeout(searchTimer);return !document.getElementById('searchResults').classList.contains('open');
});
test(22,'tv-reverie','an older response body cannot hide a newer search spinner',async()=>{
  openAddModal();let done;window.fetch=async()=>({ok:true,json:()=>new Promise(r=>done=r)});const pending=searchTMDB('Old');
  await new Promise(r=>setTimeout(r,0));onSearchInput('New');clearTimeout(searchTimer);done({results:[]});await pending;
  return document.getElementById('searchSpinner').classList.contains('active');
});
test(23,'tv-reverie','prototype-named TV searches do not invoke bogus alias lookups',async()=>{
  openAddModal();const urls=[];window.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>({results:[]})};};await searchTMDB('constructor');return urls.length===1;
});
test(24,'tv-reverie','detail metadata is escaped',()=>{
  shows=[{id:'a',title:'A',genre:'<b data-injected>genre</b>'}];openDetail('a');return !document.querySelector('#detailContent [data-injected]');
});
test(25,'tv-reverie','binge estimates reject negative episode metadata',()=>getBingeTime({episodeRuntime:-10,episodeCount:-5})===null);
test(26,'tv-reverie','invalid saved dates remain editable',()=>{
  shows=[{id:'a',title:'A',dateAdded:'invalid'}];openDetail('a');editDateAdded('a');return !!document.getElementById('dateAddedPicker');
});
test(27,'tv-reverie','binge durations retain minutes beyond one day',()=>formatBingeTime(1501)==='1d 1h 1m');
test(28,'tv-reverie','malformed category settings do not crash detach controls',()=>{
  categorySettings=tvDictionary({One:'bad'});currentCategory='One';toggleCategoryDetached();return categorySettings.One.detached===true;
});
test(29,'tv-reverie','one invalid stored show does not discard the valid library',()=>shows.some(m=>m.id==='a'),{tvshows_v1:JSON.stringify([{id:'a',title:'Keep'},null])});
test(30,'tv-reverie','changing filters clears hidden bulk selections',()=>{
  shows=[{id:'a',title:'A'}];enterSelectMode();toggleSelectShow('a');setFilter('graveyard',document.querySelector('.filter-btn'));
  return selectedIds.size===0;
});
test(31,'tv-reverie','invalid stored view preferences fall back to a supported view',()=>['grid','compact','list'].includes(currentView),{tvshows_view:'invalid'});
test(32,'tv-reverie','reopening a show form dismisses stale category suggestions',()=>{
  shows=[{id:'a',title:'A',category:'One'}];openAddModal();filterCategorySuggestions();closeAddModal();openAddModal();
  return document.getElementById('categoryDropdown').style.display==='none';
});
test(33,'tv-reverie','status changes cannot be discarded by an older deletion undo',()=>{
  shows=[{id:'a',title:'A'},{id:'b',title:'B'}];openEditModal('a');deleteCurrentShow();setShowStatus('b','watching');
  if(undoStack.length)undoDelete(document.querySelector('.toast'));return shows.find(m=>m.id==='b')?.watching===true;
});
test(34,'tv-reverie','TV form labels identify their inputs',()=>{
  openAddModal();return ['fTitle','fYear','fGenre','fCreator','fNotes'].every(id=>document.getElementById(id).labels.length>0);
});
test(35,'tv-reverie','streaming tiles support keyboard activation',()=>{
  openAddModal();const tile=document.querySelector('.streaming-tile');tile.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
  return tile.classList.contains('active')&&tile.tabIndex===0&&tile.getAttribute('aria-pressed')==='true';
});
test(36,'tv-reverie','show cards can be opened with the keyboard',()=>{
  shows=[{id:'a',title:'A'}];render();const card=document.querySelector('#showGrid [data-id]');
  card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return currentDetailId==='a'&&card.tabIndex===0;
});
test(37,'tv-reverie','global TV shortcuts preserve contenteditable text',()=>{
  const el=document.createElement('div');el.contentEditable='true';document.body.append(el);el.focus();
  const ev=new KeyboardEvent('keydown',{key:'a',bubbles:true,cancelable:true});el.dispatchEvent(ev);
  return !document.getElementById('addModal').classList.contains('open')&&!ev.defaultPrevented;
});
test(38,'tv-reverie','future watched dates are rejected by the Save action',()=>{
  shows=[{id:'a',title:'A',watched:true,watchStatus:'finished_for_good',dateWatched:'2020-01-01'}];openDetail('a');editDateWatched('a');document.getElementById('dateWatchedPicker').value='2099-01-01';saveDateWatched('a');
  return shows[0].dateWatched==='2020-01-01';
});

test(39,'music-videos','editing a channel query removes old clickable results',()=>{
  openAddModal();_searchResults=[{channelId:'old',name:'Old'}];searchComplete=true;renderChannelResults();
  document.getElementById('artist-input').value='New';document.getElementById('artist-input').dispatchEvent(new Event('input',{bubbles:true}));
  return !document.querySelector('#ch-results [onclick]');
});
test(40,'music-videos','cloud replacement invalidates an in-progress artist import',async()=>{
  openAddModal();getUploadsPlaylistId=async()=> 'uploads';let done;fetchPlaylist=()=>new Promise(r=>done=r);
  const pending=addArtist({channelId:'a',name:'A'});await new Promise(r=>setTimeout(r,0));
  window._sbOnLoad({artists:[],videos:{}});done({});await pending;return artists.length===0;
});
test(41,'music-videos','finishing an older import cannot dismiss a newer Add dialog',async()=>{
  openAddModal();getUploadsPlaylistId=async()=> 'uploads';let done;fetchPlaylist=()=>new Promise(r=>done=r);
  const pending=addArtist({channelId:'a',name:'A'});await new Promise(r=>setTimeout(r,0));closeModal();openAddModal();
  document.getElementById('artist-input').value='New query';done({});await pending;return modalOpen()&&document.getElementById('artist-input').value==='New query';
});
test(42,'music-videos','range selection keeps its anchor when refresh inserts earlier videos',()=>{
  videos={a:{videoId:'a',title:'A',publishedAt:'2026-03-01'},b:{videoId:'b',title:'B',publishedAt:'2026-02-01'},c:{videoId:'c',title:'C',publishedAt:'2026-01-01'}};
  toggleSelect('b');videos.x={videoId:'x',title:'X',publishedAt:'2026-04-01'};rangeSelect('c');
  return selectedIds.has('b')&&selectedIds.has('c')&&!selectedIds.has('a');
});
test(43,'music-videos','touch users can start video selection with a dedicated control',()=>{
  artists=[{id:'a',name:'A'}];videos={v:{videoId:'v',artistId:'a',title:'V'}};renderAll();
  const control=document.querySelector('.v-card .sel-box');control.click();return control.tagName==='BUTTON'&&selectedIds.has('v');
});
test(44,'music-videos','cloud rejects mismatched video dictionary keys atomically',()=>{
  const before=JSON.stringify(window._sbGetData());const accepted=window._sbOnLoad({artists:[],videos:{wrong:{videoId:'right',title:'A'}}});
  return accepted===false&&JSON.stringify(window._sbGetData())===before;
});
test(45,'music-videos','official video detection handles square-bracketed titles',()=>isMusicVideo('Artist - Song [Official Music Video]')&&!isMusicVideo('Artist - Song [Official Lyric Video]'));
test(46,'music-videos','channel search field has an associated accessible label',()=>{
  const input=document.getElementById('artist-input');return input.labels.length>0||!!input.getAttribute('aria-label');
});
test(47,'music-videos','video cards support keyboard opening',()=>{
  artists=[{id:'a',name:'A'}];videos={v:{videoId:'v',artistId:'a',title:'V'}};renderAll();let url='';window.open=value=>url=value;
  const card=document.querySelector('.v-card');card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  return card.tabIndex===0&&url.includes('watch?v=v');
});
test(48,'music-videos','artist filter chips support keyboard activation',()=>{
  artists=[{id:'a',name:'A'}];renderAll();const chip=document.querySelectorAll('#artist-chips .chip')[1];
  chip.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return activeArtist==='a'&&chip.tabIndex===0;
});
test(49,'music-videos','invalid video dates render an unknown-date label',()=>!fmtDate('bad').includes('Invalid'));
test(50,'music-videos','deleting selected videos refreshes artist counts',()=>{
  artists=[{id:'a',name:'A'}];videos={v:{videoId:'v',artistId:'a',title:'V'}};renderAll();selectedIds.add('v');window.confirm=()=>true;selDelete();
  return document.querySelector('#artist-chips .chip-count').textContent==='0';
});

test(51,'palette-painter','ZIP headers mark filenames as UTF-8',async()=>{
  const bytes=await (await createZipBlob([{name:'café.svg',data:new Uint8Array([1])}])).arrayBuffer();
  return (new DataView(bytes).getUint16(6,true)&0x800)!==0;
});
test(52,'palette-painter','extension-only filenames use a usable default basename',()=>{
  filenameInput.value='.svg';return resolveDownloadFilename('png')==='coloured-png.png';
});
test(53,'palette-painter','saved palettes restore their flipped colour order',()=>{
  input.value='#112233\n#445566';isFlipped=true;processInput(false);saveToGallery();const record=safeParseSavedDownloads()[0];
  const before=getSvgString();isFlipped=false;loadPaletteIntoInput(record);return getSvgString()===before;
});
test(54,'palette-painter','PNG export records the palette from capture time',async()=>{
  input.value='#112233';processInput(false);let done;svgToPngBlob=()=>new Promise(r=>done=r);downloadFile=(_b,_n,cb)=>cb?.();
  const pending=downloadPNG();input.value='#445566';done(new Blob(['png'],{type:'image/png'}));await pending;await new Promise(r=>setTimeout(r,50));
  return safeParseSavedDownloads()[0]?.codes[0]==='#112233';
});
test(55,'palette-painter','save feedback cannot reenable Save for an empty canvas',async()=>{
  saveToGallery();resetAll();await new Promise(r=>setTimeout(r,1250));return filenameSaveBtn.disabled;
});
test(56,'palette-painter','PNG clipboard captures cannot overlap',async()=>{
  let calls=0,done;svgToPngBlob=()=>{calls++;return new Promise(r=>done=r)};
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async()=>{}}});
  const one=copyPngToClipboard(),two=copyPngToClipboard();if(calls!==1)return false;done(new Blob(['png'],{type:'image/png'}));
  await Promise.all([one,two]);return calls===1;
});
test(57,'palette-painter','saving a palette preserves custom gallery order',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg',createdAt:'2020-01-01'},{id:'b',filename:'B.svg',type:'svg',createdAt:'2021-01-01'}]);
  saveDownloadRecord('svg','New.svg',[],'<svg/>');return safeParseSavedDownloads().slice(1).map(r=>r.id).join(',')==='a,b';
});
test(58,'palette-painter','selected collection downloads use collection order',async()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'},{id:'b',filename:'B.svg',type:'svg'}]);
  persistCollections([{id:'c',name:'C',itemIds:['b','a']}]);activeCollectionId='c';collectionsSelectedIds.add('a');collectionsSelectedIds.add('b');
  let ids;downloadRecordsAsZip=async items=>{ids=items.map(r=>r.id)};await downloadSelected('collections');return ids.join(',')==='b,a';
});
test(59,'palette-painter','unencoded SVG data URLs support literal percentages',async()=>{
  const svg='<svg width="100%"/>';return await dataUrlToBlob('data:image/svg+xml,'+svg).text()===svg;
});
test(60,'palette-painter','malformed stored colour codes cannot break or inject comparison markup',()=>{
  const a={id:'a',filename:'A.svg',type:'svg',codes:[123,null,'#112233','\"><b data-injected>']};
  openCompareModal(a,{...a,id:'b'});return !compareOverlay.querySelector('[data-injected]')&&compareOverlay.querySelectorAll('.compare-swatch').length===2;
});
test(61,'palette-painter','collection tabs do not nest interactive buttons',()=>{
  persistCollections([{id:'c',name:'C',itemIds:[]}]);renderCollections();return !collectionsTabBar.querySelector('button button');
});
test(62,'palette-painter','gallery filenames can be renamed with the keyboard',()=>{
  saveToGallery();const btn=document.querySelector('.gallery-filename-display');btn.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  return btn.closest('.gallery-item').classList.contains('is-editing');
});
test(63,'palette-painter','gallery palettes can be loaded with the keyboard',()=>{
  input.value='#112233';processInput(false);saveToGallery();input.value='#445566';const card=galleryGrid.querySelector('.gallery-item');
  card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return input.value==='#112233'&&card.tabIndex===0;
});
test(64,'palette-painter','comparison colour copy controls are keyboard focusable',()=>{
  const a={id:'a',filename:'A.svg',type:'svg',codes:['#112233']};openCompareModal(a,{...a,id:'b'});
  return [...compareOverlay.querySelectorAll('.compare-swatch')].every(el=>el.matches('button,[tabindex="0"]'));
});
test(65,'palette-painter','collection membership handles punctuation in record IDs',()=>{
  const id='a"]';persistSavedDownloads([{id,filename:'A.svg',type:'svg'}]);renderGallery();
  openCollectionPopover(document.querySelector('.gallery-collection-btn'),id);collectionPopover.querySelector('button').click();return isFavourite(id);
});
test(66,'palette-painter','Escape dismisses the collection popover',()=>{
  saveToGallery();openCollectionPopover(document.querySelector('.gallery-collection-btn'),safeParseSavedDownloads()[0].id);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return !collectionPopover.classList.contains('is-open');
});
test(67,'palette-painter','comparison focuses its dialog and returns focus when closed',async()=>{
  const trigger=document.getElementById('gallerySelectBtn');trigger.focus();const a={id:'a',filename:'A.svg',type:'svg',codes:[]};
  openCompareModal(a,{...a,id:'b'});await new Promise(r=>requestAnimationFrame(r));const inside=compareOverlay.contains(document.activeElement);closeCompareModal();
  return inside&&document.activeElement===trigger;
});
test(68,'palette-painter','collection reorder ignores cards animating out of the collection',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'},{id:'b',filename:'B.svg',type:'svg'}]);persistFavouriteIds(['a']);persistCollections([{id:'c',name:'C',itemIds:['b']}]);
  activeCollectionId='c';renderCollections();activeCollectionId='favourites';renderCollections();persistCollectionOrder();return safeParseFavouriteIds().join(',')==='a';
});
test(69,'palette-painter','deletion undo restores collection item order',()=>{
  persistSavedDownloads(['a','b','c'].map(id=>({id,filename:id+'.svg',type:'svg'})));persistCollections([{id:'col',name:'C',itemIds:['a','b','c']}]);activeCollectionId='col';
  removeDownloadRecord('b');undoDelete();return getCollectionById('col').itemIds.join(',')==='a,b,c';
});
test(70,'palette-painter','starring a gallery item preserves the other selected palettes',()=>{
  persistSavedDownloads(['a','b'].map(id=>({id,filename:id+'.svg',type:'svg'})));renderGallery();enterSelectMode('gallery');
  toggleCardSelection(galleryGrid.querySelector('.gallery-item'),'a','gallery');toggleFavourite('b');
  return gallerySelectedIds.has('a')&&galleryGrid.closest('.gallery-section').classList.contains('is-selecting');
});

test(71,'my-watchlist','typing a movie query hides old selectable results immediately',()=>{
  openAddModal();document.getElementById('searchResults').innerHTML='<div data-movie-id="1"></div>';document.getElementById('searchResults').classList.add('open');
  onSearchInput('New');clearTimeout(state.searchTimer);return !document.getElementById('searchResults').classList.contains('open');
});
test(72,'my-watchlist','prototype-named movie queries avoid bogus alias requests',async()=>{
  openAddModal();document.getElementById('searchInput').value='constructor';const urls=[];window.fetch=async url=>{urls.push(url);return {ok:true,json:async()=>({results:[]})};};
  await searchTMDB('constructor');return urls.length===1;
});
test(73,'my-watchlist','runtime backfill preserves a manual value entered while awaiting TMDB',async()=>{
  state.tmdbKey='fixture';state.movies=[{id:'a',title:'A',tmdbId:1}];let done;window.fetch=()=>new Promise(r=>done=r);const pending=backfillRuntimes();
  state.movies[0].runtime=90;done({ok:true,json:async()=>({runtime:120})});await pending;return state.movies[0].runtime===90;
});
test(74,'my-watchlist','unknown API runtimes remain eligible for later backfill',async()=>{
  state.tmdbKey='fixture';state.movies=[{id:'a',title:'A',tmdbId:1}];window.fetch=async()=>({ok:true,json:async()=>({runtime:0})});await backfillRuntimes();
  let calls=0;window.fetch=async()=>{calls++;return {ok:true,json:async()=>({runtime:110})};};await backfillRuntimes();return calls===1&&state.movies[0].runtime===110;
});
test(75,'my-watchlist','watched-date Save rejects dates beyond its maximum',()=>{
  state.movies=[{id:'a',title:'A',watched:true,dateWatched:'2020-01-01'}];openDetail('a');editDateWatched('a');document.getElementById('dateWatchedPicker').value='2099-01-01';saveDateWatched('a');
  return state.movies[0].dateWatched==='2020-01-01';
});
test(76,'my-watchlist','invalid stored dates remain editable',()=>{
  state.movies=[{id:'a',title:'A',dateAdded:'invalid'}];openDetail('a');editDateAdded('a');return !!document.getElementById('dateAddedPicker');
});
test(77,'my-watchlist','movie cards support keyboard opening',()=>{
  state.movies=[{id:'a',title:'A'}];render();const card=document.querySelector('#movieGrid [data-id]');
  card.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return state.currentDetailId==='a'&&card.tabIndex===0;
});
test(78,'my-watchlist','movie form labels are associated with their inputs',()=>{
  openAddModal();return ['fTitle','fYear','fGenre','fDirector','fNotes'].every(id=>document.getElementById(id).labels.length>0);
});
test(79,'my-watchlist','prototype-named VPN countries render the unknown-country marker',()=>countryFlag('constructor')==='🔒');
test(80,'my-watchlist','a corrupt stored movie does not discard valid movies beside it',()=>state.movies.some(m=>m.id==='a'),{watchlist_v2:JSON.stringify([{id:'a',title:'Keep'},null])});

const syncStorage={_sb_url:'https://fixture.supabase.co',_sb_key:'fixture',_sb_email:'a@example.test'};
test(81,'album-atlas','force sync restores and reads once when starting disconnected',async()=>{
  for(const [key,value] of Object.entries({url:'https://fixture.supabase.co',key:'fixture',email:'a@example.test'}))localStorage.setItem('_sb_'+key,value);
  await window._sbForceSync();return cloudFixture.readCalls===1;
},{},{cloud:true});
test(82,'album-atlas','reconnecting to the same project reuses its auth client',async()=>{
  window._sbOpenPanel();await document.getElementById('_sb_save_btn').onclick();return cloudFixture.clients===1;
},syncStorage,{cloud:true});
test(83,'album-atlas','pending sync state is scoped to its app',()=>{
  state.listen=[{id:'a',title:'A'}];saveState();return localStorage.getItem('_sb_pending_albums')==='1'&&localStorage.getItem('_sb_pending')===null&&localStorage.getItem('_sb_pending_watchlist')==='1';
},{_sb_pending_watchlist:'1'});
test(84,'album-atlas','invalid remote data blocks writes until a successful read',async()=>{
  cloudFixture.remote={invalid:true};await window._sbForceSync();state.listen=[{id:'local',title:'Local'}];await window._sbSyncNow();
  return cloudFixture.writes.length===0;
},syncStorage,{cloud:true});
test(85,'album-atlas','config paste chooses the public key over a service-role secret',()=>{
  window._sbOpenPanel();const area=document.getElementById('_sb_paste_area');area.value=JSON.stringify({url:'https://fixture.supabase.co',service_role_key:'fixture-secret',anon_key:'fixture-public'});area.dispatchEvent(new Event('input'));
  const publicChosen=document.getElementById('_sb_key_in').value==='fixture-public';
  document.getElementById('_sb_key_in').value='';area.value=JSON.stringify({service_role_key:'eyJfixture.payload.signature'});area.dispatchEvent(new Event('input'));
  return publicChosen&&document.getElementById('_sb_key_in').value==='';
});

test(86,'tech-acronyms','CI/CD accepts Continuous Delivery as a valid expansion',()=>{
  startQuiz([acronymsData.find(item=>item.a==='CI/CD')]);document.getElementById('userInput').value='Continuous Integration / Continuous Delivery';evaluateAnswer();return correctAnswersCount===1;
});
test(87,'tech-acronyms','finishing or leaving a quiz moves focus into the visible screen',()=>{
  startQuiz([{a:'CPU',m:'Central Processing Unit',c:'Hardware'}]);skipQuestion();goNext();const inResults=document.getElementById('resultSection').contains(document.activeElement);
  showSetup();return inResults&&document.getElementById('setupSection').contains(document.activeElement);
});
test(88,'tech-acronyms','IME composition Enter does not submit an unfinished answer',()=>{
  startQuiz([{a:'CPU',m:'Central Processing Unit',c:'Hardware'}]);const input=document.getElementById('userInput');input.value='Central Processing Unit';
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));return !awaitingNext&&correctAnswersCount===0;
});
test(89,'tech-acronyms','holding Enter after an answer cannot dismiss its feedback',()=>{
  startQuiz([{a:'CPU',m:'Central Processing Unit',c:'Hardware'}]);skipQuestion();const ev=new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true});
  document.getElementById('submitBtn').dispatchEvent(ev);return ev.defaultPrevented;
});
test(90,'apple-music','dark-side controls initialize without canvas support',()=>{
  document.getElementById('darksideBtn').click();return document.getElementById('darkside-section').classList.contains('visible');
},{},{noCanvas:true,reducedMotion:true});
test(91,'apple-music','reduced-motion mode suppresses ambient lightning after entering dark side',()=>{
  revealDarkSide();ambientLightning();return document.getElementById('ambient-canvas').style.opacity!=='1'&&!window._dsLightningInterval;
},{},{reducedMotion:true});
test(92,'apple-music','screenshot remains busy until clipboard completion',async()=>{
  let done;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:()=>new Promise(r=>done=r)}});
  const btn=document.getElementById('screenshotBtn');btn.click();for(let i=0;i<40&&!done;i++)await new Promise(r=>setTimeout(r,25));
  if(!done)return false;const busy=btn.disabled;done();await new Promise(r=>setTimeout(r,20));return busy&&!btn.disabled;
},{},{screenshotSuccess:true});
test(93,'sotr-countdown','reduced motion stops embers and decorative countdown animation',()=>getComputedStyle(document.getElementById('embers')).display==='none'&&getComputedStyle(document.querySelector('.band')).animationName==='none',{},{reducedMotion:true});
test(94,'sotr-countdown','release status is announced to screen readers',()=>{
  const el=document.getElementById('countdown');return el.getAttribute('role')==='status'&&el.getAttribute('aria-live')==='polite'&&el.textContent.includes('Begun');
},{},{now:'2026-11-20T00:00:00Z'});
test(95,'petal-countdown','reduced motion stops falling petals and reveals the title immediately',()=>getComputedStyle(document.querySelector('.petal')).animationName==='none'&&getComputedStyle(document.querySelector('.artist')).opacity==='1',{},{reducedMotion:true});
test(96,'olivia-countdown','seconds do not trigger continuous polite screen-reader announcements',()=>document.querySelector('[role="timer"]').getAttribute('aria-live')==='off'&&document.getElementById('released').getAttribute('aria-live')==='polite');
test(97,'thirteen','calendar calculations work for years before 100',()=>getSpecialFridays(99).length>0);
test(98,'thirteen','Friday filters expose their selected state to screen readers',()=>{
  const btn=document.querySelector('.filter-btn');btn.click();return btn.getAttribute('aria-pressed')===String(btn.classList.contains('active'));
});
test(99,'thirteen','rules dialog manages focus and returns it to its trigger',()=>{
  taglineBtn.focus();openModal();const inside=modal.contains(document.activeElement);closeModal();return inside&&document.activeElement===taglineBtn;
});
test(100,'','project cards retain visible project names if preview images fail',()=>[...document.querySelectorAll('.project-card')].every(card=>card.textContent.trim().length>0));
test(101,'','Tech Acronyms is reachable from the project directory',()=>[...document.querySelectorAll('.project-card')].some(card=>card.getAttribute('href').replace(/\/$/,'')==='tech-acronyms'));

async function run() {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
  const results = [];
  try {
    for (const t of cases.filter(t=>!process.env.CASES || process.env.CASES.split(',').includes(String(t.id)))) {
      const context = await browser.newContext({viewport:{width:1280,height:900},reducedMotion:t.options.reducedMotion?'reduce':'no-preference'});
      const page = await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(({storage, blocked, cloud, noCanvas, now})=> {
        if(now){const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return new OriginalDate(now).getTime();}};}
        if(noCanvas)HTMLCanvasElement.prototype.getContext=()=>null;

        for (const [key,value] of Object.entries(storage)) localStorage.setItem(key,value);
        if (cloud) {
          const fixture=window.cloudFixture={clients:0,writes:[],waitingWrites:[],waitingReads:[],active:0,maxActive:0,signIns:0,readCalls:0,
            remote:{listen:[],fathom:[],loved:[],enough:[]},manualReads:cloud.manualReads,manualWrites:false};
          fixture.releaseWrites=()=>fixture.waitingWrites.splice(0).forEach(r=>r());
          fixture.releaseReads=()=>fixture.waitingReads.splice(0).forEach(r=>r());
          const response=()=>({data:cloud.noRow?null:{data:fixture.remote},error:cloud.readError?{message:'read failed'}:null});
          window.fixtureSupabase={createClient:(_url,_key,options)=>{
            fixture.clients++;fixture.authStorage=options.auth.storage;
            return {auth:{getSession:async()=>({data:{session:cloud.noSession?null:{user:{id:'fixture-user',email:'a@example.test'}}}}),
              signInWithPassword:async()=>{fixture.signIns++;return {data:{user:{id:'fixture-user',email:'a@example.test'},session:{user:{id:'fixture-user',email:'a@example.test'}}}};},onAuthStateChange(){}},
              from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{fixture.readCalls++;if(fixture.manualReads)await new Promise(r=>fixture.waitingReads.push(r));return response();}})}),
                upsert:async row=>{fixture.writes.push(JSON.parse(JSON.stringify(row)));fixture.active++;fixture.maxActive=Math.max(fixture.maxActive,fixture.active);
                  if(fixture.manualWrites)await new Promise(r=>fixture.waitingWrites.push(r));fixture.active--;return {error:null};}})};
          }};
        }

        if(blocked) for (const method of ['getItem','setItem','removeItem']) Storage.prototype[method]=()=>{throw new DOMException('Blocked','SecurityError');};
      },{storage:t.storage,blocked:t.options.blockedStorage,cloud:t.options.cloud?t.options:null,noCanvas:t.options.noCanvas,now:t.options.now});
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin==='http://localhost') {
          const file=path.join(root,decodeURIComponent(url.pathname));
          if(fs.existsSync(file)&&fs.statSync(file).isFile()) return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
        }
        if(t.options.screenshotSuccess && url.host==='cdn.jsdelivr.net') return route.fulfill({body:'export async function domToCanvas(){const c=document.createElement("canvas");c.width=16;c.height=16;return c;}',contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
        if(t.options.screenshotMock && url.host==='cdn.jsdelivr.net') return route.fulfill({body:'export async function domToCanvas(){window.captureCalls=(window.captureCalls||0)+1;await new Promise(r=>setTimeout(r,30));throw new Error("fixture failure");}',contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'}});
        if(t.options.cloud && url.host==='unpkg.com') return route.fulfill({body:'window.supabase=window.fixtureSupabase;',contentType:'text/javascript'});
        if(t.options.pendingCovers && url.host==='covers.openlibrary.org') return;
        return route.fulfill({status:503,body:''});
      });
      let passed=false, detail='';
      try {
        await page.goto(`http://localhost/${t.app ? t.app+'/' : ''}index.html`,{waitUntil:'domcontentloaded'});
        await page.waitForTimeout(100);
        if(t.options.resize) { await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(100); }
        passed=await page.evaluate(t.run);
        if(errors.length){passed=false;detail=errors.join('; ');}
      } catch(e) {detail=e.message.split('\n')[0];}
      results.push({id:t.id,app:t.app,name:t.name,passed:!!passed,detail});
      console.log(`${passed?'PASS':'FAIL'} ${String(t.id).padStart(3,'0')} ${t.app}: ${t.name}${detail?' — '+detail:''}`);
      await context.close();
    }
  } finally {await browser.close();}
  if(process.env.RESULTS_FILE) fs.writeFileSync(process.env.RESULTS_FILE,JSON.stringify(results,null,2));
  console.log(`${results.filter(r=>r.passed).length}/${results.length} passed`);
  if(results.some(r=>!r.passed)) process.exitCode=1;
}
run().catch(e=>{console.error(e);process.exitCode=1;});
