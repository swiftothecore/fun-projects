// Local saves, Supabase authentication/session restoration, retries, and payload compatibility.
// Classic scripts intentionally expose handler functions to inline HTML events.

// Remove the legacy plaintext password even when the CDN is unavailable.
try {
  removeStorage('_sb_pass');
} catch (e) {}

async function _sbRun() {
  if (window._sbInitDone) return;
  window._sbInitDone = true;
  if (typeof supabase === 'undefined') {
    console.warn('[Sync] Supabase library not loaded — cloud sync unavailable.');
    return;
  }

  const K = { url: '_sb_url', key: '_sb_key', email: '_sb_email', dismissed: '_sb_dismissed' };
  let _sb = null,
    _user = null,
    _pendingSync = readStorage('_sb_pending') === '1';
  let _syncPromise = null,
    _syncRequested = false,
    _pullRetryTimer = null;

  // ── Safe localStorage helper ──
  function _lsGet(k) {
    try {
      return readStorage(k);
    } catch (e) {
      return null;
    }
  }

  // ── Custom auth storage for supabase-js ──
  const _sbMem = Object.create(null);
  const _sbDirty = new Set();
  const _sbStore = {
    getItem: (k) => {
      if (_sbDirty.has(k)) return _sbMem[k];
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return _sbMem[k] ?? null;
      }
    },
    setItem: (k, v) => {
      _sbMem[k] = v;
      try {
        localStorage.setItem(k, v);
        _sbDirty.delete(k);
      } catch (e) {
        _sbDirty.add(k);
      }
    },
    removeItem: (k) => {
      // Remember removals even when storage is blocked or full.
      _sbMem[k] = null;
      try {
        localStorage.removeItem(k);
        _sbDirty.delete(k);
      } catch (e) {
        _sbDirty.add(k);
      }
    },
  };

  let _authClient = null,
    _authUrl = null,
    _authKey = null;
  function _makeClient(url, key) {
    // Reuse the client so retries share auth refresh and in-memory storage.
    if (_authClient && _authUrl === url && _authKey === key) return _authClient;
    if (_authClient) _authClient.auth.stopAutoRefresh();
    _authUrl = url;
    _authKey = key;
    _authClient = supabase.createClient(url, key, {
      auth: { storage: _sbStore, persistSession: true, autoRefreshToken: true },
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
      btn.appendChild(dot);
    }
    dot.style.background = color;
    dot.style.boxShadow = `0 0 5px ${color}aa`;
  }

  const wrap = document.getElementById('_sb_wrap');
  const formRow = document.getElementById('_sb_form_row');
  const status = document.getElementById('_sb_status');

  const showBanner = () => {
    wrap.style.display = 'block';
  };
  const hideBanner = () => {
    wrap.style.display = 'none';
  };
  const setStatus = (msg, cls) => {
    status.textContent = msg;
    status.className = cls || '';
  };

  document.getElementById('_sb_dismiss_btn').onclick = () => {
    try {
      writeStorage(K.dismissed, '1');
    } catch (e) {}
    hideBanner();
  };

  document.getElementById('_sb_connect_btn').onclick = () => {
    formRow.style.display = 'flex';
    document.getElementById('_sb_url_in').value = _lsGet(K.url) || '';
    document.getElementById('_sb_key_in').value = _lsGet(K.key) || '';
    document.getElementById('_sb_email_in').value = _lsGet(K.email) || '';
    _passwordField();
    if (_lsGet(K.url) && _lsGet(K.key))
      document.getElementById('_sb_copy_cfg').style.display = 'inline-flex';
  };

  document.getElementById('_sb_save_btn').onclick = async () => {
    const url = document.getElementById('_sb_url_in').value.trim();
    const key = document.getElementById('_sb_key_in').value.trim();
    const email = document.getElementById('_sb_email_in').value.trim();
    const pass = document.getElementById('_sb_pass_in').value;
    if (!url || !key || !email) {
      setStatus('Please fill all fields.', 'err');
      return;
    }
    setStatus('Connecting...', '');
    try {
      const client = _makeClient(url, key);
      // getSession restores the SDK's persisted session and refreshes it if needed.
      const restored = await client.auth.getSession();
      let data =
        !restored.error &&
        restored.data?.session?.user?.email?.toLowerCase() === email.toLowerCase()
          ? { user: restored.data.session.user }
          : null;
      if (!data) {
        document.getElementById('_sb_pass_in').style.display = '';
        if (!pass) {
          setStatus('Please enter your password.', 'err');
          return;
        }
        const signedIn = await client.auth.signInWithPassword({ email, password: pass });
        if (signedIn.error) {
          setStatus('Error: ' + signedIn.error.message, 'err');
          return;
        }
        data = signedIn.data;
      }
      try {
        writeStorage(K.url, url);
        writeStorage(K.key, key);
        writeStorage(K.email, email);
        removeStorage(K.dismissed);
      } catch (e) {}
      _sb = client;
      _user = data.user;
      _passwordField();
      setStatus('Connected!', 'ok');
      _btnStatus('#5a9e7a', 'Connected');
      // Use the same conflict checks for manual connection and session restore.
      if (await _loadCloud()) setTimeout(hideBanner, 1500);
    } catch (e) {
      setStatus('Error: ' + e.message, 'err');
    }
  };

  // ── Smart paste / copy config ────────────────────────────────────────────
  function _parseConfig(text) {
    const r = {};
    // 1. Try JSON
    try {
      const j = JSON.parse(text.trim());
      const pick = (ps) => {
        for (const k of Object.keys(j)) {
          if (ps.some((p) => k.toLowerCase().includes(p))) return String(j[k]);
        }
        return '';
      };
      r.url = pick(['url']);
      r.key = pick(['key', 'anon']);
      r.email = pick(['email', 'mail']);
      if (r.url || r.key) return r;
    } catch (e) {}
    // 2. Try key=value pairs (.env style, handles NEXT_PUBLIC_ / VITE_ / REACT_APP_ prefixes)
    const kv = {};
    text.replace(/^([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.+)$/gm, (_, k, v) => {
      kv[k.toLowerCase().replace(/^(next_public_|vite_|react_app_)/, '')] = v
        .trim()
        .replace(/^['"]|['"]$/g, '');
    });
    if (Object.keys(kv).length) {
      const pick = (ps) => {
        for (const k of Object.keys(kv)) {
          if (ps.some((p) => k.includes(p))) return kv[k];
        }
        return '';
      };
      const u = pick(['supabase_url', 'project_url']) || pick(['url']);
      const k = pick(['anon_key', 'anon', 'key']);
      const e = pick(['email', 'mail', 'user']);
      if (u || k) {
        r.url = u;
        r.key = k;
        r.email = e;
        return r;
      }
    }
    // 3. Magic detection by pattern
    const um = text.match(/https:\/\/[a-z0-9]{8,}\.supabase\.co/i);
    // Matches JWT-style keys (old format: eyJ...) and new sb_publishable_/sb_secret_ style keys
    const jm =
      text.match(/eyJ[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{30,}\.[A-Za-z0-9_\-]{10,}/) ||
      text.match(/sb_[a-z]+_[A-Za-z0-9_\-]{10,}/i);
    const em = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (um) r.url = um[0];
    if (jm) r.key = jm[0];
    if (em) r.email = em[0];
    return r;
  }

  function _applyConfig(cfg) {
    if (cfg.url) document.getElementById('_sb_url_in').value = cfg.url;
    if (cfg.key) document.getElementById('_sb_key_in').value = cfg.key;
    if (cfg.email) document.getElementById('_sb_email_in').value = cfg.email;
    const n = [cfg.url, cfg.key, cfg.email].filter(Boolean).length;
    setStatus(
      n === 3
        ? 'Settings filled — enter your password to connect.'
        : n + '/3 settings detected — fill the rest manually.',
      n === 3 ? 'ok' : ''
    );
  }

  const pasteRow = document.getElementById('_sb_paste_row');
  const pasteArea = document.getElementById('_sb_paste_area');
  const pasteToggle = document.getElementById('_sb_paste_toggle');
  const copyCfgBtn = document.getElementById('_sb_copy_cfg');

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
      setTimeout(() => {
        pasteRow.style.display = 'none';
        pasteToggle.textContent = 'Paste config';
        pasteArea.value = '';
      }, 400);
    }
  }

  pasteArea.addEventListener('paste', () => setTimeout(_tryApplyPaste, 30));
  pasteArea.addEventListener('input', () => {
    if (pasteArea.value.trim().length > 30) _tryApplyPaste();
  });

  copyCfgBtn.onclick = () => {
    const url = _lsGet(K.url) || '',
      key = _lsGet(K.key) || '',
      email = _lsGet(K.email) || '';
    const snippet = `SUPABASE_URL=${url}\nSUPABASE_ANON_KEY=${key}\nSUPABASE_EMAIL=${email}`;
    navigator.clipboard
      .writeText(snippet)
      .then(() => {
        copyCfgBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyCfgBtn.textContent = 'Copy config';
        }, 2200);
      })
      .catch(() => {
        const t = prompt('Copy this config and paste it on your other device:', snippet);
      });
  };
  // ─────────────────────────────────────────────────────────────────────────

  async function _tryConnect() {
    const url = _lsGet(K.url),
      key = _lsGet(K.key);
    if (!url || !key) return false;
    try {
      const client = _makeClient(url, key);
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user) return false;
      const email = _lsGet(K.email);
      if (email && data.session.user.email?.toLowerCase() !== email.toLowerCase()) return false;
      _sb = client;
      _user = data.session.user;
      _passwordField();
      return true;
    } catch {
      return false;
    }
  }

  // Persist pending state across page reloads: if an upsert fails we mark
  // _sb_pending in localStorage so that on the next load we know to push
  // local data rather than blindly loading (potentially older) remote data.
  function _setPending(on) {
    _pendingSync = on;
    try {
      on ? writeStorage('_sb_pending', '1') : removeStorage('_sb_pending');
    } catch (e) {}
  }

  async function _upsert(table, payload) {
    if (!_sb || !_user) {
      _setPending(true);
      return false;
    }
    try {
      _btnStatus('#d97706', 'Syncing...');
      const row = { user_id: _user.id, data: payload, updated_at: new Date().toISOString() };
      const { error } = await _sb.from(table).upsert(row, { onConflict: 'user_id' });
      if (error) {
        console.warn('[Sync] Upsert failed:', error.message);
        _btnStatus('#c0392b', 'Sync failed: ' + error.message);
        _setPending(true);
        setTimeout(async () => {
          if (_pendingSync && _sb && _user) {
            await _syncNow();
          }
        }, 2000);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[Sync] Upsert error:', e.message);
      _btnStatus('#c0392b', 'Sync error: ' + e.message);
      _setPending(true);
      setTimeout(async () => {
        if (_pendingSync && _sb && _user) {
          await _syncNow();
        }
      }, 2000);
      return false;
    }
  }

  function _syncNow() {
    _syncRequested = true;
    _setPending(true);
    if (_syncPromise) return _syncPromise;
    // Serialize writes so an older response cannot overwrite a later edit or
    // clear its pending marker. Coalesce queued saves into the latest snapshot.
    _syncPromise = Promise.resolve().then(async () => {
      try {
        while (_syncRequested) {
          _syncRequested = false;
          if (!window._SB_TABLE) break;
          const data = window._sbGetData
            ? window._sbGetData()
            : window._SB_LS_KEY
              ? JSON.parse(_lsGet(window._SB_LS_KEY) || 'null')
              : null;
          if (data == null) break;
          const payload = JSON.parse(JSON.stringify(data));
          if (!(await _upsert(window._SB_TABLE, payload))) break;
          if (!_syncRequested) {
            _setPending(false);
            _btnStatus('#5a9e7a', 'Saved to cloud \u2713');
          }
        }
      } finally {
        _syncPromise = null;
      }
    });
    return _syncPromise;
  }

  async function _loadCloud() {
    const client = _sb,
      user = _user;
    const persistedPending = _lsGet('_sb_pending') === '1';
    const before = window._sbGetData ? JSON.stringify(window._sbGetData()) : null;
    try {
      const { data: row, error } = await client
        .from(window._SB_TABLE || '__')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();
      if (client !== _sb || user !== _user) return false;
      if (error) throw error;
      clearTimeout(_pullRetryTimer);
      const after = window._sbGetData ? JSON.stringify(window._sbGetData()) : null;
      if (_pendingSync || persistedPending || before !== after || !row) {
        await _syncNow();
      } else if (window._sbOnLoad) {
        window._sbPaused = true;
        try {
          window._sbOnLoad(row.data);
        } finally {
          window._sbPaused = false;
        }
        _btnStatus('#5a9e7a', 'Loaded from cloud');
      }
      return true;
    } catch (e) {
      if (client !== _sb || user !== _user) return false;
      setStatus('Could not load cloud data: ' + e.message, 'err');
      _btnStatus('#c0392b', 'Cloud load failed: ' + e.message);
      clearTimeout(_pullRetryTimer);
      _pullRetryTimer = setTimeout(_loadCloud, 5000);
      return false;
    }
  }

  window._sbSyncNow = _syncNow;
  window._sbForceSync = async () => {
    console.log('[Sync] Force sync...');
    if (!_sb || !_user) {
      const ok = await _tryConnect();
      if (!ok) {
        console.error('[Sync] Cannot connect');
        return;
      }
    }
    await _syncNow();
    console.log('[Sync] Done');
  };
  window._sbOpenPanel = function () {
    try {
      removeStorage('_sb_dismissed');
    } catch (e) {}
    wrap.style.display = 'block';
    formRow.style.display = 'flex';
    document.getElementById('_sb_url_in').value = _lsGet(K.url) || '';
    document.getElementById('_sb_key_in').value = _lsGet(K.key) || '';
    document.getElementById('_sb_email_in').value = _lsGet(K.email) || '';
    _passwordField();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window._sbPaused = false;

  const connected = await _tryConnect();
  if (connected) {
    hideBanner();
    _btnStatus('#d97706', 'Loading...');

    await _loadCloud();
  } else {
    _btnStatus('#4a4440', 'Not connected — tap to set up');
    if (!_lsGet(K.dismissed)) showBanner();
  }

  setInterval(async () => {
    if (!_pendingSync) return;
    if (!_sb || !_user) {
      const ok = await _tryConnect();
      if (!ok) return;
    }
    _syncNow();
  }, 5000);

  document.addEventListener('visibilitychange', () => {
    if (!_sb || !_user) return;
    if (_pendingSync) _syncNow();
  });
}

// Safe storage access also covers iOS restrictions during startup/preferences.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function isMovieList(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (m) => m && typeof m === 'object' && typeof m.id === 'string' && typeof m.title === 'string'
    )
  );
}

function isSettingsObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStoredJSON(key, fallback, validate) {
  try {
    const value = JSON.parse(readStorage(key));
    return validate(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  // Wrap in try-catch: on iOS with "Block All Cookies" enabled, localStorage
  // throws a SecurityError. We still want the Supabase sync to fire.
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('[Storage] localStorage write failed:', e.message);
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function saveCategorySettings() {
  save('categories');
}

// All local data mutations use this path. Remote hydration below writes its
// storage mirror directly: pulling must not stamp a local edit or echo a push.
function save(target = 'active', preserveRedo = false) {
  if (!preserveRedo) state.redoStack = [];
  // Persist this even before the async SDK has initialized.
  writeStorage('_sb_pending', '1');
  if (target === 'lists' || target === 'normal' || (target === 'active' && !state.christmasMode)) {
    writeStorage('watchlist_v2', JSON.stringify(getNormalList()));
  }
  if (
    target === 'lists' ||
    target === 'christmas' ||
    (target === 'active' && state.christmasMode)
  ) {
    writeStorage('christmas_watchlist_v1', JSON.stringify(getChristmasList()));
  }
  if (target === 'categories') {
    writeStorage('category_settings_v1', JSON.stringify(state.categorySettings));
  }
  // Stamp the local modification time so the conflict resolver knows
  // when THIS device last saved. Retained for compatibility with existing data.
  writeStorage('_sb_local_ts', String(Date.now()));
  // Belt-and-suspenders: trigger sync even when the storage write fails.
  // The explicit path replaces the old localStorage.setItem monkey-patch.
  if (window._sbSyncNow && !window._sbPaused) window._sbSyncNow();
}

window._SB_TABLE = 'watchlist';
window._SB_LS_KEY = 'watchlist_v2';

// Read from live in-memory arrays rather than localStorage.
// If localStorage writes are failing (iOS restrictions etc.), the in-memory
// arrays still have the correct current state, so Supabase gets accurate data.
window._sbGetData = function () {
  return {
    watchlist: getNormalList(),
    christmas: getChristmasList(),
    categorySettings: state.categorySettings,
  };
};

window._sbOnLoad = function (data) {
  const payload = Array.isArray(data) ? { watchlist: data } : data;
  if (!isSettingsObject(payload)) return;
  // Validate the whole payload before replacing any local data.
  if (
    ('watchlist' in payload && !isMovieList(payload.watchlist)) ||
    ('christmas' in payload && !isMovieList(payload.christmas)) ||
    ('categorySettings' in payload && !isSettingsObject(payload.categorySettings))
  ) {
    console.warn('[Sync] Ignoring malformed cloud data.');
    return;
  }
  const before = JSON.stringify(window._sbGetData());
  if ('watchlist' in payload) {
    setNormalList(payload.watchlist);
    writeStorage('watchlist_v2', JSON.stringify(payload.watchlist));
  }
  if ('christmas' in payload) {
    setChristmasList(payload.christmas);
    writeStorage('christmas_watchlist_v1', JSON.stringify(payload.christmas));
  }
  if ('categorySettings' in payload) {
    state.categorySettings = Object.assign(Object.create(null), payload.categorySettings);
    writeStorage('category_settings_v1', JSON.stringify(state.categorySettings));
  }
  if (before !== JSON.stringify(window._sbGetData())) {
    state.undoStack = [];
    state.redoStack = [];
    state._importSnap = state._pasteSnap = state._lastCategoriseAction = null;
    document.querySelectorAll('.toast').forEach((t) => dismissToast(t));
    exitSelectMode();
    closeDetail();
    closeAddModal();
    render();
    scheduleBackfills(300);
  }
};
