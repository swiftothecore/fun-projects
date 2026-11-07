# Fun projects bug fixes — 6 November 2026

104 distinct issues fixed, covered by 114 browser regressions. Every regression failed against the unchanged starting commit (`27cceb4`) and passes against the repaired source. Related failure paths share one issue below. Shared cloud defects are counted once even though the repair serves five apps. Earlier Watchlist bug hunts are excluded from this count.

The audit covered all 12 projects plus the home page. Fixes touch 11 projects, the home page, and the shared cloud module. Tech Acronyms passed the startup, layout and quiz-flow checks without requiring a change.

## Verification

- `tests/bug-regressions.cjs`: isolated browser tests, fixture local storage and mocked external responses; supports `FUN_PROJECTS_ROOT` to reproduce against a pre-fix checkout.
- `tests/smoke.cjs`: all 13 pages at 1280px and 390px; checks uncaught JavaScript errors, missing local assets and horizontal overflow. Exercises a Tech Acronyms question through the result screen.
- Existing Watchlist functional, bughunt and storage suites retained and run.
- Inline scripts parsed with `node --check`; `git diff --check` checked patch whitespace.
- Browser tests use fresh profiles and intercept external requests. They do not read personal browser data or contact live API/cloud accounts. Live service credentials, network/CDN behavior and native iOS Safari remain outside this verification. The existing functional suite's real-Supabase-SDK option was not enabled.

```sh
# Point these at your installed Playwright package and Chromium-compatible browser.
export PLAYWRIGHT_PATH=/absolute/path/to/playwright
export BROWSER_PATH=/absolute/path/to/browser
node tests/bug-regressions.cjs
node tests/smoke.cjs

# Reproduce against the initial source, without modifying this checkout:
git archive 27cceb4 | tar -x -C /path/to/empty/baseline
FUN_PROJECTS_ROOT=/path/to/empty/baseline node tests/bug-regressions.cjs

WATCHLIST_PLAYWRIGHT_PATH="$PLAYWRIGHT_PATH" WATCHLIST_SKIP_VISUAL=1 node my-watchlist/tests/regression.cjs
WATCHLIST_PLAYWRIGHT_PATH="$PLAYWRIGHT_PATH" node my-watchlist/tests/bughunt.cjs
node my-watchlist/tests/storage-bugs.cjs
```

`tests/verification.json` records the baseline and fixed outcome for each case. The cloud module keeps existing local storage keys, tables and payload formats. It deletes the obsolete plaintext `_sb_pass`; users with a valid SDK session reconnect automatically, and users without one enter their password again.

### Reverification — 7 November 2026

The documented fix set was already present in the working tree when this goal resumed. It was preserved and independently rechecked against a fresh archive of `27cceb4`: all 114 cases fail on the baseline and pass on the working tree. The 104 ledger entries cover every regression case exactly once.

All 26 page/viewport smoke checks pass. The existing Watchlist functional suite and all focused suites pass: bughunt 40/40, forms/API 11/11, imports 15/15, render/UI 11/11, and storage 15/15. The forms/API fixture now waits until the response body is requested before simulating a selection, replacing its assumption that two microtasks were enough. This test correction is excluded from the product bug count. All 38 inline scripts and JavaScript files parse, and `git diff --check` passes. The optional real Supabase SDK checks remain skipped.

## Issue ledger

The behavior column describes the repaired behavior and its reproduction trigger. Test case numbers refer to `tests/bug-regressions.cjs`.

