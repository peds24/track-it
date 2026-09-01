# DEVLOG

## 2026-08-31 — Material 3 Design System Migration

### What Changed
- Migrated the entire `track-it` design system and UI layer from an e-ink achromatic palette to authentic **Material Design 3 (M3 / Material You)**.
- **`src/ui/theme.ts`**:
  - Implemented semantic M3 color tokens with full Light & Dark tonal palettes (`primary`, `onPrimary`, `primaryContainer`, `onPrimaryContainer`, `secondary`, `secondaryContainer`, `tertiary`, `surface`, `surfaceVariant`, `surfaceContainerLowest` through `surfaceContainerHighest`, `outline`, `outlineVariant`, `error`, `errorContainer`).
  - Added 15-tier M3 typography scale across Display, Headline, Title, Body, and Label roles with system font resolution (`Roboto` on Android, SF Pro on iOS).
  - Defined M3 shape scale (`xs: 4`, `sm: 8`, `md: 12`, `lg: 16`, `xl: 28`, `full: 9999`) and elevation shadows (Levels 0–5).
- **Navigation Bar (`app/(tabs)/_layout.tsx`)**:
  - Transformed bottom navigation bar to M3 spec: `surfaceContainer` background, 72–84dp height, and active pill container in `secondaryContainer` with `onSecondaryContainer` label.
- **Filter Chips (`src/ui/FilterBar.tsx`)**:
  - Implemented standard 32dp M3 filter chips with `secondaryContainer` active state and `surfaceContainerLow` / `outlineVariant` inactive styling.
- **Track List Items (`src/ui/TrackRow.tsx` & `src/ui/SwipeableTrackRow.tsx`)**:
  - Styled track items with M3 title typography, category assist chip tags, full-radius M3 tonal advance buttons (`primaryContainer` / `onPrimaryContainer`), and continuous / segmented linear progress bars with rounded pill geometry (`radius.full`).
  - Updated swipe actions with M3 semantic containers (`secondaryContainer` for Pause / Reversible, `errorContainer` for Delete / Destructive).
- **Screens & Dialogs (`app/add.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/backlog.tsx`, `app/(tabs)/done.tsx`, `src/ui/ProgressEditor.tsx`)**:
  - Standardized Top App Bars with `headlineMedium` typography and filled tonal quick-add buttons.
  - Rebuilt Add screen with M3 category selection cards, 52dp outlined text fields with dynamic focus/cursor colors, and filled/outlined pill action buttons.
  - Restyled modals and ProgressEditor dialogs to M3 Dialog specification: `surfaceContainerHigh` container, `xl` (28dp) radius, Level 3 elevation, and filled primary Save actions.

### Design Decisions & Trade-offs
- **Semantic M3 Color Roles vs Fixed Hex**: Used standard M3 tonal roles rather than arbitrary hardcoded hexes to guarantee accessible contrast ratios across both Light and Dark modes.
- **Card Surfaces & Separation**: Maintained clean hairline dividers with `outlineVariant` for list rows on `surface` while using elevated `surfaceContainerLow` cards for empty states and category selectors to retain density on mobile screens.
- **Backward Compatibility**: Kept legacy palette property aliases (`bg`, `ink`, `muted`, `faint`, `rule`, `ruleStrong`, `chip`) mapped cleanly to their M3 equivalents, ensuring all 300 unit tests continue to pass without regressions.

