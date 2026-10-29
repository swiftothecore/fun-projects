# Watchlist bug hunt — 29 October 2026

37 fixes, covered by 40 isolated browser regressions in `tests/bughunt.cjs`.
Related failures share one entry below: startup recovery has three cases, and HTML cache invalidation has two. Every one of the 40 cases failed against a saved copy of the original app and passes against the repaired app.

| # | Reproduction and original failure | Repair | Regression case |
| --- | --- | --- | --- |
| 1 | Load malformed JSON, an object in place of a movie list, or null category settings: startup crashes. | Parse persisted data defensively and validate its shape before use. | 01–03 |
| 2 | Receive legacy cloud data while Christmas mode is active: the normal list changes only in storage, then later saves overwrite it. | Hydrate the normal list in memory regardless of the active mode. | 04 |
| 3 | Receive an object instead of a cloud movie array: valid local state is replaced and rendering crashes. | Validate the entire incoming payload before changing either list. | 05 |
| 4 | Hydrate cloud data with old undo/redo snapshots still present: undo can replace the cloud list with obsolete data. | Invalidate snapshots and selection when remote data changes. | 06 |
| 5 | Save before the async cloud SDK is ready: no pending marker survives a reload. | Persist pending state in the local save path. | 07 |
| 6 | Name a category `__proto__` or `constructor`: it disappears from category enumeration. | Use dictionaries without inherited properties. | 08 |
| 7 | Sort a collection called `__proto__`: its anchor is not a sortable timestamp. | Use dictionaries without inherited properties for collection anchors. | 09 |
| 8 | Detach a category called `__proto__`: unrelated categories inherit the detached flag. | Store category settings in a dictionary without a prototype. | 10 |
| 9 | Search or filter by companion inside a category: the category ignores those filters. | Apply the shared filter pipeline to category results. | 11 |
| 10 | Reconcile cards or visit categories, then restore earlier content: stale HTML cache entries skip the required redraw. | Invalidate reconciliation caches and route category writes through the shared setter. | 12–13 |
| 11 | Reorder cards while more than one card changes: changed cards can remain in the previous order. | Insert replacements at the reconciliation cursor. | 14 |
| 12 | Redraw while bulk selection is active: selection styling and the selection-mode class disappear. | Reapply selection after every render and prune deleted IDs. | 15 |
| 13 | Choose bulk VPN availability, then switch the service to Cinema: the hidden VPN checkbox makes Cinema VPN-only. | Ignore VPN state for Cinema and Clear. | 16 |
| 14 | Bulk-mark a graveyard film watched: it remains buried and hidden. | Clear graveyard status when marking it watched. | 17 |
| 15 | Bulk-add a coming-to-cinemas film to Watching Soon: both conflicting statuses remain set. | Clear the coming-to-cinemas flag, matching the individual action. | 18 |
| 16 | Move a film into a list already containing its ID: duplicate IDs break keyed rendering and selection. | Skip identical copies; preserve conflicting edits under a fresh ID. | 19 |
| 17 | Undo, add a new film, then redo: redo can discard the new film. | Invalidate redo on data mutations while preserving undo/redo traversal and metadata fills. | 20 |
| 18 | Clear a film's release date and save: the old value silently returns. | Treat the cleared field as an intentional removal. | 21 |
| 19 | Mark a graveyard film watched in its edit form: it stays hidden in the graveyard. | Reconcile graveyard status with the form's watched/soon choices. | 22 |
| 20 | Enter a negative runtime: a negative duration is persisted. | Only persist positive runtimes. | 23 |
| 21 | Type a new search while the earlier request is running: the old response can appear during the debounce interval. | Invalidate requests immediately on input. | 24 |
| 22 | Select two search results quickly: slower details from the first selection overwrite the second. | Give each selection a sequence token. | 25 |
| 23 | Close a form during a details request, then open another: the old response overwrites the new form. | Invalidate search and selection tokens when the form resets or closes. | 26 |
| 24 | Import a diary row with an invalid watched date: date conversion throws and the modal stays permanently busy. | Validate diary calendar dates and fall back to the existing undated-entry behavior. | 27 |
| 25 | Import a quoted multiline CSV title: it splits into multiple records and shifts the columns. | Split CSV records only outside quoted fields. | 28 |
| 26 | Import diary films with TMDB metadata: release dates are discarded. | Preserve the fetched release date. | 29 |
| 27 | Close the categorisation modal, then press Undo: its hidden listener still changes a film's service. | Require the open categorisation panel and respect text editing/redo shortcuts. | 30 |
| 28 | Return from paste review to input: all typed titles disappear. | Retain the original input through the review flow. | 31 |
| 29 | Close a paste import during an alternative search and start another: the old response changes the new review item. | Check the paste session and item identity before applying results. | 32 |
| 30 | Load a blank Rotten Tomatoes score with an invalid checked timestamp: it is never retried. | Treat invalid timestamps as needing a retry. | 33 |
| 31 | Switch lists during a runtime backfill: the original list's runtimes are not persisted. | Capture and save the backfill's owning list. | 34 |
| 32 | Switch lists during an RT backfill: the new scores are changed only in memory. | Persist the original list even when it is inactive. | 35 |
| 33 | Render a film with an invalid added/watched timestamp in list view: date formatting crashes. | Display the existing unknown-date label for invalid dates. | 36 |
| 34 | View a film with a score but no other metadata in list view: its score disappears. | Render the metadata line when either score exists. | 37 |
| 35 | Search on mobile and resize to desktop, or vice versa: the visible search input disagrees with the actual filter. | Synchronize both search inputs and their active state. | 38 |
| 36 | Switch normal/Christmas lists with bulk selection or a companion filter active: stale state selects unrelated IDs or hides the new list. | Reset list-specific UI state and close old forms when switching. | 39 |
| 37 | Open Add twice and close it once: the page remains scroll-locked. | Make repeated modal opening idempotent. | 40 |

