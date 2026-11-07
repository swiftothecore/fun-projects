/* Browser regressions use isolated storage and intercepted network requests.
 * FUN_PROJECTS_ROOT points at a pre-fix checkout for reproduction.
 * PLAYWRIGHT_PATH and BROWSER_PATH may override the local browser tooling.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = process.env.FUN_PROJECTS_ROOT || path.resolve(__dirname, '..');
const cases = [];
const test = (id, app, name, run, storage = {}, options = {}) => cases.push({id, app, name, run, storage, options});
const book = { id: '/works/OL1W', title: 'One', addedAt: 1700000000000 };
const album = { id: 'one', title: 'One', artist: 'Artist', year: '2026' };

test(1, 'reading-room', 'unavailable storage does not prevent book changes or theme changes', () => {
  let sync = 0; window._sbSyncNow = () => sync++;
  addBook({key:'/works/OL1W', title:'One'}, 'wantToRead');
  document.getElementById('theme-toggle').click();
  return state.wantToRead.length === 1 && sync === 1 && document.documentElement.dataset.theme === 'dark';
}, {}, {blockedStorage:true});
test(2, 'reading-room', 'malformed newest storage falls back to the valid legacy library', () => state.wantToRead[0]?.title === 'One',
  {reading_room_v4:'{', reading_room_v3:JSON.stringify({wantToRead:[book]})});
test(3, 'reading-room', 'invalid stored records are filtered before rendering', () => document.querySelectorAll('.book-card').length === 1,
  {reading_room_v4:JSON.stringify({wantToRead:[null,book]})});
test(4, 'reading-room', 'reopening menus does not retain actions for earlier books', () => {
  state.wantToRead = [{id:'a',title:'A'},{id:'b',title:'B'}]; renderAll();
  let buttons = document.querySelectorAll('#body-wantToRead .card-menu-btn');
  openFloatingMenu(buttons[0],'a','wantToRead'); closeFloatingMenu();
  openFloatingMenu(buttons[1],'b','wantToRead'); floatingMenu.querySelector('[data-action="remove"]').click();
  return state.wantToRead.length === 1 && state.wantToRead[0].id === 'a';
});
test(5, 'reading-room', 'edition responses cannot fill a different books cover menu', async () => {
  state.wantToRead = [{id:'a',title:'A'},{id:'b',title:'B'}]; renderAll();
  const waiting = []; window.fetch = () => new Promise(resolve => waiting.push(resolve));
  const buttons = document.querySelectorAll('#body-wantToRead .card-menu-btn');
  openFloatingMenu(buttons[0],'a','wantToRead'); floatingMenu.querySelector('[data-action="change-cover"]').click();
  closeFloatingMenu(); openFloatingMenu(buttons[1],'b','wantToRead'); floatingMenu.querySelector('[data-action="change-cover"]').click();
  waiting[0]({json:async()=>({entries:[{covers:[123]}]})});
  await new Promise(r=>setTimeout(r,0));
  return !floatingMenu.querySelector('[data-cover-id="123"]');
});
test(6, 'reading-room', 'ISO timestamps produce valid AEST dates and ages', () => {
  const iso = new Date(Date.now()-3*86400000).toISOString();
  return getAESTDaysAgo(iso) === 3 && /^\d{4}-\d{2}-\d{2} AEST$/.test(formatAESTDate(iso));
});
test(7, 'reading-room', 'book years render as text', () => {
  const card = buildCard({id:'a', title:'A', year:'<b>Injected</b>'}, 'read');
  return !card.querySelector('b') && card.textContent.includes('<b>Injected</b>');
});
test(8, 'reading-room', 'undo removal cannot duplicate a book readded to another shelf', () => {
  state.wantToRead=[{id:'a',title:'A'}]; removeBook('a','wantToRead');
  addBook({key:'a',title:'A'},'reading'); undoRemove();
  return SECTIONS.flatMap(s=>state[s.id]).filter(b=>b.id==='a').length===1;
});
test(9, 'reading-room', 'adding a book invalidates removal redo', () => {
  state.wantToRead=[{id:'a',title:'A'}]; removeBook('a','wantToRead'); undoRemove();
  addBook({key:'b',title:'B'},'wantToRead'); redoRemove();
  return state.wantToRead.some(b=>b.id==='a');
});
test(10, 'reading-room', 'cloud partial shelves clear deleted local shelves', () => {
  state.read=[{id:'old',title:'Old'}]; window._sbOnLoad({wantToRead:[{id:'new',title:'New'}]});
  return state.read.length===0 && state.wantToRead[0].id==='new';
});
test(11, 'reading-room', 'cloud replacement invalidates old removal history', () => {
  state.wantToRead=[{id:'a',title:'A'}]; removeBook('a','wantToRead');
  window._sbOnLoad({wantToRead:[]}); undoRemove(); return state.wantToRead.length===0;
});
test(12, 'reading-room', 'new search input immediately invalidates pending results', async () => {
  let done; window.fetch=()=>new Promise(r=>done=r); const pending=doSearch('old','');
  titleInput.value='new'; debounceSearch(); clearTimeout(searchTimer);
  done({ok:true,json:async()=>({docs:[{key:'old',title:'Old'}]})}); await pending;
  return !resultsWrap.textContent.includes('Old');
});
test(13, 'reading-room', 'dismissing search cancels pending debounce and hides spinner', async () => {
  titleInput.value='one'; debounceSearch(); hideResults(); let calls=0;
  window.fetch=async()=>{calls++;return {ok:true,json:async()=>({docs:[]})};};
  await new Promise(r=>setTimeout(r,450)); return calls===0 && !spinner.classList.contains('visible');
});
test(14, 'reading-room', 'book cards render while cover downloads are pending', () => document.querySelectorAll('.book-card').length===1,
  {reading_room_v4:JSON.stringify({wantToRead:[{...book,coverId:9876}]})}, {pendingCovers:true});

test(15, 'album-atlas', 'invalid saved library shape does not crash startup', () => document.querySelectorAll('.section-col').length===4,
  {album_atlas_v1:'null'});
test(16, 'album-atlas', 'invalid cover cache does not crash album rendering', () => document.querySelectorAll('.album-card').length===1,
  {album_atlas_v1:JSON.stringify({listen:[album],fathom:[],loved:[],enough:[]}),album_atlas_covers_v1:'null'});
test(17, 'album-atlas', 'invalid added date does not crash card rendering', () => {
  const card=createCard({id:'a',title:'A',addedAt:'invalid'},'listen');
  return card.dataset.age==='unknown';
});
test(18, 'album-atlas', 'album years render as text', () => {
  const card=createCard({id:'a',title:'A',year:'<b>Injected</b>'},'loved');
  return !card.querySelector('b') && card.textContent.includes('<b>Injected</b>');
});
test(19, 'album-atlas', 'shifted uppercase Z performs redo', () => {
  pickResult({id:'a',title:'A'}); applyUndo(); document.activeElement.blur();
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Z',ctrlKey:true,shiftKey:true,bubbles:true}));
  return state.listen.some(a=>a.id==='a');
});
test(20, 'album-atlas', 'arrow keys move the caret inside search text', () => {
  inputArtist.value='Artist'; inputArtist.focus(); inputArtist.setSelectionRange(3,3);
  inputArtist.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  return document.activeElement===inputArtist;
});
test(21, 'album-atlas', 'cloud load invalidates obsolete undo snapshots', () => {
  pickResult({id:'old',title:'Old'}); window._sbOnLoad({listen:[{id:'new',title:'New'}]}); applyUndo();
  return state.listen[0]?.id==='new';
});
test(22, 'album-atlas', 'new input invalidates an older running search', async () => {
  let done; searchMB=()=>new Promise(r=>done=r); inputAlbum.value='old'; scheduleSearch();
  await new Promise(r=>setTimeout(r,480)); inputAlbum.value='new'; scheduleSearch(); clearTimeout(searchTimer);
  done([{'id':'old','title':'Old','artist-credit':[]}]); await new Promise(r=>setTimeout(r,0));
  return !resultsWrap.textContent.includes('Old');
});
test(23, 'album-atlas', 'resizing to mobile selects a supported list view', async () => currentView==='list', {}, {resize:true});

test(24,'tv-reverie','corrupt saved JSON does not abort startup',()=>{render();return shows.length===0;},{tvshows_v1:'{'});
test(25,'tv-reverie','blocked storage still permits startup and saving',()=>{shows=[{id:'a',title:'A'}];save();render();return document.getElementById('headerCount').textContent==='1 show';},{},{blockedStorage:true});
test(26,'tv-reverie','new search input rejects older responses',async()=>{
  openAddModal();let done;window.fetch=()=>new Promise(r=>done=r);const pending=searchTMDB('Old');onSearchInput('New');clearTimeout(searchTimer);
  done({ok:true,json:async()=>({results:[{id:1,name:'Old'}]})});await pending;return !document.getElementById('searchResults').textContent.includes('Old');
});
test(27,'tv-reverie','newer show selection wins over slower details',async()=>{
  openAddModal();const waiting=[];window.fetch=()=>new Promise(r=>waiting.push(r));const first=selectShow(1),second=selectShow(2);
  waiting[1]({ok:true,json:async()=>({name:'New'})});await second;waiting[0]({ok:true,json:async()=>({name:'Old'})});await first;
  return document.getElementById('fTitle').value==='New'&&_pendingTmdbId===2;
});
test(28,'tv-reverie','closed forms reject pending details',async()=>{
  openAddModal();let done;window.fetch=()=>new Promise(r=>done=r);const pending=selectShow(1);closeAddModal();openAddModal();
  done({ok:true,json:async()=>({name:'Old'})});await pending;return document.getElementById('fTitle').value==='';
});
test(29,'tv-reverie','typing a query invalidates pending show selection',async()=>{
  openAddModal();let done;window.fetch=()=>new Promise(r=>done=r);const pending=selectShow(1);onSearchInput('New');clearTimeout(searchTimer);
  done({ok:true,json:async()=>({name:'Old'})});await pending;return document.getElementById('fTitle').value==='';
});
test(30,'tv-reverie','selection cancels delayed search',async()=>{
  openAddModal();onSearchInput('Search');window.fetch=async()=>({ok:true,json:async()=>({name:'Selected',results:[{id:3,name:'Delayed'}]})});await selectShow(2);
  await new Promise(r=>setTimeout(r,450));return !document.getElementById('searchResults').classList.contains('open');
});
test(31,'tv-reverie','failed detail HTTP response preserves entered title',async()=>{
  openAddModal();document.getElementById('fTitle').value='Keep';window.fetch=async()=>({ok:false,json:async()=>({status_message:'Bad key'})});await selectShow(1);
  return document.getElementById('fTitle').value==='Keep'&&document.getElementById('searchHint').textContent.includes('Could not');
});
test(32,'tv-reverie','selecting another show refreshes automatic synopsis',async()=>{
  openAddModal();for(const title of ['First','Second']){window.fetch=async()=>({ok:true,json:async()=>({name:title,overview:title})});await selectShow(title);}
  return document.getElementById('fNotes').value==='Second';
});
test(33,'tv-reverie','editing a show clears another forms pending TMDB id',()=>{
  shows=[{id:'a',title:'A',tmdbId:10}];openAddModal();_pendingTmdbId=999;closeAddModal();openEditModal('a');saveShow();return shows[0].tmdbId===10;
});
test(34,'tv-reverie','clearing episode runtime intentionally removes old value',()=>{
  shows=[{id:'a',title:'A',episodeRuntime:50}];openEditModal('a');document.getElementById('fEpisodeRuntime').value='';saveShow();return shows[0].episodeRuntime===null;
});
test(35,'tv-reverie','negative episode counts are not persisted',()=>{
  shows=[{id:'a',title:'A'}];openEditModal('a');document.getElementById('fEpisodeCount').value='-3';saveShow();return shows[0].episodeCount===null;
});
test(36,'tv-reverie','starting a dropped show restores it from graveyard',()=>{
  shows=[{id:'a',title:'A',graveyard:true}];setShowStatus('a','watching');return shows[0].watching&&!shows[0].graveyard;
});
test(37,'tv-reverie','bulk watching restores graveyard shows',()=>{
  shows=[{id:'a',title:'A',graveyard:true}];selectedIds=new Set(['a']);bulkToggleWatching();return shows[0].watching&&!shows[0].graveyard;
});
test(38,'tv-reverie','bulk finished restores graveyard shows',()=>{
  shows=[{id:'a',title:'A',graveyard:true}];selectedIds=new Set(['a']);bulkSetStatus('finished_for_good');return shows[0].watched&&!shows[0].graveyard;
});
test(39,'tv-reverie','bulk dropping clears watching and finished states',()=>{
  shows=[{id:'a',title:'A',watching:true}];selectedIds=new Set(['a']);bulkGraveyard();return shows[0].graveyard&&!shows[0].watching&&!shows[0].watched;
});
test(40,'tv-reverie','invalid timestamps render unknown dates',()=>formatDateAdded('bad')==='Added: unknown'&&formatDateWatched('bad')==='Finished: unknown');
test(41,'tv-reverie','prototype-named categories are listed and detach independently',()=>{
  shows=[{id:'a',title:'A',category:'__proto__'}];toggleCategoryDetachedByName('__proto__');return getCategoryNames().includes('__proto__')&&!isDetachedShow({category:'Other'});
});
test(42,'tv-reverie','quotes and backslashes in category handler arguments survive round trip',()=>{
  const name='A" B\\\'s';shows=[{id:'a',title:'A',category:name}];currentFilter='categories';render();
  [...document.querySelectorAll('.category-pill')].find(e=>e.textContent.includes(name)).click();return currentCategory===name;
});
test(43,'tv-reverie','punctuated show ids can open cards',()=>{
  const id='a"b\\\'c';shows=[{id,title:'A'}];render();document.querySelector('#showGrid [data-id]').click();return currentDetailId===id;
});
test(44,'tv-reverie','category results honor the text search',()=>{
  shows=[{id:'a',title:'Match',category:'C'},{id:'b',title:'Other',category:'C'}];currentFilter='categories';currentCategory='C';searchQuery='Match';render();
  return document.querySelectorAll('#showGrid [data-id]').length===1;
});
test(45,'tv-reverie','repeated selection-mode activation keeps selected shows',()=>{
  shows=[{id:'a',title:'A'}];enterSelectMode();selectedIds.add('a');enterSelectMode();return selectedIds.has('a');
});
test(46,'tv-reverie','selection selectors handle punctuation in ids',()=>{
  shows=[{id:'a"b]',title:'A'}];render();toggleSelectShow('a"b]');return document.querySelector('#showGrid [data-id]').classList.contains('selected');
});
test(47,'tv-reverie','repeated Add opening releases scroll lock once',()=>{
  openAddModal();openAddModal();closeAddModal();return !document.body.classList.contains('modal-open');
});
test(48,'tv-reverie','direct Edit opening locks background scroll',()=>{
  shows=[{id:'a',title:'A'}];openEditModal('a');return document.body.classList.contains('modal-open');
});
test(49,'tv-reverie','remote category settings are applied before render',()=>{
  shows=[{id:'a',title:'A',category:'C'}];render();window._sbOnLoad({tvshows:shows,categorySettings:{C:{detached:true}}});
  return document.querySelectorAll('#showGrid [data-id]').length===0;
});
test(50,'tv-reverie','remote hydration clears obsolete undo and selection',()=>{
  shows=[{id:'a',title:'A'}];undoStack=[[{id:'old',title:'Old'}]];enterSelectMode();selectedIds.add('a');window._sbOnLoad([{id:'new',title:'New'}]);
  return undoStack.length===0&&!selectionMode&&selectedIds.size===0;
});
test(51,'tv-reverie','show metadata is escaped in cards and list rows',()=>{
  const data={id:'a',title:'A',genre:'<b>Injected</b>',creator:'<i>Injected</i>'};const wrap=document.createElement('div');wrap.innerHTML=buildCard(data,0)+buildListRow(data,0);
  return !wrap.querySelector('b,i')&&wrap.textContent.includes('<b>Injected</b>');
});
test(52,'tv-reverie','Enter on focused Cancel does not save the show',()=>{
  shows=[{id:'a',title:'A'}];openEditModal('a');document.getElementById('fTitle').value='Changed';document.querySelector('#addModal .modal-footer .btn-ghost')?.focus();
  // The footer control has an inline closeAddModal action in this app.
  const cancel=[...document.querySelectorAll('#addModal button')].find(b=>b.textContent.trim()==='Cancel');cancel.focus();cancel.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  return shows[0].title==='A';
});
test(53,'tv-reverie','editing after a deletion invalidates snapshots that discard the edit',()=>{
  shows=[{id:'a',title:'A'},{id:'b',title:'B'}];openEditModal('a');deleteCurrentShow();openEditModal('b');document.getElementById('fTitle').value='Edited';saveShow();
  document.activeElement.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));return shows.some(m=>m.title==='Edited');
});
test(54,'tv-reverie','closing an already closed form preserves another modals scroll lock',()=>{
  shows=[{id:'a',title:'A'}];openDetail('a');closeAddModal();return document.body.classList.contains('modal-open');
});

test(55,'music-videos','corrupt cached JSON does not abort startup',()=>{renderAll();return Array.isArray(artists);},{ytmv_artists:'{'});
test(56,'music-videos','blocked storage permits editing artists',()=>{artists=[{id:'a',name:'A'}];saveArtists();renderAll();return document.getElementById('artist-chips').textContent.includes('A');},{},{blockedStorage:true});
test(57,'music-videos','latest channel search wins',async()=>{
  openAddModal();const waiting=[];searchChannels=()=>new Promise(r=>waiting.push(r));document.getElementById('artist-input').value='Old';const old=doChannelSearch();
  document.getElementById('artist-input').value='New';const latest=doChannelSearch();waiting[1]([{channelId:'new',name:'New'}]);await latest;waiting[0]([{channelId:'old',name:'Old'}]);await old;
  return _searchResults[0].name==='New';
});
test(58,'music-videos','closed channel searches cannot populate a reopened modal',async()=>{
  openAddModal();let done;searchChannels=()=>new Promise(r=>done=r);document.getElementById('artist-input').value='Old';const pending=doChannelSearch();closeModal();openAddModal();
  done([{channelId:'old',name:'Old'}]);await pending;return _searchResults.length===0&&!searchComplete&&!document.getElementById('search-btn').disabled;
});
test(59,'music-videos','double adding an artist cannot create duplicate records',async()=>{
  getUploadsPlaylistId=async()=> 'uploads';fetchPlaylist=async()=>({});const channel={channelId:'ch',name:'A'};
  await Promise.all([addArtist(channel),addArtist(channel)]);return artists.length===1;
});
test(60,'music-videos','refresh cannot resurrect videos for a removed artist',async()=>{
  const artist={id:'a',name:'A'};artists=[artist];let done;fetchPlaylistSince=()=>new Promise(r=>done=r);const pending=refreshOne(artist,true);
  artists=[];done({v:{videoId:'v',artistId:'a',title:'Video'}});await pending;return Object.keys(videos).length===0;
});
test(61,'music-videos','removing the selected artist resets its filter and selection',async()=>{
  artists=[{id:'a',name:'A'},{id:'b',name:'B'}];activeArtist='a';selectedIds.add('v');window.confirm=()=>true;await removeArtist('a');return activeArtist===null&&selectedIds.size===0;
});
test(62,'music-videos','watch-filter changes prune now-hidden selected videos',()=>{
  artists=[{id:'a',name:'A'}];videos={v:{videoId:'v',artistId:'a',title:'V',watched:false}};watchFilter='unwatched';renderGrid();selectedIds.add('v');
  const pill=document.querySelector('.seen-pill');toggleWatched('v',{stopPropagation(){},currentTarget:pill});return selectedIds.size===0;
});
test(63,'music-videos','adding an overlapping playlist preserves watched entries',async()=>{
  videos={v:{videoId:'v',artistId:'old',title:'V',watched:true}};getUploadsPlaylistId=async()=> 'uploads';fetchPlaylist=async()=>({v:{videoId:'v',artistId:'new',title:'V',watched:false}});
  await addArtist({channelId:'new',name:'New'});return videos.v.watched===true;
});
test(64,'music-videos','artists added in the same millisecond have distinct ids',async()=>{
  Date.now=()=>123;getUploadsPlaylistId=async()=> 'uploads';fetchPlaylist=async()=>({});await addArtist({channelId:'a',name:'A'});await addArtist({channelId:'b',name:'B'});
  return artists[0].id!==artists[1].id;
});
test(65,'music-videos','failed refresh does not report all up to date',async()=>{
  artists=[{id:'a',name:'A'}];fetchPlaylistSince=async()=>{throw new Error('offline');};await refreshAll();return document.getElementById('toasts').textContent.includes('failed');
});
test(66,'music-videos','incremental refresh includes new videos at the cutoff timestamp',async()=>{
  ytFetch=async()=>({items:[{snippet:{resourceId:{videoId:'new'},title:'Song (Official Video)',publishedAt:'2026-01-01T00:00:00Z'}}]});
  const result=await fetchPlaylistSince('p','a','A',new Date('2026-01-01T00:00:00Z'));return !!result.new;
});
test(67,'music-videos','thumbnail fallback disables its failing error handler',()=>{
  artists=[{id:'a',name:'A'}];videos={v:{videoId:'v',artistId:'a',title:'V',thumbnail:'bad'}};renderGrid();const img=document.querySelector('.thumb-img');img.dispatchEvent(new Event('error'));return img.onerror===null;
});
test(68,'music-videos','invalid cloud video payload leaves the entire library intact',()=>{
  artists=[{id:'a',name:'A'}];window._sbOnLoad({artists:[{id:'bad',name:'Bad'}],videos:[],lastFetch:{}});return artists[0].id==='a'&&!Array.isArray(videos);
});
test(69,'music-videos','typing during a channel request invalidates its results',async()=>{
  openAddModal();let done;searchChannels=()=>new Promise(r=>done=r);const input=document.getElementById('artist-input');input.value='Old';const pending=doChannelSearch();
  input.value='New';input.dispatchEvent(new Event('input'));done([{channelId:'old',name:'Old'}]);await pending;return _searchResults.length===0;
});

const cloudStorage={_sb_url:'https://fixture.supabase.co',_sb_key:'fixture',_sb_email:'a@example.test',_sb_pass:'fixture-password'};
test(70,'album-atlas','obsolete plaintext passwords are deleted even without the SDK',()=>localStorage.getItem('_sb_pass')===null,cloudStorage);
test(71,'album-atlas','copied cloud configuration excludes passwords',async()=>{
  let copied;Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>copied=text},configurable:true});
  document.getElementById('_sb_copy_cfg').click();await Promise.resolve();return copied&&!copied.includes('PASS')&&!copied.includes('fixture-password');
},cloudStorage,{cloud:true});
test(72,'album-atlas','persisted auth sessions restore without a stored password',()=>cloudFixture.readCalls===1&&cloudFixture.signIns===0,
  {...cloudStorage,_sb_pass:''},{cloud:true});
test(73,'album-atlas','manual sign-in never persists the entered password',async()=>{
  window._sbOpenPanel();document.getElementById('_sb_pass_in').value='typed-secret';await document.getElementById('_sb_save_btn').onclick();
  return localStorage.getItem('_sb_pass')===null&&document.getElementById('_sb_pass_in').value==='';
},cloudStorage,{cloud:true,noSession:true});
test(74,'album-atlas','cloud writes are serialized',async()=>{
  cloudFixture.manualWrites=true;state.listen=[{id:'a',title:'A'}];const first=window._sbSyncNow();state.listen.push({id:'b',title:'B'});const second=window._sbSyncNow();
  await Promise.resolve();const overlap=cloudFixture.maxActive;cloudFixture.releaseWrites();await new Promise(r=>setTimeout(r,0));cloudFixture.releaseWrites();await Promise.all([first,second]);
  return overlap===1&&cloudFixture.writes.at(-1).data.listen.length===2;
},cloudStorage,{cloud:true});
test(75,'album-atlas','an older completed write cannot clear newer pending changes',async()=>{
  cloudFixture.manualWrites=true;state.listen=[{id:'a',title:'A'}];window._sbSyncNow();state.listen.push({id:'b',title:'B'});window._sbSyncNow();
  cloudFixture.waitingWrites.shift()();await new Promise(r=>setTimeout(r,0));return localStorage.getItem('_sb_pending_albums')==='1';
},cloudStorage,{cloud:true});
test(76,'album-atlas','manual reconnect preserves existing unsynced local edits',async()=>{
  state.listen=[{id:'local',title:'Local'}];window._sbSyncNow();cloudFixture.remote={listen:[{id:'remote',title:'Remote'}]};
  cloudFixture.manualReads=true;window._sbOpenPanel();document.getElementById('_sb_pass_in').value='fixture-password';const connect=document.getElementById('_sb_save_btn').onclick();
  await new Promise(r=>setTimeout(r,0));state.listen.push({id:'new',title:'New'});window._sbSyncNow();cloudFixture.releaseReads();await connect;
  return state.listen.some(a=>a.id==='local')&&state.listen.some(a=>a.id==='new');
},cloudStorage,{cloud:true});
test(77,'album-atlas','edits during initial cloud fetch win over remote data',async()=>{
  state.listen=[{id:'local',title:'Local'}];window._sbSyncNow();cloudFixture.releaseReads();await new Promise(r=>setTimeout(r,0));
  return state.listen[0]?.id==='local'&&cloudFixture.writes.at(-1)?.data.listen[0]?.id==='local';
},cloudStorage,{cloud:true,manualReads:true});
test(78,'album-atlas','a restored session with no cloud row uploads its local library',()=>cloudFixture.writes.length===1,
  cloudStorage,{cloud:true,noRow:true});
test(79,'album-atlas','a failed cloud read never triggers an upload over unknown remote data',async()=>{window._sbOpenPanel();document.getElementById('_sb_pass_in').value='fixture-password';await document.getElementById('_sb_save_btn').onclick();return cloudFixture.writes.length===0;},
  {...cloudStorage,_sb_pending:'1'},{cloud:true,readError:true,noRow:true});
test(80,'album-atlas','offline saves persist a pending marker without the SDK',()=>{
  state.listen=[{id:'local',title:'Local'}];saveState();return localStorage.getItem('_sb_pending_albums')==='1';
});
test(81,'album-atlas','failed auth storage writes override stale persisted tokens',()=>{
  const original=Object.getOwnPropertyDescriptor(window,'localStorage');Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:()=> 'old',setItem(){throw new Error('quota');}}});
  const store=cloudFixture.authStorage;store.setItem('auth-test','new');const result=store.getItem('auth-test')==='new';Object.defineProperty(window,'localStorage',original);return result;
},cloudStorage,{cloud:true});
test(82,'album-atlas','failed auth removal leaves a memory tombstone',()=>{
  localStorage.setItem('auth-test','old');const original=Storage.prototype.removeItem;Storage.prototype.removeItem=()=>{throw new Error('quota');};
  const store=cloudFixture.authStorage;store.removeItem('auth-test');Storage.prototype.removeItem=original;return store.getItem('auth-test')===null;
},cloudStorage,{cloud:true});
test(83,'album-atlas','pasting configuration never imports passwords into the form',()=>{
  window._sbOpenPanel();const input=document.getElementById('_sb_paste_area');input.value=JSON.stringify({url:'https://fixture.supabase.co',key:'fixture',email:'a@example.test',password:'secret'});input.dispatchEvent(new Event('input'));
  return document.getElementById('_sb_pass_in').value==='';
},cloudStorage,{cloud:true});
test(84,'album-atlas','copy config works through prompt when clipboard is unavailable',async()=>{
  let copied='';Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});window.prompt=(_,text)=>{copied=text;};
  await document.getElementById('_sb_copy_cfg').onclick();return copied.includes('SUPABASE_URL=');
},cloudStorage,{cloud:true});
test(85,'album-atlas','cloud setup panel remains available after a CDN failure',()=>{
  window._sbOpenPanel();return document.getElementById('_sb_form_row').style.display==='flex';
});

const paletteRecord={id:'p',filename:'One.svg',type:'svg',codes:['#123456'],svgString:'<svg xmlns="http://www.w3.org/2000/svg"><path fill="#123456"/></svg>',createdAt:'2026-01-01T00:00:00Z'};
test(86,'palette-painter','8-digit colors are not silently truncated to six digits',()=>extractHexCodes('#12345678').length===0);
test(87,'palette-painter','unencoded SVG data URLs retain commas',async()=>{
  const blob=dataUrlToBlob('data:image/svg+xml,<svg><text>A,B</text></svg>');return await blob.text()==='<svg><text>A,B</text></svg>';
});
test(88,'palette-painter','saved filenames and preview attributes render as data',()=>{
  const card=createRecordCard({id:'p',filename:'<b>Injected</b>" data-injected="yes',type:'svg',createdAt:'2026-01-01',previewDataUrl:'data:image/png,x" data-injected="yes'});
  const panel=document.createElement('div');panel.innerHTML=_buildPanelHTML({id:'p',filename:'<b>Injected</b>',type:'svg',codes:[]},'A',new Set());
  return !card.querySelector('b,[data-injected]')&&!panel.querySelector('b');
});
test(89,'palette-painter','invalid gallery records cannot abort gallery rendering',()=>{
  renderGallery();return document.querySelectorAll('#galleryGrid .gallery-item').length===0;
},{svgHexSavedDownloads:JSON.stringify([null,{id:'bad'}])});
test(90,'palette-painter','invalid collection members do not crash gallery actions',()=>{
  const card=createRecordCard({id:'p',filename:'One.svg',type:'svg',createdAt:'2026-01-01'});return !!card;
},{svgHexCollections:JSON.stringify([null,{id:'c',name:'Collection'}])});
test(91,'palette-painter','saving with blocked storage retains the gallery for the session',()=>{
  saveDownloadRecord('svg','One.svg',['#123456'],'<svg/>');return safeParseSavedDownloads().length===1&&window._sbGetData().gallery.length===1;
},{},{blockedStorage:true});
test(92,'palette-painter','deletion undo preserves palettes saved later',()=>{
  saveDownloadRecord('svg','One.svg',['#123456'],'<svg/>');const id=safeParseSavedDownloads()[0].id;removeDownloadRecord(id);
  saveDownloadRecord('svg','Two.svg',['#ABCDEF'],'<svg/>');undoDelete();return safeParseSavedDownloads().length===2;
});
test(93,'palette-painter','deletion undo preserves later renames of other palettes',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'},{id:'b',filename:'B.svg',type:'svg'}]);removeDownloadRecord('a');renameDownloadRecord('b','Edited.svg');undoDelete();
  return safeParseSavedDownloads().find(r=>r.id==='b').filename==='Edited.svg';
});
test(94,'palette-painter','deletion undo restores favourite membership',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'}]);persistFavouriteIds(['a']);removeDownloadRecord('a');undoDelete();return isFavourite('a');
});
test(95,'palette-painter','deletion undo restores custom collection membership',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'}]);persistCollections([{id:'c',name:'C',itemIds:['a']}]);activeCollectionId='c';removeDownloadRecord('a');undoDelete();
  return isInCollection('c','a');
});
test(96,'palette-painter','reused collection cards act on updated palette data',()=>{
  const card=createRecordCard({id:'p',filename:'Old.svg',type:'svg',codes:['#111111']});
  updateRecordCard(card,{id:'p',filename:'New.svg',type:'svg',codes:['#222222']});card.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
  return input.value==='#222222'&&filenameInput.value==='New';
});
test(97,'palette-painter','undo loading a palette restores previous input text',()=>{
  input.value='Original notes #111111';loadPaletteIntoInput({filename:'One.svg',codes:['#222222']});undoClean();return input.value==='Original notes #111111';
});
test(98,'palette-painter','invalid cloud payload is rejected atomically',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'}]);window._sbOnLoad({gallery:[{id:'bad'}],favourites:[],collections:[]});
  return safeParseSavedDownloads()[0]?.id==='a';
});
test(99,'palette-painter','remote gallery replacement invalidates local deletion history',()=>{
  persistSavedDownloads([{id:'a',filename:'A.svg',type:'svg'}]);removeDownloadRecord('a');window._sbOnLoad({gallery:[],favourites:[],collections:[]});undoDelete();return safeParseSavedDownloads().length===0;
});

test(100,'my-watchlist','missing release dates are actually backfilled and persisted',async()=>{
  state.tmdbKey='fixture';state.movies=[{id:'a',title:'A',tmdbId:1}];window.fetch=async()=>({ok:true,json:async()=>({release_date:'2026-12-01'})});
  await backfillReleaseDates();return state.movies[0].releaseDate==='2026-12-01'&&JSON.parse(localStorage.getItem('watchlist_v2'))[0].releaseDate==='2026-12-01';
});
test(101,'thirteen','blocked theme storage does not prevent calendar startup',()=>{
  document.getElementById('theme-toggle').click();return document.querySelectorAll('#date-grid .card').length>0;
},{},{blockedStorage:true});
test(102,'thirteen','arrow keys in the help modal do not change the selected year',()=>{
  const original=sel;openModal();document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));return sel===original;
});
test(103,'sotr-countdown','bottom sunburst uses its own gradient',()=>{
  return getComputedStyle(document.querySelector('.band.bottom path')).fill.includes('sunGradBot');
});
test(104,'sotr-countdown','countdown initializes when canvas rendering is unavailable',()=>document.title.includes('days'),{},{noCanvas:true});
test(105,'petal-countdown','release state still renders without canvas rendering',()=>!!document.querySelector('#countdown .released'),{},{noCanvas:true});
test(106,'petal-countdown','release message is stable after countdown finishes',async()=>{
  const original=document.querySelector('#countdown .released');await new Promise(r=>setTimeout(r,1100));return original===document.querySelector('#countdown .released');
});
test(107,'olivia-countdown','reduced-motion setting stops decorative animation',()=>getComputedStyle(document.querySelector('.swing-wrap')).animationName==='none'&&getComputedStyle(document.querySelector('.particle')).display==='none'&&getComputedStyle(document.querySelector('.album-title')).opacity==='1',{},{reducedMotion:true});
test(108,'','project navigation cards have accessible names',()=>[...document.querySelectorAll('.project-card')].every(card=>!!(card.getAttribute('aria-label')||card.textContent.trim())));
test(109,'apple-music','screenshot failure restores original custom layout padding',async()=>{
  const hero=document.querySelector('#capture-zone .hero');hero.style.paddingTop='17px';document.getElementById('screenshotBtn').click();await new Promise(r=>setTimeout(r,500));
  return hero.style.paddingTop==='17px'&&!document.getElementById('screenshotBtn').disabled;
},{},{screenshotMock:true});
test(110,'apple-music','repeated screenshot activation starts only one capture',async()=>{
  const btn=document.getElementById('screenshotBtn');btn.click();btn.click();await new Promise(r=>setTimeout(r,500));return window.captureCalls===1;
},{},{screenshotMock:true});
test(111,'apple-music','repeated dark-side lyric starts cancel previous animation timer',()=>{
  const waiting=new Set();const oldSet=window.setTimeout,oldClear=window.clearTimeout;let id=0;
  window.setTimeout=()=>{waiting.add(++id);return id;};window.clearTimeout=value=>waiting.delete(value);startDsLyrics();startDsLyrics();
  window.setTimeout=oldSet;window.clearTimeout=oldClear;return waiting.size===1;
});
test(112,'apple-music','reduced-motion setting skips flashing transition overlays',()=>{
  triggerDarkSide();return dsSection.classList.contains('visible')&&!lgOverlay.classList.contains('visible');
},{},{reducedMotion:true});

test(113,'palette-painter','ZIP entries remain unique when filenames already contain numbered suffixes',()=>{const seen=new Map();const names=['A.svg','A.svg','A (2).svg'].map(name=>uniqueZipFilename(name,seen));return new Set(names).size===3;});

test(114,'thirteen','year navigation fits a mobile viewport when web fonts fail',()=>document.documentElement.scrollWidth<=innerWidth,{},{resize:true});

async function run() {
  const browser = await chromium.launch({executablePath:process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',headless:true});
  const results = [];
  try {
    for (const t of cases.filter(t=>!process.env.CASES || process.env.CASES.split(',').includes(String(t.id)))) {
      const context = await browser.newContext({viewport:{width:1280,height:900},reducedMotion:t.options.reducedMotion?'reduce':'no-preference'});
      const page = await context.newPage();
      const errors=[]; page.on('pageerror',e=>errors.push(e.message));
      await context.addInitScript(({storage, blocked, cloud, noCanvas})=> {
        if(noCanvas)HTMLCanvasElement.prototype.getContext=()=>null;
        for (const [key,value] of Object.entries(storage)) localStorage.setItem(key,value);
        if (cloud) {
          const fixture=window.cloudFixture={writes:[],waitingWrites:[],waitingReads:[],active:0,maxActive:0,signIns:0,readCalls:0,
            remote:{listen:[],fathom:[],loved:[],enough:[]},manualReads:cloud.manualReads,manualWrites:false};
          fixture.releaseWrites=()=>fixture.waitingWrites.splice(0).forEach(r=>r());
          fixture.releaseReads=()=>fixture.waitingReads.splice(0).forEach(r=>r());
          const response=()=>({data:cloud.noRow?null:{data:fixture.remote},error:cloud.readError?{message:'read failed'}:null});
          window.fixtureSupabase={createClient:(_url,_key,options)=>{
            fixture.authStorage=options.auth.storage;
            return {auth:{getSession:async()=>({data:{session:cloud.noSession?null:{user:{id:'fixture-user',email:'a@example.test'}}}}),
              signInWithPassword:async()=>{fixture.signIns++;return {data:{user:{id:'fixture-user',email:'a@example.test'},session:{user:{id:'fixture-user',email:'a@example.test'}}}};},onAuthStateChange(){}},
              from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{fixture.readCalls++;if(fixture.manualReads)await new Promise(r=>fixture.waitingReads.push(r));return response();}})}),
                upsert:async row=>{fixture.writes.push(JSON.parse(JSON.stringify(row)));fixture.active++;fixture.maxActive=Math.max(fixture.maxActive,fixture.active);
                  if(fixture.manualWrites)await new Promise(r=>fixture.waitingWrites.push(r));fixture.active--;return {error:null};}})};
          }};
        }

        if(blocked) for (const method of ['getItem','setItem','removeItem']) Storage.prototype[method]=()=>{throw new DOMException('Blocked','SecurityError');};
      },{storage:t.storage,blocked:t.options.blockedStorage,cloud:t.options.cloud?t.options:null,noCanvas:t.options.noCanvas});
      await page.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.origin==='http://localhost') {
          const file=path.join(root,decodeURIComponent(url.pathname));
          if(fs.existsSync(file)&&fs.statSync(file).isFile()) return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
        }
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
