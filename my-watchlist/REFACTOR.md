# Watchlist refactor notes

The app remains static HTML/CSS/classic JavaScript. Serve this directory with any plain web server; no install or build is needed.

## Phase 1 — security

- Removed legacy `_sb_pass` on every load, including when the Supabase CDN fails. Passwords are typed once and never copied, parsed from config, or stored by the app. The SDK's existing persisted session restores and refreshes authentication on reload. The password field is hidden for an authenticated connection.
- Pinned the UMD SDK to `@supabase/supabase-js@2.118.0` and verified that the exact CDN URL is available.
- Audited generated HTML, attribute handlers, reconciliation, toasts, links, and API results. `esc()` also escapes apostrophes; `jsAttr()` serializes a JavaScript literal before escaping its HTML attribute. Selectors escape movie IDs with `CSS.escape()`.
- Verified in an isolated Chromium browser: search/add/edit/watched/delete/undo/redo, categories/search/views, Christmas list separation, paste import/undo, legacy and combined payload loading, 390px layout, and hostile strings in titles, notes, IDs, categories, collections, and companions. Tested sign-in, reload without another password request, expired-session refresh, and config copy/paste against the actual pinned SDK with simulated Supabase HTTP responses.
- Not verified against a live TMDB/OMDb account or the user's Supabase project; tests use fixtures and never access personal data. Native iOS Safari still needs a device check.

Manual checklist:

- [ ] Load a device with an old `_sb_pass`; confirm that key is deleted.
- [ ] Connect once, reload, then open Cloud Save; no password prompt for the valid session.
- [ ] On a fresh device, paste copied config; URL/key/email fill, and the password must be typed once.
- [ ] Use apostrophes, double quotes, ampersands, and backslashes in a title, category, collection, notes, and companion; select, edit, filter, and reopen them.
- [ ] Confirm normal and Christmas data, and existing cloud data, remain intact.

## Preserved code worth reviewing separately

- `backfillReleaseDates()` is an empty async function. All callers and progress styles are retained.
- `catEsc` and `soonAllowed` are calculated but unused.
- `sortOldestFirst()` appears unused. `collectionDateMap()` and the `cdMap` argument are retained; the existing comment explains that `sortWithCollections()` no longer uses the argument.
- `_sb_local_ts` is stamped by the existing save mechanism but the current conflict resolver does not read it. Conflict handling currently checks persisted pending state and snapshots before/after the initial fetch.
- `_pendingReleaseDate` is retained even though the form's release date is the source used when saving.

## Phase 2 — static file split

- `index.html` contains the existing markup and ordered classic script references. All CSS is in `styles.css`; there are no inline script blocks or ES modules. The small SVG noise image remains in CSS because it is not a large base64 asset.
- `state.js` holds shared declarations/helpers; `api.js` handles search and metadata; `render.js` builds/filter/sorts views; `modals.js` holds film forms and Surprise Me; `imports.js` handles both import formats and export; `christmas.js` handles Christmas mode/effects; `ui.js` contains controls, shortcuts, selection and gestures; `storage-sync.js` contains persistence/cloud logic; `bootstrap.js` starts the app after dependencies and markup exist.
- Confirmed every original executable JavaScript statement moved verbatim and all 322 JavaScript comments survived. The isolated browser regression suite and real-SDK auth checks passed after splitting.
- Live service and native iOS limitations from Phase 1 still apply.

Manual checklist:

- [ ] Serve the folder with a plain web server and confirm all CSS/JS requests succeed.
- [ ] Open Add, Detail, Surprise, Letterboxd import/export, Paste, Shortcuts, and Cloud Save.
- [ ] Use filters, sort, categories, grid/list/compact, bulk selection and keyboard shortcuts.
- [ ] At a width below 640px, confirm list view, bottom search and bottom-sheet modals.

## Phase 3 — state and persistence

- Mutable list, preference, history, form/search/import, selection and effect state now lives in documented `state`. `getNormalList()`/`getChristmasList()` always return their own list; the `state.movies` accessor reads/replaces the active list. Switching modes no longer swaps/stashes array globals.
- Removed the `localStorage.setItem` patch. `save()` explicitly writes the active list, both lists for bulk moves, or category settings, stamps `_sb_local_ts`, and immediately requests cloud sync. Remote hydration uses guarded mirror writes without timestamps or echoed uploads. Original keys, row/table format, legacy-array support, paused-load handling, two-second retry/five-second pending retry, and snapshot/pending conflict checks remain.
- All app storage reads/writes are guarded; the SDK's in-memory auth adapter is preserved. Startup, key entry, remote hydration and film-save backfill requests now join one sequential async queue, scheduled after rendering. The empty release-date backfill is still called in sequence.
- Extended browser tests passed for stable list ownership, serialized backfills, stale search responses, retryable TMDB/OMDb failures, native storage methods, timestamping, storage exceptions, failed upload retries, pending edits across reload, edits during the cloud fetch, and the real SDK's in-memory auth fallback.
- Live service and native iOS limitations from Phase 1 still apply.

Manual checklist:

- [ ] Add/edit/delete/undo in each list; switch modes repeatedly and reload in Christmas mode.
- [ ] Move films in both directions with bulk selection; confirm both stored lists and cloud payloads.
- [ ] Toggle detached categories and confirm their settings persist/sync.
- [ ] Save offline, reload, reconnect, and confirm pending local edits win over older cloud data.
- [ ] Enter API keys; confirm the first render is immediate and runtime/RT fills run sequentially.
- [ ] Check a storage-restricted iOS session can still edit and sync while open.
