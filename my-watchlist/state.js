// Shared constants, persistent preferences, transient state, and escaping helpers.
// Classic scripts intentionally expose handler functions to inline HTML events.

const COUNTRY_CODES = {
  'united states': 'US',
  'usa': 'US',
  'us': 'US',
  'america': 'US',
  'united states of america': 'US',
  'united kingdom': 'GB',
  'uk': 'GB',
  'england': 'GB',
  'britain': 'GB',
  'great britain': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'canada': 'CA',
  'australia': 'AU',
  'germany': 'DE',
  'deutschland': 'DE',
  'france': 'FR',
  'japan': 'JP',
  'brazil': 'BR',
  'netherlands': 'NL',
  'holland': 'NL',
  'south korea': 'KR',
  'korea': 'KR',
  'new zealand': 'NZ',
  'spain': 'ES',
  'italy': 'IT',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'switzerland': 'CH',
  'austria': 'AT',
  'belgium': 'BE',
  'portugal': 'PT',
  'ireland': 'IE',
  'poland': 'PL',
  'czech republic': 'CZ',
  'czechia': 'CZ',
  'hungary': 'HU',
  'romania': 'RO',
  'india': 'IN',
  'singapore': 'SG',
  'hong kong': 'HK',
  'mexico': 'MX',
  'argentina': 'AR',
  'turkey': 'TR',
  'russia': 'RU',
  'china': 'CN',
  'taiwan': 'TW',
  'thailand': 'TH',
  'indonesia': 'ID',
  'malaysia': 'MY',
  'philippines': 'PH',
  'vietnam': 'VN',
  'ukraine': 'UA',
  'greece': 'GR',
  'israel': 'IL',
  'south africa': 'ZA',
  'egypt': 'EG',
  'saudi arabia': 'SA',
  'uae': 'AE',
  'united arab emirates': 'AE',
  'pakistan': 'PK',
  'bangladesh': 'BD',
  'sri lanka': 'LK',
  'colombia': 'CO',
  'chile': 'CL',
  'peru': 'PE',
  'venezuela': 'VE',
  'croatia': 'HR',
  'serbia': 'RS',
  'slovakia': 'SK',
  'bulgaria': 'BG',
  'luxembourg': 'LU',
  'iceland': 'IS',
  'latvia': 'LV',
  'lithuania': 'LT',
  'estonia': 'EE',
  'slovenia': 'SI',
  'nigeria': 'NG',
  'kenya': 'KE',
  'ghana': 'GH',
  'morocco': 'MA',
  'iceland': 'IS',
};

function countryFlag(name) {
  if (!name) return '🔒';
  const code = COUNTRY_CODES[name.trim().toLowerCase()];
  if (!code) return '🔒';
  return String.fromCodePoint(code.charCodeAt(0) + 0x1f1a5, code.charCodeAt(1) + 0x1f1a5);
}

const SERVICES = ['netflix', 'disney', 'prime', 'cinema', 'other'];