| Issue | Area | Repaired behavior | Cases |
| --- | --- | --- | --- |
| 1 | reading-room | unavailable storage does not prevent book changes or theme changes | 001 |
| 2 | reading-room | malformed newest storage falls back to the valid legacy library | 002 |
| 3 | reading-room | invalid stored records are filtered before rendering | 003 |
| 4 | reading-room | reopening menus does not retain actions for earlier books | 004 |
| 5 | reading-room | edition responses cannot fill a different books cover menu | 005 |
| 6 | reading-room | ISO timestamps produce valid AEST dates and ages | 006 |
| 7 | reading-room | book years render as text | 007 |
| 8 | reading-room | undo removal cannot duplicate a book readded to another shelf | 008 |
| 9 | reading-room | adding a book invalidates removal redo | 009 |
| 10 | reading-room | cloud partial shelves clear deleted local shelves | 010 |
| 11 | reading-room | cloud replacement invalidates old removal history | 011 |
| 12 | reading-room | new search input immediately invalidates pending results | 012 |
| 13 | reading-room | dismissing search cancels pending debounce and hides spinner | 013 |
| 14 | reading-room | book cards render while cover downloads are pending | 014 |
| 15 | album-atlas | invalid saved library shape does not crash startup | 015 |
| 16 | album-atlas | invalid cover cache does not crash album rendering | 016 |
| 17 | album-atlas | invalid added date does not crash card rendering | 017 |
| 18 | album-atlas | album years render as text | 018 |
| 19 | album-atlas | shifted uppercase Z performs redo | 019 |
| 20 | album-atlas | arrow keys move the caret inside search text | 020 |
| 21 | album-atlas | cloud load invalidates obsolete undo snapshots | 021 |
| 22 | album-atlas | new input invalidates an older running search | 022 |
| 23 | album-atlas | resizing to mobile selects a supported list view | 023 |
| 24 | tv-reverie | corrupt saved JSON does not abort startup | 024 |
| 25 | tv-reverie | blocked storage still permits startup and saving | 025 |
| 26 | tv-reverie | new search input rejects older responses | 026 |
| 27 | tv-reverie | newer show selection wins over slower details; closed forms reject pending details; typing a query invalidates pending show selection | 027, 028, 029 |
| 28 | tv-reverie | selection cancels delayed search | 030 |
| 29 | tv-reverie | failed detail HTTP response preserves entered title | 031 |
| 30 | tv-reverie | selecting another show refreshes automatic synopsis | 032 |
| 31 | tv-reverie | editing a show clears another forms pending TMDB id | 033 |
| 32 | tv-reverie | clearing episode runtime intentionally removes old value | 034 |
| 33 | tv-reverie | negative episode counts are not persisted | 035 |
| 34 | tv-reverie | starting a dropped show restores it from graveyard; bulk watching restores graveyard shows; bulk finished restores graveyard shows | 036, 037, 038 |
| 35 | tv-reverie | bulk dropping clears watching and finished states | 039 |
| 36 | tv-reverie | invalid timestamps render unknown dates | 040 |
| 37 | tv-reverie | prototype-named categories are listed and detach independently | 041 |
| 38 | tv-reverie | quotes and backslashes in category handler arguments survive round trip | 042 |
| 39 | tv-reverie | punctuated show ids can open cards | 043 |
| 40 | tv-reverie | category results honor the text search | 044 |
| 41 | tv-reverie | repeated selection-mode activation keeps selected shows | 045 |
| 42 | tv-reverie | selection selectors handle punctuation in ids | 046 |
| 43 | tv-reverie | repeated Add opening releases scroll lock once | 047 |
| 44 | tv-reverie | direct Edit opening locks background scroll | 048 |
| 45 | tv-reverie | remote category settings are applied before render | 049 |
| 46 | tv-reverie | remote hydration clears obsolete undo and selection | 050 |
| 47 | tv-reverie | show metadata is escaped in cards and list rows | 051 |
| 48 | tv-reverie | Enter on focused Cancel does not save the show | 052 |
| 49 | tv-reverie | editing after a deletion invalidates snapshots that discard the edit | 053 |
| 50 | tv-reverie | closing an already closed form preserves another modals scroll lock | 054 |
| 51 | music-videos | corrupt cached JSON does not abort startup | 055 |
| 52 | music-videos | blocked storage permits editing artists | 056 |
| 53 | music-videos | latest channel search wins; closed channel searches cannot populate a reopened modal; typing during a channel request invalidates its results | 057, 058, 069 |
| 54 | music-videos | double adding an artist cannot create duplicate records | 059 |
| 55 | music-videos | refresh cannot resurrect videos for a removed artist | 060 |
| 56 | music-videos | removing the selected artist resets its filter and selection | 061 |
| 57 | music-videos | watch-filter changes prune now-hidden selected videos | 062 |
| 58 | music-videos | adding an overlapping playlist preserves watched entries | 063 |
| 59 | music-videos | artists added in the same millisecond have distinct ids | 064 |
| 60 | music-videos | failed refresh does not report all up to date | 065 |
| 61 | music-videos | incremental refresh includes new videos at the cutoff timestamp | 066 |
| 62 | music-videos | thumbnail fallback disables its failing error handler | 067 |
| 63 | music-videos | invalid cloud video payload leaves the entire library intact | 068 |
| 64 | shared cloud (5 apps) | obsolete plaintext passwords are deleted even without the SDK; manual sign-in never persists the entered password | 070, 073 |
| 65 | shared cloud (5 apps) | copied cloud configuration excludes passwords | 071 |
| 66 | shared cloud (5 apps) | persisted auth sessions restore without a stored password | 072 |
| 67 | shared cloud (5 apps) | cloud writes are serialized; an older completed write cannot clear newer pending changes | 074, 075 |
| 68 | shared cloud (5 apps) | manual reconnect preserves existing unsynced local edits | 076 |
| 69 | shared cloud (5 apps) | edits during initial cloud fetch win over remote data | 077 |
| 70 | shared cloud (5 apps) | a restored session with no cloud row uploads its local library | 078 |
| 71 | shared cloud (5 apps) | a failed cloud read never triggers an upload over unknown remote data | 079 |
| 72 | shared cloud (5 apps) | offline saves persist a pending marker without the SDK; cloud setup panel remains available after a CDN failure | 080, 085 |
| 73 | shared cloud (5 apps) | failed auth storage writes override stale persisted tokens | 081 |
| 74 | shared cloud (5 apps) | failed auth removal leaves a memory tombstone | 082 |
| 75 | shared cloud (5 apps) | pasting configuration never imports passwords into the form | 083 |
| 76 | shared cloud (5 apps) | copy config works through prompt when clipboard is unavailable | 084 |
| 77 | palette-painter | 8-digit colors are not silently truncated to six digits | 086 |
| 78 | palette-painter | unencoded SVG data URLs retain commas | 087 |
| 79 | palette-painter | saved filenames and preview attributes render as data | 088 |
| 80 | palette-painter | invalid gallery records cannot abort gallery rendering | 089 |
| 81 | palette-painter | invalid collection members do not crash gallery actions | 090 |
| 82 | palette-painter | saving with blocked storage retains the gallery for the session | 091 |
| 83 | palette-painter | deletion undo preserves palettes saved later; deletion undo preserves later renames of other palettes | 092, 093 |
| 84 | palette-painter | deletion undo restores favourite membership | 094 |
| 85 | palette-painter | deletion undo restores custom collection membership | 095 |
| 86 | palette-painter | reused collection cards act on updated palette data | 096 |
| 87 | palette-painter | undo loading a palette restores previous input text | 097 |
| 88 | palette-painter | invalid cloud payload is rejected atomically | 098 |
| 89 | palette-painter | remote gallery replacement invalidates local deletion history | 099 |
| 90 | my-watchlist | missing release dates are actually backfilled and persisted | 100 |
| 91 | thirteen | blocked theme storage does not prevent calendar startup | 101 |
| 92 | thirteen | arrow keys in the help modal do not change the selected year | 102 |
| 93 | sotr-countdown | bottom sunburst uses its own gradient | 103 |
| 94 | sotr-countdown | countdown initializes when canvas rendering is unavailable | 104 |
| 95 | petal-countdown | release state still renders without canvas rendering | 105 |
| 96 | petal-countdown | release message is stable after countdown finishes | 106 |
| 97 | olivia-countdown | reduced-motion setting stops decorative animation | 107 |
| 98 | project home | project navigation cards have accessible names | 108 |
| 99 | apple-music | screenshot failure restores original custom layout padding | 109 |
| 100 | apple-music | repeated screenshot activation starts only one capture | 110 |
| 101 | apple-music | repeated dark-side lyric starts cancel previous animation timer | 111 |
| 102 | apple-music | reduced-motion setting skips flashing transition overlays | 112 |
| 103 | palette-painter | ZIP entries remain unique when filenames already contain numbered suffixes | 113 |
| 104 | thirteen | year navigation fits a mobile viewport when web fonts fail | 114 |
