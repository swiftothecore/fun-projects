/* Shared sync for the collection apps. The app supplies _SB_TABLE,
 * _sbGetData and _sbOnLoad; persisted row shapes and storage keys are unchanged. */
(() => {
  'use strict';
  const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const put = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const remove = key => { try { localStorage.removeItem(key); } catch {} };
  // Delete obsolete plaintext credentials even when the SDK/CDN is unavailable.
  remove('_sb_pass');
  const el = id => document.getElementById('_sb_' + id);
  const wrap = el('wrap'), form = el('form_row'), status = el('status');
  let client = null, user = null, loading = true, readReady = false, revision = 0, running = null;
  const pendingKey='_sb_pending_'+window._SB_TABLE;
  // Claim a legacy marker once; future edits stay isolated to their table.
  if(get(pendingKey)===null && get('_sb_pending')==='1'){put(pendingKey,'1');remove('_sb_pending');}
  let pending = get(pendingKey) === '1', retry = null, connecting = false;
  const overrides = new Map();
  const authStorage = {
    getItem(key) { return overrides.has(key) ? overrides.get(key) : get(key); },
    setItem(key, value) {
      try { localStorage.setItem(key, value); overrides.delete(key); }
      catch { overrides.set(key, value); }
    },
    removeItem(key) {
      try { localStorage.removeItem(key); overrides.delete(key); }
      catch { overrides.set(key, null); }
    },
  };
  window.addEventListener('storage', event => {
    if (event.key === null) overrides.clear(); else overrides.delete(event.key);
  });
  function setStatus(message, error = false) { status.textContent = message; status.className = error ? 'err' : 'ok'; }
  function indicator(message, color = '#d97706') {
    const button = document.getElementById('_sb_cloud_btn') || document.getElementById('cloud-save-btn');
    if (!button) return;
    button.title = message;
    let dot = button.querySelector('._sb_dot');
    if (!dot) { dot = document.createElement('span'); dot.className='_sb_dot'; dot.style.cssText='width:7px;height:7px;border-radius:50%;display:inline-block;margin-left:2px'; button.appendChild(dot); }
    dot.style.background=color;
  }
  function markPending(value) {
    pending=value;
    if (value) put(pendingKey,'1'); else remove(pendingKey);
  }
  function scheduleRetry() {
    if (retry) return;
    retry=setTimeout(() => { retry=null; if (pending) window._sbForceSync(); }, 5000);
  }
  async function drain() {
    if (loading || !readReady || !client || !user || !pending) return;
    if (running) return running;
    running=(async () => {
      while (pending && client && user && !loading) {
        const currentRevision=revision, owner=client, userId=user.id;
        try {
          // Snapshot each write; later edits join the queue rather than mutate its payload.
          const data=JSON.parse(JSON.stringify(window._sbGetData()));
          if (data===null) throw new Error('No valid local data to sync');
          indicator('Syncing…');
          const {error}=await owner.from(window._SB_TABLE).upsert({user_id:userId,data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
          if(error)throw error;
          if(owner!==client || userId!==user?.id) return;
          if(currentRevision===revision) { markPending(false); indicator('Saved to cloud ✓','#5a9e7a'); }
        } catch(error) {
          markPending(true); indicator('Sync failed: '+error.message,'#c0392b'); scheduleRetry(); break;
        }
      }
    })();
    try { await running; } finally { running=null; }
    // An edit can arrive between the final queue iteration and this continuation.
    if(pending && !retry && !loading && client && user) return drain();
  }
  window._sbPaused=false;
  window._sbSyncNow=() => {
    if(window._sbPaused)return Promise.resolve();
    revision++; markPending(true); put('_sb_local_ts',String(Date.now()));
    return drain();
  };
  let authClient=null,authUrl=null,authKey=null;
  function makeClient(url,key) {
    if(authClient && authUrl===url && authKey===key)return authClient;
    if(typeof supabase==='undefined')throw new Error('Cloud library unavailable. Check your connection.');
    if(authClient && authClient!==client)authClient.auth.stopAutoRefresh?.();
    authUrl=url;authKey=key;
    authClient=supabase.createClient(url,key,{auth:{storage:authStorage,persistSession:true,autoRefreshToken:true}});
    return authClient;
  }
  async function hydrate() {
    loading=true; readReady=false;
    const before=JSON.stringify(window._sbGetData()), startRevision=revision;
    try {
      const {data:row,error}=await client.from(window._SB_TABLE).select('data').eq('user_id',user.id).maybeSingle();
      if(error)throw error;
      if(pending || revision!==startRevision || before!==JSON.stringify(window._sbGetData())) {
        markPending(true);
      } else if(row) {
        window._sbPaused=true;
        try { if(window._sbOnLoad(row.data)===false)throw new Error('Invalid cloud data; local data retained'); }
        finally { window._sbPaused=false; }
        indicator('Loaded from cloud','#5a9e7a');
      } else { markPending(true); }
      readReady=true;
      setStatus('Connected!'); wrap.style.display='none';
    } catch(error) {
      readReady=false;
      setStatus('Cloud read failed: '+error.message,true); indicator('Cloud read failed','#c0392b');
      // A failed read is never an empty remote library. Retry the read before writing.
      if(!retry)retry=setTimeout(()=>{retry=null;if(client&&user)hydrate();},5000);
      return;
    } finally { loading=false; }
    await drain();
  }
  function updatePasswordField() { el('pass_in').style.display=user?'none':''; }
  const subscribedClients=new WeakSet();
  function subscribe(owner) {
    if(subscribedClients.has(owner))return;
    subscribedClients.add(owner);
    owner.auth.onAuthStateChange?.((event,session) => {
      if(owner!==client)return;
      user=session?.user||null;
      updatePasswordField();
      if(!user)indicator('Not connected','#4a4440');
    });
  }
  async function restore() {
    const url=get('_sb_url'), key=get('_sb_key');
    if(!url||!key)return false;
    try {
      const owner=makeClient(url,key);
      const {data,error}=await owner.auth.getSession();
      if(error||!data?.session?.user)return false;
      if(client&&client!==owner)client.auth.stopAutoRefresh?.();
      client=owner;user=data.session.user;subscribe(owner);updatePasswordField();
      await hydrate();return true;
    } catch(error) { setStatus(error.message,true); return false; }
  }
  window._sbForceSync=async () => {
    if(!client||!user){await restore();return;}
    if(retry){clearTimeout(retry);retry=null;}
    await hydrate();
  };
  function openPanel() {
    remove('_sb_dismissed');wrap.style.display='block';form.style.display='flex';
    for(const key of ['url','key','email'])el(key+'_in').value=get('_sb_'+key)||'';
    el('pass_in').value='';updatePasswordField();
    el('copy_cfg').style.display=get('_sb_url')&&get('_sb_key')?'inline-flex':'none';
  }
  window._sbOpenPanel=openPanel;
  el('connect_btn').onclick=openPanel;
  el('dismiss_btn').onclick=()=>{put('_sb_dismissed','1');wrap.style.display='none';};
  el('email_in').addEventListener('input',()=>{el('pass_in').style.display='';});
  el('save_btn').onclick=async () => {
    if(connecting)return;
    const url=el('url_in').value.trim(),key=el('key_in').value.trim(),email=el('email_in').value.trim(),password=el('pass_in').value;
    if(!url||!key||!email){setStatus('Fill in URL, key and email.',true);return;}
    connecting=true;el('save_btn').disabled=true;loading=true;
    try {
      const owner=makeClient(url,key);
      let {data,error}=await owner.auth.getSession();
      let session=data?.session;
      if(error || !session || session.user?.email?.toLowerCase()!==email.toLowerCase()) {
        if(!password)throw new Error('Enter the password for this account.');
        ({data,error}=await owner.auth.signInWithPassword({email,password}));
        if(error)throw error;
        session=data.session || (data.user ? {user:data.user} : null);
      }
      if(!session?.user)throw new Error('Authentication returned no user');
      if(client&&client!==owner)client.auth.stopAutoRefresh?.();
      client=owner;user=session.user;subscribe(owner);
      for(const [field,value] of Object.entries({url,key,email}))put('_sb_'+field,value);
      el('pass_in').value='';remove('_sb_pass');updatePasswordField();
      await hydrate();
    } catch(error) {setStatus('Error: '+error.message,true);}
    finally {loading=false;connecting=false;el('save_btn').disabled=false;}
  };
  function parseConfig(text) {
    let config;
    try { config=JSON.parse(text); } catch { config={}; text.replace(/^([\w]+)\s*[=:]\s*(.+)$/gm,(_,key,value)=>{config[key]=value.trim().replace(/^['"]|['"]$/g,'');}); }
    if(!config || typeof config!=='object')return {};
    const entries=Object.entries(config);
    const unsafe=(key,value)=>/service[_-]?role|secret/i.test(key)||/^sb_secret_/i.test(String(value));
    const safeText=entries.reduce((remaining,[key,value])=>unsafe(key,value)?remaining.split(String(value)).join(''):remaining,text);
    const pick=pattern=>entries.find(([key,value])=>!unsafe(key,value)&&pattern.test(key))?.[1];
    return {url:pick(/url/i)||text.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0],key:pick(/anon|publishable|public|key/i)||safeText.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+/)?.[0],email:pick(/email|mail/i)||text.match(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]};
  }
  el('paste_toggle').onclick=()=>{const row=el('paste_row');const open=row.style.display==='block';row.style.display=open?'none':'block';el('paste_toggle').textContent=open?'Paste config':'Hide paste';if(!open)el('paste_area').focus();};
  function applyPaste() {
    const config=parseConfig(el('paste_area').value);
    for(const key of ['url','key','email'])if(config[key])el(key+'_in').value=String(config[key]);
    setStatus('Config filled. Enter your password to connect.');
  }
  el('paste_area').addEventListener('input',applyPaste);
  el('paste_area').addEventListener('paste',()=>setTimeout(applyPaste,0));
  el('copy_cfg').onclick=async () => {
    const snippet=['URL','ANON_KEY','EMAIL'].map(key=>`SUPABASE_${key}=${get('_sb_'+(key==='ANON_KEY'?'key':key.toLowerCase()))||''}`).join('\n');
    try {await navigator.clipboard.writeText(snippet);el('copy_cfg').textContent='Copied ✓';}
    catch {window.prompt('Copy this config:',snippet);}
  };
  document.addEventListener('visibilitychange',()=>{if(pending)drain();});
  window.addEventListener('online',()=>{if(pending)window._sbForceSync();});
  (async()=>{
    if(!await restore()) {
      loading=false;indicator('Not connected — tap to set up','#4a4440');
      if(!get('_sb_dismissed'))wrap.style.display='block';
    }
  })();
})();
