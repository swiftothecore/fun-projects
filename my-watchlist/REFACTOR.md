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