### Design Refinements (Post-Review)
- **Google Sans Typography**: Standardized interface font stack on Google Sans across the entire 15-tier Material 3 typescale with system fallbacks.
- **Bottom Navigation Icons & Rounded Pill**: Added authentic Material 3 navigation items featuring vector icons (`play-circle`, `bookmark`, `checkmark-circle`) nested within a `60×32dp` rounded pill indicator (`radius.full`) in `secondaryContainer`, with labels positioned directly underneath.
- **Removed Emojis**: Removed all emoji glyphs from the category picker, barcode scan button, and ongoing series toggle in `app/add.tsx`, replacing them with clean vector icons and semantic typography.
- **Navigation Action**: Replaced `<Link asChild>` with direct `Pressable` + `useRouter().push('/add')` with a filled primary pill style (`elevation.level1`).
- **Row Advance Action**: Switched row advance (`Done`/`Start`/`Resume`) to an outlined pill button (`borderWidth: 1.5`, `borderColor: c.primary`) to visually separate it from the filled `+ Add` primary action.
- **Category Grouping on Currently**: Grouped tracks on the Currently screen by their categories following the Add page order (Shows -> Movies -> Books -> Comics -> Manga). Each group features a subtitle header with vector icon badges and count chips. Advancing an item (`Done`) dynamically bubbles that item to the top within its category group while retaining stable category section placement.
- **Medium Badge Cleanliness**: Kept row-level medium badges purely typographic (`SHOW`, `MOVIE`, `BOOK`, `COMIC`, `MANGA`) within a subtle `surfaceContainerHigh` badge for reduced visual noise alongside section icons.
- **Category Header Typography Hierarchy**: Scaled category section header titles to 19dp (`fontWeight: '700'`), establishing a clear typographic hierarchy between the screen title ("Currently" at 28dp) and item titles ("Severance" at 16dp).
- **Swipe Actions Redesign & Animations**:
  - **Direction-Isolated Backgrounds**: Added animated opacity masks separating left and right action containers to eliminate color bleed-through.
  - **Vector Icons & Semantic Labels**: Integrated Material vector icons (`pause-circle`, `bookmark`, `trash`, `create`) alongside bold labels for clear visual identification.
  - **Instant Quick Swipe Activation**: A quick right swipe past threshold (28dp) immediately pauses/returns the track to the backlog on release without requiring a manual tap.
  - **Left Swipe**: Quick swipe left opens the **Edit** progress editor dialog immediately.
  - **2-Step Right Swipe with Fluid Transition**: Quick drag (< 175dp) keeps Pause/Backlog active and clearly visible from early in the drag. A long, deep drag (>= 175dp) dynamically morphs the background (`secondaryContainer` $\rightarrow$ `errorContainer`), crossfades to Delete with a scale-up pop, and triggers the delete confirmation upon release.
- **Landing Page Redesign & Design Evolution Archive**:
  - Rebuilt `docs/index.html` with full Material 3 design tokens, Google Sans typography, light/dark mode support, and an interactive live mobile UI simulator.
  - Created `docs/design/material-3-spec.html` documenting official M3 color roles, typescales, elevations, and gesture physics.
  - Preserved the historical v1 Brutalist design language and landing page in `docs/archive/v1-brutalist/` with bi-directional links between active M3 docs and archived artifacts.

## 2026-08-31 — Merge Reconciliation, Position-Editing Extensions, and Currently-Screen Polish (Claude Code session)

