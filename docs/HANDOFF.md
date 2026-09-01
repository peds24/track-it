# Track It — session handoff

**Last updated:** 31 August 2026

Where the project stands, what is unmerged, and what bit us — so the next
session does not rediscover any of it. Everything below the previous
"14 August 2026" version was superseded by a lot happening since: a full
Material 3 redesign landed on `main`, diverged hard from a parallel feature
branch, and the two were reconciled this session. Treat this version as the
sole source of truth going forward.

## Branch state

`main` is at commit `ab38af6`, pushed. It now holds, merged and reconciled:

- The **Material 3 redesign** (`feat/m3-ui-rehaul`, fast-forwarded into
  `main`): new `src/ui/theme.ts` token system (`primary`/`onSurface`/
  `surfaceContainer*`, Google Sans, Ionicons throughout), rebuilt tab bar,
  swipe gestures, category grouping. This is the **current** visual system —
  see the caveat about `docs/design/design-language.html` below.
- Everything from the now-merged `worktree-completed-series-autofill`
  branch: A13–A17 (paused-series segmented bar, comics split into Single
  Issue/Metron vs. Collection/Google Books, tap-and-hold title rename,
  comic collections tracking as standalone items, and a real confirm
  screen — title/meta/blurb/primary-action-label — before any match is
  saved).
- **A18/A19/A20** (this session): the position-editor gesture (previously
  mis-numbered A12 on this branch — see the design spec's own note at that
  entry) now also works on a **paused Backlog row** (A19), not just
  Currently, and on an **ongoing series** with real progress (A20), not
  just a finite one — `app/(tabs)/backlog.tsx` gained the same
  `ProgressEditor` wiring `app/(tabs)/index.tsx` already had;
  `SwipeableTrackRow`'s swipe-edit gate now imports `TrackRow.canEditPosition`
  instead of duplicating a looser copy of it; `TrackSummary` gained
  `entryCount`/`nextEntryOrdinal` so the editor has something to bound and
  seed itself against for an ongoing series, which reports no `progress` at
  all (A4).
- **A21** (this session): Currently's category sections are now collapsible
  — tap a section header (Shows/Movies/Books/Comics/Manga) to fold it away.
  Also retroactively documents that category grouping itself was a D12
  reversal that shipped during the M3 rework without ever being recorded —
  same class of gap as the duplicate "A12," fixed the same way: written up
  now rather than left silent. Grouping logic moved out of
  `app/(tabs)/index.tsx` into a new pure, tested module,
  `src/ui/currentlySections.ts`. Collapse state is **not persisted** —
  session-only, resets to all-expanded on remount — a deliberate scope cut,
  not an oversight; see A21's own "Rejected" note if that turns out to
  matter enough to revisit.
- Cross-agent coordination protocol added to `CLAUDE.md` (new file) and
  `AGENTS.md`/`GEMINI.md` (kept identical, as they were before): branch
  naming as ownership signal, splitting work by feature area, and this
  document's own read-before-write / write-before-handoff habit — written
  directly in response to how expensive the M3-vs-feature-branch merge was.

All of `feat/2-one-tap-advance`, `feat/2-ongoing-series`,
`feat/2-track-actions`, `fix/3-*`, `fix/4-*`, and
`worktree-completed-series-autofill` are now fully absorbed into `main` and
safe to delete. **Not yet cleaned up** — nobody has run `git branch -d` on
them this session; do that as routine hygiene, not urgently.

## Where the decisions live

- `docs/superpowers/specs/2026-08-12-track-it-design.md` — **D1–D12 plus
  amendments A1–A21.** Numbering is now clean and sequential; it briefly
  wasn't — the M3 branch and the feature branch each independently used
  "A12" for a different amendment, and a clean git merge (no textual
  conflict, since the two additions landed in different parts of the file)
  silently produced a duplicate. Fixed this session: the position-editor
  amendment was renumbered A18 and physically relocated into sequence; both
  affected entries carry forward/back pointers explaining the rename. If
  you're hunting for something by an old "A12" reference in your head and
  it's the position editor, it's A18 now.
- `docs/superpowers/plans/2026-08-12-track-it-v1.md` — the original v1 plan.
- `docs/design/design-language.html` — **stale.** Last touched by the
  e-ink/monochrome design pass (`da70f00` and earlier); nothing in the M3
  rework touched it. It documents a design system `main` no longer uses
  (no colour, monospace face, e-ink panel tint) — don't trust it for
  anything currently on screen. `docs/design/material-3-spec.html` exists
  alongside it and is presumably the current reference, but this session
  didn't audit it for accuracy either; worth a real check before leaning on
  it hard.
- `docs/index.html` — the landing page. Publishes to the separate orphan
  `gh-pages` branch, not from `main`'s `docs/` folder — pushing to `main`
  alone does not update the live site. Reflog shows a `gh-pages` publish
  happened during the M3 work (`aa4a4d3`, `0bf712c`), so it's likely current
  as of the redesign, but that predates this session and wasn't re-verified
  here.

