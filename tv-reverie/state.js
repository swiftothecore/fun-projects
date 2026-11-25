const COUNTRY_CODES={
  'united states':'US','usa':'US','us':'US','america':'US','united states of america':'US',
  'united kingdom':'GB','uk':'GB','england':'GB','britain':'GB','great britain':'GB','scotland':'GB','wales':'GB',
  'canada':'CA','australia':'AU','germany':'DE','deutschland':'DE','france':'FR',
  'japan':'JP','brazil':'BR','netherlands':'NL','holland':'NL','south korea':'KR','korea':'KR',
  'new zealand':'NZ','spain':'ES','italy':'IT','sweden':'SE','norway':'NO','denmark':'DK',
  'finland':'FI','switzerland':'CH','austria':'AT','belgium':'BE','portugal':'PT','ireland':'IE',
  'poland':'PL','czech republic':'CZ','czechia':'CZ','hungary':'HU','romania':'RO',
  'india':'IN','singapore':'SG','hong kong':'HK','mexico':'MX','argentina':'AR',
  'turkey':'TR','russia':'RU','china':'CN','taiwan':'TW','thailand':'TH',
  'indonesia':'ID','malaysia':'MY','philippines':'PH','vietnam':'VN','ukraine':'UA',
  'greece':'GR','israel':'IL','south africa':'ZA','egypt':'EG','saudi arabia':'SA',
  'uae':'AE','united arab emirates':'AE','pakistan':'PK','bangladesh':'BD',
  'sri lanka':'LK','colombia':'CO','chile':'CL','peru':'PE','venezuela':'VE',
  'croatia':'HR','serbia':'RS','slovakia':'SK','bulgaria':'BG','luxembourg':'LU',
  'iceland':'IS','latvia':'LV','lithuania':'LT','estonia':'EE','slovenia':'SI',
  'nigeria':'NG','kenya':'KE','ghana':'GH','morocco':'MA',
};

function countryFlag(name){
  if(!name)return'🔒';
  const code=COUNTRY_CODES[name.trim().toLowerCase()];
  if(!code)return'🔒';
  return String.fromCodePoint(code.charCodeAt(0)+0x1F1A5,code.charCodeAt(1)+0x1F1A5);
}

const SERVICES=['netflix','disney','prime','hbomax','appletv','other'];
const GROUP_ORDER=['netflix','disney','prime','hbomax','appletv','other'];
const TMDB_IMG='https://image.tmdb.org/t/p/w500';
const TMDB_SM='https://image.tmdb.org/t/p/w92';
// TMDB's search tokeniser drops single-character tokens and can mis-handle
// unusual punctuation, making some shows unfindable by text query. Map known-
// broken query strings (lowercased, hyphens normalised to spaces) to TMDB TV
// show IDs to inject the correct result directly. Add new entries as found.
const TMDB_SEARCH_ALIASES={};

function tvStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function tvStorageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function tvParse(key, fallback) { try { return JSON.parse(tvStorageGet(key)) ?? fallback; } catch { return fallback; } }
function validShows(data) { return Array.isArray(data) && data.every(m => m && typeof m.id === 'string' && typeof m.title === 'string'); }
function tvDictionary(data) { return Object.assign(Object.create(null), Object.fromEntries(Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {}).filter(([,value]) => value && typeof value === 'object' && !Array.isArray(value)))); }
let searchSequence = 0, selectionSequence = 0;
function positiveInteger(value) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : null; }
var shows=tvParse('tvshows_v1', []);
if (!Array.isArray(shows)) shows = [];
shows = shows.filter(m => m && typeof m.id === 'string' && typeof m.title === 'string');
let currentFilter='all',currentCategory=null,currentDetailId=null,editingId=null,searchTimer=null,searchHighlightIndex=-1,_pendingTmdbId=null;
let pendingShowMetadata = null;
let editingShowSnapshot = null;
let currentView=tvStorageGet('tvshows_view')||'grid';
if (!['grid','compact','list'].includes(currentView)) currentView='grid';
let desktopView = currentView;
let currentSort=tvStorageGet('tvshows_sort')||'';
let searchQuery='';
let includeDetachedSearch = false;
let currentCompanion = '';
let selectionMode=false;
let selectedIds=new Set();
let tmdbKey=tvStorageGet('tmdb_api_key')||'';
let undoStack=[],redoStack=[];
let categorySettings=tvDictionary(tvParse('category_settings_tvshows_v1', {}));
let categoryOptionsDismissed=tvStorageGet('category_options_tvshows_dismissed')==='1';
let _categoryNames=[],categoryHighlightIndex=-1,_filterBarResizeTimer=null;

const SERVICE_META={
  netflix:{ label:'Netflix',      color:'#e50914', rule:'rgba(229,9,20,0.15)'   },
  disney: { label:'Disney+',      color:'#3b82f6', rule:'rgba(59,130,246,0.15)' },
  prime:  { label:'Prime Video',  color:'#00a8e1', rule:'rgba(0,168,225,0.12)'  },
  hbomax: { label:'HBO Max',          color:'#9b5de5', rule:'rgba(155,93,229,0.12)' },
  appletv:{ label:'Apple TV+',    color:'#c8c8c8', rule:'rgba(200,200,200,0.1)' },
  other:  { label:'Other',        color:'#4ade80', rule:'rgba(74,222,128,0.1)'  },
};

const USER_TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Australia/Sydney';}catch(e){return'Australia/Sydney';}})();
function localDateStr(date){
  if (!Number.isFinite(date.getTime())) date=new Date();
  return new Intl.DateTimeFormat('en-CA',{timeZone:USER_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function jsAttr(value){return esc(JSON.stringify(value));}
function esc(s){if(s==null)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