// Returns true when a film has no streaming service set at all (no direct, VPN, or
// cinema flags on any service). These films are treated as implicit "Other" — they
// appear in every Other section/filter automatically, but lose that classification
// the moment any real service is assigned to them.
function hasNoStreaming(m) {
  const s = m.streaming || {};
  return !SERVICES.some((sv) => s[sv]?.direct || s[sv]?.vpn) && !s.cinema?.coming;
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

const TMDB_SM = 'https://image.tmdb.org/t/p/w92';

// TMDB's search tokeniser drops single-character tokens and mis-handles
// titles with unusual punctuation (e.g. WALL·E uses U+00B7, not a hyphen),
// so some films cannot be found by any text query — confirmed by TMDB staff.
// Map known-broken query strings (lowercased, hyphens normalised to spaces)
// to TMDB movie IDs to inject the correct result. Add new entries as found.
const TMDB_SEARCH_ALIASES = {
  'wall e': 10681,
  'walle': 10681,
};

/**
 * Single owner of mutable app state. Only lists/preferences are persisted, using
 * the original keys and JSON shapes. Everything else is transient UI/cache state.
 * lists.normal and lists.christmas always own their respective arrays.
 * movies is the active-list accessor: assignments (undo/import/delete) replace
 * that list alone. Changing christmasMode never swaps/stashes array references.
 */
const state = {
  lists: {
    normal: JSON.parse(readStorage('watchlist_v2') || '[]'),
    christmas: JSON.parse(readStorage('christmas_watchlist_v1') || '[]'),
  },
  christmasMode: readStorage('christmas_mode_active') === 'true',
  get movies() {
    return this.christmasMode ? this.lists.christmas : this.lists.normal;
  },
  set movies(list) {
    if (this.christmasMode) this.lists.christmas = list;
    else this.lists.normal = list;
  },
  // Filters, film forms, suggestions, and search requests.
  currentFilter: 'all',
  currentCategory: null,
  currentDetailId: null,
  editingId: null,
  searchTimer: null,
  searchHighlightIndex: -1,
  _pendingTmdbId: null,
  _pendingReleaseDate: null,
  searchQuery: '',
  searchIncludesDetached: false,
  currentWatchWith: null,
  _watchWithNames: [],
  watchWithHighlightIndex: -1,
  // Persisted display preferences and API keys.
  currentSort: readStorage('watchlist_sort') || 'dateAdded-asc',
  currentGrouping: readStorage('watchlist_grouping') || 'grouped',
  hideWatched: readStorage('watchlist_hideWatched') === 'true',
  _preloadId: null,
  _preloadPromise: null,
  currentView: readStorage('watchlist_view') || 'grid',
  tmdbKey: readStorage('tmdb_api_key') || '',
  omdbKey: readStorage('omdb_api_key') || '',
  // Active-list history; cleared on a Christmas mode switch.
  undoStack: [],
  redoStack: [],
  categorySettings: JSON.parse(readStorage('category_settings_v1') || '{}'),
  categoryOptionsDismissed: readStorage('category_options_dismissed') === '1',
  _searchSeq: 0,
  _rtBackfillRunning: false,
  // ── Scroll lock (prevents background scroll while any modal is open) ──────
  _scrollLockY: 0,
  _scrollLockCount: 0,
  _collectionNames: [],
  _categoryNames: [],
  collectionHighlightIndex: -1,
  categoryHighlightIndex: -1,
  // ── Christmas visual effects ──────────────────────────────────────────────
  // Snow
  _snowCvs: null,
  _snowCtx: null,
  _snowFlakes: [],
  _snowRaf: null,
  _lightsResizeTimer: null,
  // ── Sub-panel ──
  _bulkPanel: null,
  // ── Surprise Me ────────────────────────────────────────────────────────────
  _surpriseSeenIds: new Set(),
  // ── Letterboxd Export ───────────────────────────────────────────────────────
  _exportScope: 'unwatched', // 'unwatched' | 'all'
  // ── Letterboxd Import ──────────────────────────────────────────────────────
  _importRows: [],
  _importSnap: null,
  _importActive: false,
  // ── Categorise unserviced films ────────────────────────────────────────────
  _importCategoriseSkipped: new Set(),
  _lastCategoriseAction: null, // { id, streaming, otherName } — for Cmd+Z undo
  // ── Paste List Import ─────────────────────────────────────────────────────
  _pasteItems: [], // [{ inputTitle, results, selectedIdx, removed, showingAlts }]
  _pasteCategory: '',
  _pasteWatched: false,
  _pasteSearchActive: false,
  _pasteConfirmActive: false,
  _pasteSnap: null,
  _openAltsIdx: -1, // which item's alts panel is currently open
  _altHighlightIdx: -1, // keyboard-highlighted row within that panel
  _pasteCatHighlight: -1, // keyboard highlight in category dropdown
  // Bulk selection and serialized background work.
  selectionMode: false,
  selectedIds: new Set(),
  backfillQueue: Promise.resolve(),
  htmlCache: new WeakMap(),
};

function getNormalList() {
  return state.lists.normal;
}
function getChristmasList() {
  return state.lists.christmas;
}
function setNormalList(list) {
  state.lists.normal = list;
}
function setChristmasList(list) {
  state.lists.christmas = list;
}

// Service metadata for grouped "All" view
const SERVICE_META = {
  netflix: { label: 'Netflix', color: '#e50914', rule: 'rgba(229,9,20,0.15)' },
  disney: { label: 'Disney+', color: '#3b82f6', rule: 'rgba(59,130,246,0.15)' },
  prime: { label: 'Prime Video', color: '#00a8e1', rule: 'rgba(0,168,225,0.12)' },
  cinema: { label: 'In Cinemas', color: '#818cf8', rule: 'rgba(129,140,248,0.15)' },
  other: { label: 'Other', color: '#4ade80', rule: 'rgba(74,222,128,0.1)' },
};

const GROUP_ORDER = ['netflix', 'disney', 'prime', 'cinema', 'other'];

// Detect user's timezone, fall back to AEST/AEDT
const USER_TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Sydney';
  } catch (e) {
    return 'Australia/Sydney';
  }
})();

// Returns a YYYY-MM-DD string in the user's local timezone
function localDateStr(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: USER_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ── Rotten Tomatoes (via OMDb) ──
// rtRating: '92%' when found, '' when OMDb has no RT score (rechecked after RT_RECHECK_DAYS).
const RT_RECHECK_DAYS = 30;

// ── Sort helpers ────────────────────────────────────────────────────────
// Compact labels for the sort button (matches the menu options)
const SORT_LABELS = {
  'dateAdded-desc': 'Newest',
  'dateAdded-asc': 'Oldest',
  'dateWatched-desc': 'Newest',
  'dateWatched-asc': 'Oldest',
  'year-desc': 'Year \u2193',
  'year-asc': 'Year \u2191',
  'title-asc': 'A\u2013Z',
  'runtime-desc': 'Runtime \u2193',
  'runtime-asc': 'Runtime \u2191',
  'rating-desc': 'Rating',
};

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Safe JavaScript literal inside a double-quoted HTML event attribute.
function jsAttr(value) {
  return esc(JSON.stringify(value));
}

// Lights
const _bulbCols = ['#e63946', '#ffd166', '#3ecf7a', '#4fc3f7', '#ff7043', '#c084fc'];