## Verification

Run with an existing Playwright installation (same setup as `REFACTOR.md`):

```sh
WATCHLIST_PLAYWRIGHT_PATH=/path/to/playwright node my-watchlist/tests/bughunt.cjs
WATCHLIST_PLAYWRIGHT_PATH=/path/to/playwright node my-watchlist/tests/regression.cjs
```

Optional `WATCHLIST_APP_ROOT=/path/to/original-watchlist` runs the new tests against a pre-fix snapshot. `WATCHLIST_BROWSER` overrides the default Brave executable. The new suite uses isolated fixture storage and intercepts all network requests; it never reads the user's browser profile or contacts a live API/cloud account.

The existing suite also passes, including search/add/edit/delete/undo/redo, CSV import/export, paste import, bulk moves, Christmas separation, storage restrictions, hostile strings, mobile behavior, and the real pinned Supabase SDK against simulated HTTP responses. Desktop and 390px mobile screenshots were captured for visual inspection. Live TMDB/OMDb/Supabase credentials and native iPhone Safari remain outside this automated verification.

## Follow-up bug hunt — 30 October 2026

All changes in this pass are confined to `my-watchlist`. Three subagents handled independent import, form/API, and UI/rendering fixes; the parent handled cloud sync and integrated verification. Peer review checked each area before the final combined run.

The new suites contain 48 focused regression cases. Forty-seven reproduce failures in the pre-fix app; the remaining case guards cross-tab authentication behavior while fixing blocked-storage fallback.

| Suite | Cases | Repaired behavior |
| --- | --- | --- |
| `tests/forms-api-bugs.cjs` | 11 | Selecting a movie cancels pending searches and clears the spinner; a new query cancels older details. Failed optional alias/credits requests preserve useful results, and failed TMDB external-ID lookup still permits OMDb title lookup. Replacing a movie refreshes its automatic synopsis while preserving custom notes and updates the edit form's Letterboxd link. Watching Soon clears conflicting cinema status; repeated Surprise Me opening releases its scroll lock correctly. |
| `tests/imports-bugs.cjs` | 15 | Export opening is idempotent. Categorisation and undo refresh the main cards, and undo cannot leak across categorisation sessions. CSV reads respect file selection, modal session, and returning to the selection step. Newer alternative searches win; unmatched titles can be corrected; closed review panels cannot consume navigation keys. Diary updates preserve release dates and finish rewatch plans. Optional credits/alias failures preserve usable diary and paste metadata. |
| `tests/render-ui-bugs.cjs` | 11 | Desktop Escape clears mobile search too. Uppercase shifted redo works. Enter activates the focused modal control without triggering Save or Watched. Search shortcuts respect modal focus and choose the visible mobile input. Repeated bulk selection retains selected films. Grid and list search use the selected sort within equal relevance tiers. |
| `tests/storage-bugs.cjs` | 11 | Cloud writes are serialized and coalesced; older saves cannot clear newer pending edits. Manual reconnect honors unsynced changes and edits made during its fetch. Failed reads retry without treating failure as an empty cloud list; restored sessions upload when no row exists. Changing email authenticates the requested account. Failed auth storage writes/removals use memory without hiding successful token changes or sign-out from another tab. |

The storage suite runs with plain Node.js and deterministic DOM/storage/Supabase fixtures:

```sh
node my-watchlist/tests/storage-bugs.cjs
```

The other three new suites use the same `WATCHLIST_PLAYWRIGHT_PATH`, `WATCHLIST_BROWSER`, and optional pre-fix `WATCHLIST_APP_ROOT` setup as `tests/bughunt.cjs`. The existing 40-case bughunt suite and the full functional suite, including the actual pinned Supabase SDK against simulated HTTP responses, are also run after integration. No test accesses personal browser storage or a live API/cloud account.
