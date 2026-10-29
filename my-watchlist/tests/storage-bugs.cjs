/* Deterministic cloud-sync regressions. Uses isolated in-memory storage, DOM,
 * timers and Supabase fixtures; no browser, account or network is accessed.
 * WATCHLIST_APP_ROOT can point to a pre-fix app to verify each reproduction.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.WATCHLIST_APP_ROOT || path.resolve(__dirname, '..');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const copy = (data) => JSON.parse(JSON.stringify(data));
const film = { id: 'local', title: 'Local film', streaming: {} };
const user = { id: 'fixture-user', email: 'test@example.com' };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
function makeApp({ connected = true, pending = false, read } = {}) {
  const storage = new Map(
    Object.entries({
      watchlist_v2: JSON.stringify([film]),
      _sb_url: 'https://fixture.invalid',
      _sb_key: 'fixture-key',
      _sb_email: user.email,
      ...(pending ? { _sb_pending: '1' } : {}),
    })
  );
  const elements = new Map();
  const timers = [];
  const writes = [];
  const signins = [];
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: '',
        style: {},
        title: '',
        textContent: '',
        className: '',
        addEventListener() {},
        querySelector() {
          return null;
        },
        appendChild() {},
      });
    return elements.get(id);
  };
  let authStore;
  const client = {
    auth: {
      async getSession() {
        return { data: { session: connected ? { user } : null } };
      },
      async signInWithPassword(credentials) {
        signins.push(credentials);
        return { data: { user: { ...user, email: credentials.email } } };
      },
      stopAutoRefresh() {},
    },
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return read ? read() : Promise.resolve({ data: { data: { watchlist: [copy(film)] } } });
        },
        upsert(row) {
          const completion = deferred();
          writes.push({ row: copy(row), completion });
          return completion.promise;
        },
      };
    },
  };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: element,
      createElement: () => element('created'),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    navigator: {},
    setTimeout: (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout() {},
    setInterval: (fn, delay) => {
      timers.push({ fn, delay, interval: true });
      return timers.length;
    },
    supabase: {
      createClient(url, key, options) {
        authStore = options.auth.storage;
        return client;
      },
    },
    render() {},
    scheduleBackfills() {},
    exitSelectMode() {},
    closeDetail() {},
    closeAddModal() {},
    dismissToast() {},
  });
  context.window = context;
  context.scrollTo = () => {};
  for (const name of ['storage-sync.js', 'state.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
  }
  const run = (code) => vm.runInContext(code, context);
  return {
    context,
    storage,
    timers,
    writes,
    signins,
    element,
    run,
    authStore: () => authStore,
    start: () => run('_sbRun()'),
    edit(title) {
      run(`state.movies[0].title = ${JSON.stringify(title)}; save();`);
    },
    async connect(email = user.email) {
      element('_sb_url_in').value = 'https://fixture.invalid';
      element('_sb_key_in').value = 'fixture-key';
      element('_sb_email_in').value = email;
      element('_sb_pass_in').value = 'fixture-password';
      return element('_sb_save_btn').onclick();
    },
  };
}

test('cloud writes are serialized and queued saves use the newest state', async () => {
  const app = makeApp();
  await app.start();
  app.edit('First edit');
  await settle();
  app.edit('Second edit');
  await settle();
  assert.equal(app.writes.length, 1, 'only one cloud request may be in flight');
  app.writes[0].completion.resolve({});
  await settle();
  assert.equal(app.writes.length, 2);
  assert.equal(app.writes[1].row.data.watchlist[0].title, 'Second edit');
  app.writes[1].completion.resolve({});
  await settle();
  assert.equal(app.storage.has('_sb_pending'), false);
});

test('an older save cannot clear the pending marker for a newer edit', async () => {
  const app = makeApp();
  await app.start();
  app.edit('First edit');
  await settle();
  app.edit('Second edit');
  app.writes[0].completion.resolve({});
  await settle();
  assert.equal(app.storage.get('_sb_pending'), '1');
  app.writes[1].completion.resolve({});
  await settle();
  assert.equal(app.storage.has('_sb_pending'), false);
});

test('manual reconnect preserves pending local edits over older cloud data', async () => {
  const app = makeApp({ connected: false, pending: true });
  await app.start();
  app.run('state.movies[0].title = "Unsynced local edit"');
  const connection = app.connect();
  await settle();
  assert.equal(app.run('state.movies[0].title'), 'Unsynced local edit');
  assert.equal(app.writes.length, 1);
  app.writes[0].completion.resolve({});
  await connection;
});

test('edits made during a manual cloud pull survive its stale response', async () => {
  const pull = deferred();
  const app = makeApp({ connected: false, read: () => pull.promise });
  await app.start();
  const connection = app.connect();
  await settle();
  app.edit('Edited while loading');
  await settle();
  app.writes[0].completion.resolve({});
  await settle();
  pull.resolve({ data: { data: { watchlist: [film] } } });
  await settle();
  assert.equal(app.run('state.movies[0].title'), 'Edited while loading');
  for (const write of app.writes) write.completion.resolve({});
  await connection;
});

test('failed initial cloud reads never overwrite a possibly existing remote row', async () => {
  const app = makeApp({ connected: false, read: async () => ({ error: { message: 'Offline' } }) });
  await app.start();
  const connection = app.connect();
  await settle();
  assert.equal(app.writes.length, 0, 'a read error is not an empty remote watchlist');
  await connection;
  assert.match(app.element('_sb_status').textContent, /Could not load/);
});

test('a thrown startup read error retains cloud retries', async () => {
  const app = makeApp({
    read: async () => {
      throw new Error('Offline');
    },
  });
  await assert.doesNotReject(app.start());
  assert(app.timers.some((timer) => timer.interval && timer.delay === 5000));
  assert(app.timers.some((timer) => !timer.interval && timer.delay === 5000));
});

test('a restored session uploads local data when no cloud row exists', async () => {
  const app = makeApp({ read: async () => ({ data: null }) });
  const startup = app.start();
  await settle();
  assert.equal(app.writes.length, 1);
  app.writes[0].completion.resolve({});
  await startup;
});

test('changing the configured email authenticates the requested account', async () => {
  const app = makeApp();
  await app.start();
  await app.connect('another@example.com');
  assert.equal(app.signins.length, 1);
  assert.equal(app.signins[0].email, 'another@example.com');
});

test('updated in-memory auth values take precedence when storage writes fail', async () => {
  const app = makeApp();
  await app.start();
  app.storage.set('auth-fixture', 'stale-token');
  app.context.localStorage.setItem = () => {
    throw new Error('Storage full');
  };
  app.authStore().setItem('auth-fixture', 'refreshed-token');
  assert.equal(app.authStore().getItem('auth-fixture'), 'refreshed-token');
});

test('removed auth values cannot reappear when storage removal fails', async () => {
  const app = makeApp();
  await app.start();
  app.storage.set('auth-fixture', 'removed-token');
  app.context.localStorage.removeItem = () => {
    throw new Error('Storage blocked');
  };
  app.authStore().removeItem('auth-fixture');
  assert.equal(app.authStore().getItem('auth-fixture'), null);
});

test('persisted auth values still observe token changes and sign-out in another tab', async () => {
  const app = makeApp();
  await app.start();
  app.authStore().setItem('auth-fixture', 'first-token');
  app.storage.set('auth-fixture', 'other-tab-token');
  assert.equal(app.authStore().getItem('auth-fixture'), 'other-tab-token');
  app.storage.delete('auth-fixture');
  assert.equal(app.authStore().getItem('auth-fixture'), null);
});

(async () => {
  let failures = 0;
  for (const { name, run } of tests) {
    try {
      await run();
      console.log('PASS ' + name);
    } catch (error) {
      failures++;
      console.error('FAIL ' + name + ' — ' + error.message);
    }
  }
  console.log(`${tests.length - failures}/${tests.length} storage regressions passed`);
  if (failures) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
