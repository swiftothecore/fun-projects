// Shared constants, persistent preferences, transient state, and escaping helpers.
// Classic scripts intentionally expose handler functions to inline HTML events.

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
  'nigeria':'NG','kenya':'KE','ghana':'GH','morocco':'MA','iceland':'IS',
};

function countryFlag(name){
  if(!name)return'🔒';
  const code=COUNTRY_CODES[name.trim().toLowerCase()];
  if(!code)return'🔒';
  return String.fromCodePoint(code.charCodeAt(0)+0x1F1A5,code.charCodeAt(1)+0x1F1A5);
}

const SERVICES=['netflix','disney','prime','cinema','other'];

// Returns true when a film has no streaming service set at all (no direct, VPN, or
// cinema flags on any service). These films are treated as implicit "Other" — they
// appear in every Other section/filter automatically, but lose that classification
// the moment any real service is assigned to them.
function hasNoStreaming(m){
  const s=m.streaming||{};
  return !SERVICES.some(sv=>s[sv]?.direct||s[sv]?.vpn)&&!s.cinema?.coming;
}

const TMDB_IMG='https://image.tmdb.org/t/p/w500';

const TMDB_SM='https://image.tmdb.org/t/p/w92';

// TMDB's search tokeniser drops single-character tokens and mis-handles
// titles with unusual punctuation (e.g. WALL·E uses U+00B7, not a hyphen),
// so some films cannot be found by any text query — confirmed by TMDB staff.
// Map known-broken query strings (lowercased, hyphens normalised to spaces)
// to TMDB movie IDs to inject the correct result. Add new entries as found.
const TMDB_SEARCH_ALIASES={
  'wall e':10681, 'walle':10681,
};

var movies=JSON.parse(localStorage.getItem('watchlist_v2')||'[]');

let christmasMovies=JSON.parse(localStorage.getItem('christmas_watchlist_v1')||'[]');

let christmasMode=localStorage.getItem('christmas_mode_active')==='true';

let _normalMovies=null;

let currentFilter='all',currentCategory=null,currentDetailId=null,editingId=null,searchTimer=null,searchHighlightIndex=-1,_pendingTmdbId=null,_pendingReleaseDate=null;

let searchQuery='';

let searchIncludesDetached=false;

let currentWatchWith=null;

let _watchWithNames=[];

let watchWithHighlightIndex=-1;

let currentSort=localStorage.getItem('watchlist_sort')||'dateAdded-asc';

let currentGrouping=localStorage.getItem('watchlist_grouping')||'grouped';

let hideWatched=localStorage.getItem('watchlist_hideWatched')==='true';

let _preloadId=null,_preloadPromise=null;

let currentView=localStorage.getItem('watchlist_view')||'grid';

let tmdbKey=localStorage.getItem('tmdb_api_key')||'';

let omdbKey=localStorage.getItem('omdb_api_key')||'';

let undoStack=[],redoStack=[];

let categorySettings=JSON.parse(localStorage.getItem('category_settings_v1')||'{}');

let categoryOptionsDismissed=localStorage.getItem('category_options_dismissed')==='1';

// Service metadata for grouped "All" view
const SERVICE_META={
  netflix:{ label:'Netflix',     color:'#e50914', rule:'rgba(229,9,20,0.15)'   },
  disney: { label:'Disney+',     color:'#3b82f6', rule:'rgba(59,130,246,0.15)' },
  prime:  { label:'Prime Video', color:'#00a8e1', rule:'rgba(0,168,225,0.12)'  },
  cinema: { label:'In Cinemas',  color:'#818cf8', rule:'rgba(129,140,248,0.15)'},
  other:  { label:'Other',       color:'#4ade80', rule:'rgba(74,222,128,0.1)'  },
};

const GROUP_ORDER=['netflix','disney','prime','cinema','other'];

// Detect user's timezone, fall back to AEST/AEDT
const USER_TZ=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'Australia/Sydney';}catch(e){return'Australia/Sydney';}})();

// Returns a YYYY-MM-DD string in the user's local timezone
function localDateStr(date){
  return new Intl.DateTimeFormat('en-CA',{timeZone:USER_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

let _searchSeq=0;

// ── Rotten Tomatoes (via OMDb) ──
// rtRating: '92%' when found, '' when OMDb has no RT score (rechecked after RT_RECHECK_DAYS).
const RT_RECHECK_DAYS=30;

let _rtBackfillRunning=false;

// ── Sort helpers ────────────────────────────────────────────────────────
// Compact labels for the sort button (matches the menu options)
const SORT_LABELS={
  'dateAdded-desc':'Newest',
  'dateAdded-asc':'Oldest',
  'dateWatched-desc':'Newest',
  'dateWatched-asc':'Oldest',
  'year-desc':'Year \u2193',
  'year-asc':'Year \u2191',
  'title-asc':'A\u2013Z',
  'runtime-desc':'Runtime \u2193',
  'runtime-asc':'Runtime \u2191',
  'rating-desc':'Rating'
};

// ── Scroll lock (prevents background scroll while any modal is open) ──────
let _scrollLockY = 0, _scrollLockCount = 0;

let _collectionNames=[];

let _categoryNames=[];

let collectionHighlightIndex=-1;

let categoryHighlightIndex=-1;

const _htmlCache=new WeakMap();

function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

// Safe JavaScript literal inside a double-quoted HTML event attribute.
function jsAttr(value){return esc(JSON.stringify(value));}

// ── Christmas visual effects ──────────────────────────────────────────────

// Snow
let _snowCvs=null,_snowCtx=null,_snowFlakes=[],_snowRaf=null;

// Lights
const _bulbCols=['#e63946','#ffd166','#3ecf7a','#4fc3f7','#ff7043','#c084fc'];

let _lightsResizeTimer=null;

// ── Sub-panel ──
let _bulkPanel = null;

// ── Surprise Me ────────────────────────────────────────────────────────────

let _surpriseSeenIds = new Set();

// ── Letterboxd Export ───────────────────────────────────────────────────────

let _exportScope = 'unwatched';

// ── Letterboxd Import ──────────────────────────────────────────────────────

let _importRows   = [];

let _importSnap   = null;

let _importActive = false;

// ── Categorise unserviced films ────────────────────────────────────────────
let _importCategoriseSkipped = new Set();

let _lastCategoriseAction = null;

// ── Paste List Import ─────────────────────────────────────────────────────

let _pasteItems          = [];

// [{ inputTitle, results, selectedIdx, removed, showingAlts }]
let _pasteCategory       = '';

let _pasteWatched        = false;

let _pasteSearchActive   = false;

let _pasteConfirmActive  = false;

let _pasteSnap           = null;

let _openAltsIdx         = -1;

// which item's alts panel is currently open
let _altHighlightIdx     = -1;

// keyboard-highlighted row within that panel
let _pasteCatHighlight   = -1;