### What Changed
- Finished an in-progress merge of `worktree-completed-series-autofill` into `main`, left half-resolved by an earlier session — `app/add.tsx` still had all 11 conflict hunks unresolved; `TrackRow.tsx` was already hand-resolved, `SwipeableTrackRow.tsx`/`TrackRow.test.tsx` had one hunk each left. Rewrote `app/add.tsx` to keep the Material 3 visual layer above while porting over the feature branch's comic Single Issue/Collection step, standalone-comic handling, and full confirm screen.
- Added a cross-agent coordination protocol to `CLAUDE.md` (new) and `AGENTS.md`/`GEMINI.md`: branch-naming-as-ownership, splitting work by feature area rather than by whichever agent is free, and a read-before-write/write-before-handoff habit around `docs/HANDOFF.md` and the design spec.
- **A18/A19** — the position editor (long-press the advance control, or swipe left) now works on a paused Backlog row, not just Currently. Unified `SwipeableTrackRow`'s own edit gate (previously looser, and unreachable in practice) onto `TrackRow.canEditPosition`.
- **A20** — the position editor now works on an ongoing series too. `TrackSummary` gained `entryCount`/`nextEntryOrdinal` so the editor has something to bound and seed itself against without a `progress.total`, which an ongoing series never reports (A4).
- **A21** — Currently's category sections are now collapsible: tap a header to fold it away, count badge stays visible. Extracted the section-grouping logic out of `app/(tabs)/index.tsx` into a new pure, unit-tested module, `src/ui/currentlySections.ts`.
- Reordered the swipe-Edit pill's children (icon, then label) so the word "Edit" — not just the icon — becomes visible with less swipe distance, since the rightmost child in the row is the one nearest the screen edge a left-swipe uncovers first.
- Retuned the right-swipe Delete threshold a second time: `DELETE_THRESHOLD` 175→230dp, `MAX_SWIPE_RIGHT` 260→320dp. Every visual breakpoint (background crossfade, Pause fade-out, Delete fade-in/scale-pop) is now expressed as an offset from the `DELETE_THRESHOLD` constant rather than a second, independently hand-tuned set of numbers.
- Fixed a duplicate "A12" in the design spec — the M3 branch and the feature branch had each independently used that number for a different amendment, and a textually-clean git merge let both survive. Renumbered the position-editor entry A18 and relocated it into sequence.

### Design Decisions & Trade-offs

*Why fix the duplicate "A12" now, mid-feature-work, instead of leaving it?*
This session was adding two more amendments (A19, A20) to the exact feature the misnumbered entry described. Leaving the collision in place would only make it worse for the next reader trying to follow the thread. Renumbered it A18 — the correct next-in-sequence slot — and left forward/back pointers at both entries so anyone still holding "A12" in their head from an older conversation can find where it went. Updated the handful of code comments (`trackRepo.ts`, `advance.ts`, `seasons.ts`, two test files) that cited the old number.

*Why did extending the position editor to ongoing series need no domain-layer changes?*
`domain/advance.ts`'s `setPosition` and `data/trackRepo.ts`'s `setTrackPosition` never actually checked `ongoing` — they only need the entries that already exist. `appendNextOngoingEntry`'s existing "only extend from the end" guard (written for an unrelated out-of-order-completion edge case) turns out to make rewind-then-re-advance safe for free: finishing a non-highest entry after a rewind reuses the next already-existing entry instead of appending a duplicate, and growth resumes only once the true highest entry is reached again. The entire block was in the UI layer — `canEditPosition` required `progress !== null`, and an ongoing series' `progress` is always `null` by design — so the fix stayed there too: two new `TrackSummary` fields, zero schema or domain changes. Proved this with two data-layer tests (`ongoing.test.ts`) rewinding and re-advancing a real ongoing series through the actual repo functions.

*Why not persist Currently's collapsed-section state?*
It's cosmetic UI preference, not domain data — persisting it would mean either `AsyncStorage` or a new preferences table for something `src/domain/` has no architectural reason to know about (D1's whole point). Nothing in the request implied it needed to survive an app restart, so it stayed as plain component state that resets on remount, rather than reaching for storage nobody asked for.

*Why 230dp/320dp for the Delete threshold, and not a smaller nudge?*
An earlier pass (commit `4239d10`) had already moved this once, from 130dp to 175dp, and it still read as transitioning too quickly. Rather than a marginal correction that might need a third pass just as soon, pushed by roughly the same proportion again (~+31% on the threshold, ~+23% on the max travel) and re-anchored every visual breakpoint as an explicit `DELETE_THRESHOLD`-relative offset instead of a second independently-tuned set of numbers — so the next retune, if the feel still isn't right, is a one-line constant change instead of re-deriving five interpolation ranges by hand.

