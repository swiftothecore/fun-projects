// Local saves, Supabase authentication/session restoration, retries, and payload compatibility.
// Classic scripts intentionally expose handler functions to inline HTML events.

// Remove the legacy plaintext password even when the CDN is unavailable.
try { localStorage.removeItem('_sb_pass'); } catch(e) {}

async function _sbRun() {
  if (window._sbInitDone) return;
  window._sbInitDone = true;
  if (typeof supabase === 'undefined') {
    console.warn('[Sync] Supabase library not loaded — cloud sync unavailable.');
    return;
  }

  const K = { url:'_sb_url', key:'_sb_key', email:'_sb_email', dismissed:'_sb_dismissed' };
  let _sb = null, _user = null, _pendingSync = false;

  // ── Safe localStorage helper ──
  function _lsGet(k) { try { return localStorage.getItem(k); } catch(e) { return null; } }

  // ── Custom auth storage for supabase-js ──
  const _sbMem = {};
  const _sbStore = {
    getItem:    k => { try { return localStorage.getItem(k) ?? _sbMem[k] ?? null; } catch(e) { return _sbMem[k] ?? null; } },
    setItem:    (k, v) => { _sbMem[k] = v; try { localStorage.setItem(k, v); } catch(e) {} },
    removeItem: k => { delete _sbMem[k]; try { localStorage.removeItem(k); } catch(e) {} }
  };

  let _authClient = null, _authUrl = null, _authKey = null;
  function _makeClient(url, key) {
    // Reuse the client so retries share auth refresh and in-memory storage.
    if (_authClient && _authUrl === url && _authKey === key) return _authClient;
    if (_authClient) _authClient.auth.stopAutoRefresh();
    _authUrl = url; _authKey = key;
    _authClient = supabase.createClient(url, key, {
      auth: { storage: _sbStore, persistSession: true, autoRefreshToken: true }
    });
    return _authClient;
  }

  function _passwordField() {
    const input = document.getElementById('_sb_pass_in');
    input.value = '';
    input.style.display = _user ? 'none' : '';
  }

  // ── Visible status dot on Cloud Save button ──
  function _btnStatus(color, tip) {
    const btn = document.getElementById('_sb_cloud_btn');
    if (!btn) return;
    btn.title = tip || '';
    let dot = btn.querySelector('._sb_dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = '_sb_dot';
      dot.style.cssText = 'width:7px;height:7px;border-radius:50%;flex-shrink:0;display:inline-block;margin-left:2px;transition:background 0.3s';
      btn.appendChild(dot);
    }
    dot.style.background = color;
    dot.style.boxShadow = `0 0 5px ${color}aa`;
  }

  const wrap    = document.getElementById('_sb_wrap');
  const formRow = document.getElementById('_sb_form_row');
  const status  = document.getElementById('_sb_status');

  const showBanner = () => { wrap.style.display = 'block'; };
  const hideBanner = () => { wrap.style.display = 'none';  };
  const setStatus = (msg, cls) => { status.textContent = msg; status.className = cls || ''; };

  document.getElementById('_sb_dismiss_btn').onclick = () => {
    try { localStorage.setItem(K.dismissed, '1'); } catch(e) {}
    hideBanner();
  };

  document.getElementById('_sb_connect_btn').onclick = () => {
    formRow.style.display = 'flex';
    document.getElementById('_sb_url_in').value   = _lsGet(K.url)   || '';
    document.getElementById('_sb_key_in').value   = _lsGet(K.key)   || '';
    document.getElementById('_sb_email_in').value = _lsGet(K.email) || '';
    _passwordField();
    if (_lsGet(K.url) && _lsGet(K.key)) document.getElementById('_sb_copy_cfg').style.display = 'inline-flex';
  };

  document.getElementById('_sb_save_btn').onclick = async () => {
    const url   = document.getElementById('_sb_url_in').value.trim();
    const key   = document.getElementById('_sb_key_in').value.trim();
    const email = document.getElementById('_sb_email_in').value.trim();
    const pass  = document.getElementById('_sb_pass_in').value;
    if (!url || !key || !email) { setStatus('Please fill all fields.', 'err'); return; }
    setStatus('Connecting...', '');
    try {
      const client = _makeClient(url, key);
      // getSession restores the SDK's persisted session and refreshes it if needed.
      const restored = await client.auth.getSession();
      let data = !restored.error && restored.data?.session?.user ? { user: restored.data.session.user } : null;
      if (!data) {
        document.getElementById('_sb_pass_in').style.display = '';
        if (!pass) { setStatus('Please enter your password.', 'err'); return; }
        const signedIn = await client.auth.signInWithPassword({ email, password: pass });
        if (signedIn.error) { setStatus('Error: ' + signedIn.error.message, 'err'); return; }
        data = signedIn.data;
      }
      try { localStorage.setItem(K.url, url); localStorage.setItem(K.key, key);
            localStorage.setItem(K.email, email);
            localStorage.removeItem(K.dismissed); } catch(e) {}
      _sb = client; _user = data.user;
      _passwordField();
      setStatus('Connected!', 'ok'); _btnStatus('#5a9e7a', 'Connected');
      // Pull remote data if it exists, otherwise push local up
      const { data: remoteRow } = await client.from(window._SB_TABLE || '__').select('data').eq('user_id', data.user.id).maybeSingle();
      if (remoteRow && window._sbOnLoad) {
        window._sbPaused = true;
        try { window._sbOnLoad(remoteRow.data); } finally { window._sbPaused = false; }
      } else {
        await _syncNow();
      }
      setTimeout(hideBanner, 1500);
    } catch (e) { setStatus('Error: ' + e.message, 'err'); }
  };

  // ── Smart paste / copy config ────────────────────────────────────────────
  function _parseConfig(text) {
    const r = {};
    // 1. Try JSON
    try {
      const j = JSON.parse(text.trim());
      const pick = (ps) => { for (const k of Object.keys(j)) { if (ps.some(p => k.toLowerCase().includes(p))) return String(j[k]); } return ''; };
      r.url = pick(['url']); r.key = pick(['key','anon']); r.email = pick(['email','mail']);
      if (r.url || r.key) return r;
    } catch(e) {}
    // 2. Try key=value pairs (.env style, handles NEXT_PUBLIC_ / VITE_ / REACT_APP_ prefixes)
    const kv = {};
    text.replace(/^([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.+)$/gm, (_, k, v) => {
      kv[k.toLowerCase().replace(/^(next_public_|vite_|react_app_)/,'')] = v.trim().replace(/^['"]|['"]$/g,'');
    });
    if (Object.keys(kv).length) {
      const pick = (ps) => { for (const k of Object.keys(kv)) { if (ps.some(p => k.includes(p))) return kv[k]; } return ''; };
      const u = pick(['supabase_url','project_url']) || pick(['url']);
      const k = pick(['anon_key','anon','key']);
      const e = pick(['email','mail','user']);
      if (u || k) { r.url=u; r.key=k; r.email=e; return r; }
    }
    // 3. Magic detection by pattern
    const um = text.match(/https:\/\/[a-z0-9]{8,}\.supabase\.co/i);
    // Matches JWT-style keys (old format: eyJ...) and new sb_publishable_/sb_secret_ style keys
    const jm = text.match(/eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{10,}/) ||
               text.match(/sb_[a-z]+_[A-Za-z0-9_\-]{10,}/i);
    const em = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (um) r.url = um[0]; if (jm) r.key = jm[0]; if (em) r.email = em[0];
    return r;
  }

  function _applyConfig(cfg) {
    if (cfg.url)   document.getElementById('_sb_url_in').value   = cfg.url;
    if (cfg.key)   document.getElementById('_sb_key_in').value   = cfg.key;
    if (cfg.email) document.getElementById('_sb_email_in').value = cfg.email;
    const n = [cfg.url,cfg.key,cfg.email].filter(Boolean).length;
    setStatus(n === 3 ? 'Settings filled — enter your password to connect.' : n + '/3 settings detected — fill the rest manually.', n === 3 ? 'ok' : '');
  }

  const pasteRow    = document.getElementById('_sb_paste_row');
  const pasteArea   = document.getElementById('_sb_paste_area');
  const pasteToggle = document.getElementById('_sb_paste_toggle');
  const copyCfgBtn  = document.getElementById('_sb_copy_cfg');

  pasteToggle.onclick = () => {
    const open = pasteRow.style.display === 'block';
    pasteRow.style.display = open ? 'none' : 'block';
    pasteToggle.textContent = open ? 'Paste config' : 'Hide paste';
    if (!open) pasteArea.focus();
  };

  function _tryApplyPaste() {
    const cfg = _parseConfig(pasteArea.value);
    if (cfg.url || cfg.key || cfg.email) {
      _applyConfig(cfg);
      // Auto-collapse paste area after successful fill
      setTimeout(() => { pasteRow.style.display='none'; pasteToggle.textContent='Paste config'; pasteArea.value=''; }, 400);
    }
  }

  pasteArea.addEventListener('paste', () => setTimeout(_tryApplyPaste, 30));
  pasteArea.addEventListener('input', () => { if (pasteArea.value.trim().length > 30) _tryApplyPaste(); });

  copyCfgBtn.onclick = () => {
    const url = _lsGet(K.url)||'', key = _lsGet(K.key)||'', email = _lsGet(K.email)||'';
    const snippet = `SUPABASE_URL=${url}\nSUPABASE_ANON_KEY=${key}\nSUPABASE_EMAIL=${email}`;
    navigator.clipboard.writeText(snippet)
      .then(() => { copyCfgBtn.textContent = 'Copied ✓'; setTimeout(() => { copyCfgBtn.textContent = 'Copy config'; }, 2200); })
      .catch(() => { const t = prompt('Copy this config and paste it on your other device:', snippet); });
  };
  // ─────────────────────────────────────────────────────────────────────────

  async function _tryConnect() {
    const url = _lsGet(K.url), key = _lsGet(K.key);
    if (!url || !key) return false;
    try {
      const client = _makeClient(url, key);
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user) return false;
      _sb = client; _user = data.session.user;
      _passwordField();
      return true;
    } catch { return false; }
  }

  // Persist pending state across page reloads: if an upsert fails we mark
  // _sb_pending in localStorage so that on the next load we know to push
  // local data rather than blindly loading (potentially older) remote data.
  function _setPending(on) {
    _pendingSync = on;
    try { on ? localStorage.setItem('_sb_pending','1') : localStorage.removeItem('_sb_pending'); } catch(e) {}
  }

  async function _upsert(table, payload) {
    if (!_sb || !_user) { _setPending(true); return false; }
    try {
      _btnStatus('#d97706', 'Syncing...');
      const row = { user_id: _user.id, data: payload, updated_at: new Date().toISOString() };
      const { error } = await _sb.from(table).upsert(row, { onConflict: 'user_id' });
      if (error) {
        console.warn('[Sync] Upsert failed:', error.message);
        _btnStatus('#c0392b', 'Sync failed: ' + error.message);
        _setPending(true);
        setTimeout(async () => { if (_pendingSync && _sb && _user) { _pendingSync = false; await _syncNow(); } }, 2000);
        return false;
      }
      _setPending(false);
      _btnStatus('#5a9e7a', 'Saved to cloud \u2713'); return true;
    } catch(e) {
      console.warn('[Sync] Upsert error:', e.message);
      _btnStatus('#c0392b', 'Sync error: ' + e.message);
      _setPending(true);
      setTimeout(async () => { if (_pendingSync && _sb && _user) { _pendingSync = false; await _syncNow(); } }, 2000);
      return false;
    }
  }

  async function _syncNow() {
    if (!window._SB_TABLE) return;
    const payload = window._sbGetData ? window._sbGetData()
                  : window._SB_LS_KEY ? JSON.parse(_lsGet(window._SB_LS_KEY) || 'null')
                  : null;
    if (payload != null) await _upsert(window._SB_TABLE, payload);
  }

  window._sbSyncNow = _syncNow;
  window._sbForceSync = async () => {
    console.log('[Sync] Force sync...');
    if (!_sb || !_user) { const ok = await _tryConnect(); if (!ok) { console.error('[Sync] Cannot connect'); return; } }
    await _syncNow();
    console.log('[Sync] Done');
  };
  window._sbOpenPanel = function() {
    try { localStorage.removeItem('_sb_dismissed'); } catch(e) {}
    wrap.style.display = 'block';
    formRow.style.display = 'flex';
    document.getElementById('_sb_url_in').value   = _lsGet(K.url)   || '';
    document.getElementById('_sb_key_in').value   = _lsGet(K.key)   || '';
    document.getElementById('_sb_email_in').value = _lsGet(K.email) || '';
    _passwordField();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window._sbPaused  = false;

  const connected = await _tryConnect();
  if (connected) {
    hideBanner();
    _btnStatus('#d97706', 'Loading...');

    const persistedPending = _lsGet('_sb_pending') === '1';

    const _snapBefore = window._sbGetData ? JSON.stringify(window._sbGetData()) : null;
    const { data: row } = await _sb.from(window._SB_TABLE || '__').select('data').eq('user_id', _user.id).maybeSingle();
    const _snapAfter = window._sbGetData ? JSON.stringify(window._sbGetData()) : null;

    const changedDuringFetch = _snapBefore !== null && _snapBefore !== _snapAfter;

    if (_pendingSync || persistedPending || changedDuringFetch) {
      _pendingSync = false;
      await _syncNow();
    } else {
      if (row && window._sbOnLoad) {
        window._sbPaused = true;
        try { window._sbOnLoad(row.data); } finally { window._sbPaused = false; }
        _btnStatus('#5a9e7a', 'Loaded from cloud');
      } else {
        _btnStatus('#5a9e7a', 'Connected');
      }
    }
  } else {
    _btnStatus('#4a4440', 'Not connected — tap to set up');
    if (!_lsGet(K.dismissed)) showBanner();
  }

  setInterval(async () => {
    if (!_pendingSync) return;
    if (!_sb || !_user) { const ok = await _tryConnect(); if (!ok) return; }
    _pendingSync = false; _syncNow();
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (!_sb || !_user) return;
    if (document.visibilityState === 'hidden') _syncNow();
    else if (_pendingSync) { _pendingSync = false; _syncNow(); }
  });
}

function saveCategorySettings(){
  localStorage.setItem('category_settings_v1',JSON.stringify(categorySettings));
  if(window._sbSyncNow&&!window._sbPaused)window._sbSyncNow();
}

function save(){
  if(christmasMode){localStorage.setItem('christmas_watchlist_v1',JSON.stringify(movies));}
  else{localStorage.setItem('watchlist_v2',JSON.stringify(movies));}
  // Belt-and-suspenders: also trigger sync directly in case the monkey-patch
  // doesn't fire (e.g. if localStorage.setItem throws before reaching it).
  if(window._sbSyncNow&&!window._sbPaused)window._sbSyncNow();
}

window._SB_TABLE  = 'watchlist';

window._SB_LS_KEY = 'watchlist_v2';

const __sbOrigSet = localStorage.setItem.bind(localStorage);

localStorage.setItem = function(key, value) {
  // Wrap in try-catch: on iOS with "Block All Cookies" enabled, localStorage
  // throws a SecurityError. We still want the Supabase sync to fire.
  try { __sbOrigSet(key, value); } catch(e) { console.warn('[Storage] localStorage write failed:', e.message); }
  if (key === 'watchlist_v2' || key === 'christmas_watchlist_v1') {
    // Stamp the local modification time so the conflict resolver knows
    // when THIS device last saved. Used by the IIFE to decide push vs. pull.
    try { __sbOrigSet('_sb_local_ts', String(Date.now())); } catch(e) {}
    if (window._sbSyncNow && !window._sbPaused) window._sbSyncNow();
  }
};

// Read from live in-memory arrays rather than localStorage.
// If localStorage writes are failing (iOS restrictions etc.), the in-memory
// arrays still have the correct current state, so Supabase gets accurate data.
window._sbGetData = function() {
  let watchlist, christmas;
  if (typeof movies !== 'undefined') {
    if (christmasMode) {
      // christmas mode: movies = christmas list, _normalMovies = normal list
      watchlist = (_normalMovies !== null && _normalMovies !== undefined)
        ? _normalMovies
        : JSON.parse(localStorage.getItem('watchlist_v2') || '[]');
      christmas = movies;
    } else {
      // normal mode: movies = normal list, christmasMovies = christmas list
      watchlist = movies;
      christmas = (typeof christmasMovies !== 'undefined')
        ? christmasMovies
        : JSON.parse(localStorage.getItem('christmas_watchlist_v1') || '[]');
    }
  } else {
    watchlist = JSON.parse(localStorage.getItem('watchlist_v2') || '[]');
    christmas = JSON.parse(localStorage.getItem('christmas_watchlist_v1') || '[]');
  }
  return { watchlist, christmas, categorySettings };
};

window._sbOnLoad = function(data) {
  try {
    // Handle legacy plain-array format (just a normal watchlist, no Christmas data yet)
    if (Array.isArray(data)) {
      const incoming = JSON.stringify(data);
      // Update in-memory state first so it's never blocked by a localStorage failure.
      if (!christmasMode && JSON.stringify(movies) !== incoming) { movies = data; render(); setTimeout(backfillReleaseDates,300); }
      try { __sbOrigSet('watchlist_v2', incoming); } catch(e) {}
      return;
    }
    // Handle combined object format {watchlist, christmas}
    if (data && typeof data === 'object') {
      if (data.watchlist) {
        const wIncoming = JSON.stringify(data.watchlist);
        if (christmasMode) {
          _normalMovies = data.watchlist; // update the stashed normal list
        } else if (JSON.stringify(movies) !== wIncoming) {
          movies = data.watchlist; render(); setTimeout(backfillReleaseDates,300);
        }
        try { __sbOrigSet('watchlist_v2', wIncoming); } catch(e) {}
      }
      if (data.christmas) {
        const cIncoming = JSON.stringify(data.christmas);
        christmasMovies = data.christmas;
        if (christmasMode && JSON.stringify(movies) !== cIncoming) { movies = data.christmas; render(); }
        try { __sbOrigSet('christmas_watchlist_v1', cIncoming); } catch(e) {}
      }
      if (data.categorySettings) {
        const changed = JSON.stringify(categorySettings) !== JSON.stringify(data.categorySettings);
        categorySettings = data.categorySettings;
        try { __sbOrigSet('category_settings_v1', JSON.stringify(data.categorySettings)); } catch(e) {}
        // Detached state affects which films are visible, so redraw
        if (changed) render();
      }
    }
  } catch(e) { console.warn('Supabase load error:', e); }
};
