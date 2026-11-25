const showStorageKey = 'tvshows_v1';
const categoryStorageKey = 'category_settings_tvshows_v1';

function requestShowSync() {
  if (window._sbPaused) return;
  if (window._sbSyncNow) window._sbSyncNow();
  else tvStorageSet('_sb_pending_tvshows', '1');
}

function saveCategorySettings() {
  tvStorageSet(categoryStorageKey, JSON.stringify(categorySettings));
  requestShowSync();
}

function invalidateDeletionHistory() {
  undoStack = [];
  redoStack = [];
}
function save(preserveDeletionHistory = false) {
  if (!preserveDeletionHistory) invalidateDeletionHistory();
  tvStorageSet(showStorageKey, JSON.stringify(shows));
  requestShowSync();
}

function settingsObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeShowLibrary(data) {
  const payload = Array.isArray(data) ? { tvshows: data } : data;
  if (!validShows(payload?.tvshows)) return null;
  if (payload.categorySettings !== undefined && !settingsObject(payload.categorySettings)) return null;
  return {
    tvshows: payload.tvshows,
    ...(payload.categorySettings !== undefined ? { categorySettings: tvDictionary(payload.categorySettings) } : {}),
  };
}

function sameSyncValue(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameSyncValue(value, b[index]));
  }
  if (!settingsObject(a) || !settingsObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameSyncValue(a[key], b[key]));
}

function mergeSyncValue(base, local, remote) {
  if (sameSyncValue(local, remote) || sameSyncValue(base, remote)) return local;
  if (sameSyncValue(base, local)) return remote;
  if (!settingsObject(local) || !settingsObject(remote)) return local;
  const merged = Object.create(null);
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const value = mergeSyncValue(base && Object.hasOwn(base, key) ? base[key] : undefined,
      Object.hasOwn(local, key) ? local[key] : undefined,
      Object.hasOwn(remote, key) ? remote[key] : undefined);
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

const showStatusFields = ['watching', 'watched', 'watchStatus', 'graveyard', 'dateWatched'];

function mergeSavedShow(base, local, remote) {
  if (!local || !remote) {
    const remaining = local || remote;
    // A deletion wins unless the other device edited the same show.
    return sameSyncValue(base, remaining) ? undefined : remaining;
  }
  const status = show => Object.fromEntries(showStatusFields.filter(key => show && Object.hasOwn(show, key))
    .map(key => [key, show[key]]));
  const baseStatus = status(base);
  const localStatus = status(local);
  const remoteStatus = status(remote);
  const merged = { ...mergeSyncValue(base, local, remote) };
  const chosenStatus = sameSyncValue(localStatus, baseStatus) ? remoteStatus
    : !base && !Object.keys(localStatus).length ? remoteStatus : localStatus;
  for (const key of showStatusFields) delete merged[key];
  Object.assign(merged, chosenStatus);
  if (merged.watching || merged.graveyard) merged.watchSoon = false;
  return merged;
}

function mergeShowLibraries(base, local, remote) {
  const index = items => new Map((items || []).map(show => [show.id, show]));
  const previous = index(base?.tvshows);
  const left = index(local.tvshows);
  const right = index(remote.tvshows);
  const ids = new Set([...left.keys(), ...right.keys()]);
  return {
    tvshows: [...ids].map(id => mergeSavedShow(previous.get(id), left.get(id), right.get(id))).filter(Boolean),
    categorySettings: mergeSyncValue(base?.categorySettings, local.categorySettings, remote.categorySettings)
      ?? local.categorySettings ?? remote.categorySettings ?? {},
  };
}

window._SB_TABLE = 'tvshows';
window._SB_LS_KEY = showStorageKey;
window._sbGetData = () => ({ tvshows: shows, categorySettings });
window._sbMergeLibrary = { normalize: normalizeShowLibrary, merge: mergeShowLibraries, same: sameSyncValue };

window._sbOnLoad = function(data) {
  const incoming = normalizeShowLibrary(data);
  if (!incoming) return false;
  if (sameSyncValue(shows, incoming.tvshows) &&
      (incoming.categorySettings === undefined || sameSyncValue(categorySettings, incoming.categorySettings))) return true;

  const detailId = currentDetailId;
  closeBulkEdit();
  exitSelectMode(false);
  invalidateDeletionHistory();
  shows = incoming.tvshows;
  if (incoming.categorySettings !== undefined) categorySettings = incoming.categorySettings;
  tvStorageSet(showStorageKey, JSON.stringify(shows));
  tvStorageSet(categoryStorageKey, JSON.stringify(categorySettings));
  render();
  if (detailId) {
    if (shows.some(show => show.id === detailId)) openDetail(detailId);
    else closeDetail();
  }
  scheduleMetadata();
  return true;
};

// Start a fresh cloud session even if the CDN takes too long or fails to load.
try { localStorage.removeItem('_sb_pass'); } catch {}