## What's unverified

Five separate things landed without a real device/screen check this
session — same failure mode this project has hit before (see gotchas
below), so don't assume any of them are right just because tests and `tsc`
are clean:

1. **`app/add.tsx`'s new comic-mode picker and confirm screen.** Rewritten
   from scratch this session to reconcile the M3 visual layer with the
   feature branch's comic Single Issue/Collection step and confirm-screen
   behavior — hand-styled, never opened in a running app.
2. **The A19 backlog edit gesture.** Component-level tests
   (`TrackRow.test.tsx`, `SwipeableTrackRow.test.tsx`) cover the gating
   logic, but the actual swipe/long-press interaction on a real paused
   Backlog row hasn't been tried on a device or simulator.
3. **The A20 ongoing-series edit gesture**, same caveat as A19 — component
   and repo-level tests cover the gating and the rewind/re-advance data
   path, but nobody has actually swiped or held on a real ongoing show,
   comic, or manga row on a device. Worth specifically checking the case
   the amendment was written for: rewind an ongoing series a few units,
   then advance forward again, and confirm no duplicate entries appear.
4. **The A21 collapsible section headers.** The extracted grouping/filter
   logic (`currentlySections.ts`) is unit-tested directly, but the actual
   tap target, chevron rotation, and how a collapse/expand feels alongside
   `SectionList`'s own scroll behavior haven't been tried on a device.
5. **The retuned swipe-Edit order and Delete threshold.** The Edit pill's
   icon/label were swapped (label now nearest the screen edge, so it
   should read earlier in a left swipe) and `DELETE_THRESHOLD` moved
   175dp→230dp (`MAX_SWIPE_RIGHT` 260dp→320dp) — the second tuning pass on
   this exact gesture (see commit `4239d10` for the first). Both are pure
   feel changes with no way to verify "did this actually fix it" outside a
   real swipe on a real screen.

## Things that cost time once — do not relearn them

- **Node.** Machine default (v23.7.0) is outside RN 0.86's range. Always
  `source ~/.nvm/nvm.sh && nvm use 22` before any expo/npm/EAS command —
  this includes inside any script or subagent you dispatch; it does not
  inherit from your shell's rc files reliably in every context.
- **Tests do not catch rendering.** This has bitten the project multiple
  times (dark-mode `userInterfaceStyle`, a stretched `ScrollView`, a
  doubled tab-bar header) — always boot a real device/emulator before
  calling UI work done, not just `npm test`. See "What's unverified" above
  for the current instance of this.
- **react-native-gesture-handler does not work in Expo Go on this SDK.**
  Swipe actions use `PanResponder` instead (ships inside React Native
  itself) — see `src/ui/SwipeableTrackRow.tsx`.
- **App icons need a real build.** JS reload never shows a new `icon.png`
  or Android adaptive-icon layer — only a fresh EAS build or local
  `expo prebuild` will.
- **A native module (e.g. `expo-camera`) needs a new build, full stop.**
  If the installed dev-client/preview build predates the dependency, the
  feature using it silently doesn't work until a fresh EAS build ships.

## Open risks

1. **The provider/scanning feature set (search, barcode scanning, real
   Google Books/TMDB/Metron/AniList lookups) is still unverified against
   live data**, as far as this session can confirm — nothing here exercised
   a real network call or a physical barcode.
2. **`app/add.tsx` and the A19 gesture** — see "What's unverified" above.
3. **The app still has no backup path.** Export/import remains deferred
   past v1 (A3) — unrelated to this session's work, just still true.
4. **`docs/design/design-language.html` is stale and easy to trust by
   mistake** — see "Where the decisions live" above.

## Next steps, in order

1. Boot the app on a real device/emulator and check all five unverified
   items above: the new `add.tsx` screens (comic single/collection step,
   the confirm screen for every category), the A19 backlog edit gesture
   (swipe left, and long-press Resume, on a paused Backlog row), the A20
   ongoing-series edit gesture (same interactions, on an ongoing show/
   comic/manga row — including the rewind-then-re-advance sequence), A21's
   collapsible Currently sections (tap each category header, confirm the
   chevron and row count track correctly), and the retuned swipe-Edit
   order / Delete threshold (does "Edit" actually read earlier now, and
   does Delete finally feel deliberate rather than accidental).
2. Fix whatever that turns up.
3. Delete the now-fully-merged branches listed under "Branch state" once
   confident nothing on them is still needed.
4. Audit `docs/design/material-3-spec.html` against the actual running app
   and, if it holds up, retire or clearly mark `design-language.html` as
   historical so it stops being a trap for the next session.
5. Re-surface export/import (`src/data/backup.ts`, already built and
   tested) — still the single biggest gap between "what the app can do"
   and "what protects the user's data," per D6/A3.