### Architecture state after this session
```
main is fully reconciled: Material 3 visual system (src/ui/theme.ts) +
worktree-completed-series-autofill's feature work (A13-A17) — no more
diverging branches touching the same UI surface.

Position editing (A12/A18) now works on Currently, a paused Backlog row
(A19), and an ongoing series (A20) — all gated through the single
TrackRow.canEditPosition, shared by the long-press gesture and
SwipeableTrackRow's swipe action rather than two copies of the same rule.

Currently screen: grouped by category (A21 — retroactively documents a
previously-undocumented D12 reversal that shipped during the M3 rework),
each section collapsible, collapse state session-only. Grouping logic
lives in src/ui/currentlySections.ts: pure, unit-tested, no longer inline
screen glue.

Design spec (docs/superpowers/specs/2026-08-12-track-it-design.md): now
D1-D12 + A1-A21, sequential and duplicate-free.

Not yet verified on a real device this session: app/add.tsx's new
comic-mode/confirm screens, the A19/A20 edit gestures, and A21's collapsible
headers — see docs/HANDOFF.md's "What's unverified" for the full list.
```

## 2026-08-31 — Swipe Gesture Stabilization & Web Delete Alert Bridge

### What Changed
- **Cross-Platform Alert Bridge (`src/ui/alert.ts`)**:
  - React Native Web stubs `Alert.alert` as an empty function (`alert() {}`), silently dropping all delete confirmation dialogs and error alerts on Web/Safari PWA.
  - Implemented `showAlert(title, message, buttons, options)` bridging `window.confirm` / `window.alert` on Web while preserving native `Alert.alert` on iOS and Android.
  - Routed all row deletion and backlog-reset confirmations in `SwipeableTrackRow.tsx` and screens (`index.tsx`, `backlog.tsx`, `done.tsx`, `add.tsx`) through `showAlert`.
- **Extended Pause Distance & Calibrated Delete Threshold**:
  - Extended the comfortable Pause/Backlog zone on the Currently screen to 28–150dp so quick swipes never inadvertently trigger Delete.
  - Set `DELETE_THRESHOLD = 195dp` (with `MAX_SWIPE_RIGHT = 280dp`), smoothly morphing background color (`secondaryContainer` to `errorContainer`) across 110–175dp and fading in Delete across 135–175dp with scale pop at 195dp.
- **Swipe Recognition & Scroll Discrimination**:
  - Tightened horizontal drag ratio requirement to `|dx| > 2.0 * |dy|` with `SLOP = 12` in `onMoveShouldSetPanResponder`, preventing vertical list scrolls from accidentally triggering row swipe gestures.
  - Set `onPanResponderTerminationRequest: () => false` on the active row pan responder so parent `SectionList`/`FlatList`/`ScrollView` cannot hijack the gesture mid-drag when a user drags horizontally with minor vertical finger wobble.
  - Added `touchAction: 'pan-y'` and `userSelect: 'none'` on web to let browsers handle vertical list scrolling natively while passing horizontal swipes to the PanResponder without touch cancellation.
  - Handled `onPanResponderTerminate` gracefully: if a gesture is cancelled by the OS/browser near or past the delete threshold (`>= DELETE_THRESHOLD`), it confirms the delete action instead of silently dropping the gesture and resetting the row.
- **Testing & Verification**:
  - Added unit tests in `src/ui/__tests__/alert.test.ts` verifying native delegation vs web `window.confirm` / `window.alert` execution.
  - Added unit tests in `src/ui/__tests__/SwipeableTrackRow.test.tsx` verifying web deletion confirmation, scroll vs swipe gesture discrimination, termination refusal, and release/terminate delete triggers.

### Design Decisions & Trade-offs
*Why create a unified `showAlert` helper?*
`react-native-web` does not implement `Alert.alert`. Rather than sprinkling `Platform.OS === 'web'` branches across every screen and component, `src/ui/alert.ts` provides a single drop-in replacement that handles multi-button cancel/destructive flows with `window.confirm` and informational alerts with `window.alert`.

*Why 195dp with a 28–150dp Pause zone?*
A 28–150dp Pause zone provides wide, forgiving travel for the frequent, reversible "Pause / Backlog" quick swipe without triggering the destructive Delete action prematurely. The Delete threshold at 195dp clearly signals intentional deep pulling via the red `errorContainer` transition starting at 150dp.









