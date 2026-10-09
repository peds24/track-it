# Iris I8 — Track Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a shelf row opens the track's own screen, as on Android (A22): hero cover, credit and meta line, where you are, the timeline, the rating card, the description with Show more, and every action. That includes the position editor (A12), which the shelves left out.

**Architecture:**
- **Detail text from TS.** The detail screen's own text and the position editor's validation are pure, but they live inline in `app/track/[kind]/[id].tsx` and `src/ui/ProgressEditor.tsx`. They move to `src/ui/trackDetail.ts`, a second `src/ui` fixture module records them, and Swift ports them to `IrisCore/Presentation/TrackDetail.swift`. This is the same route I7 used for row text.
- **One live track.** `Library` gains `detail(_:)`, a live stream of one track's `TrackDetail` and `RatingSummary`, plus `setPosition` and the A25 sync after a move.
- **App side.** A `@MainActor @Observable DetailModel` holds the screen's state and actions, with its copy taken verbatim from the TS screen, which differs from the swipe row's copy in places. `TrackDetailView` replaces I7's placeholder. `PositionEditorSheet` is an `irisSheet`.

**Tech Stack:** Swift 6.4 / SwiftUI (iOS 26), GRDB `ValueObservation` behind `Library`, XCTest/XCUITest; jest fixture recorder.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md`. This plan implements:
- §6 "Pushed detail: hero cover, metadata, `ExpandableText`, rating card, actions";
- §8 I8 "Track detail, incl. position editor (A12), rating card; §5 checklist";
- §5, the full checklist;
- §3, fixtures first.

The decision record is A22 (detail), A12 (position editor), A23 (complete), A25 (unit sync) and A26 (rating card, expandable text).

## Global Constraints

- **Behaviour and copy are the TS detail screen's, verbatim**, including where they differ from the swipe row:
  - Pause on Currently is `Could not pause`, with no confirmation.
  - Done → Backlog confirms `Move <title> to the backlog?` with the message `Its progress will be cleared.` and the button `Move` (destructive). Its failure is `Could not move`.
  - Resume's failure is `Could not resume`.
  - The primary button reads `Mark <next> watched|read`, or `Start`/`Watched`/`Resume`.
  - Missing track: `This track couldn’t be found — it may have been deleted.`
- **Delete** confirms with the TS copy, then pops back to the shelf. If deleting fails, it shows `Could not delete` and stays on the screen.
- **Native idioms (spec §5):**
  - A large-title-free pushed screen (`.navigationBarTitleDisplayMode(.inline)`, title = track title), with the content in an inset-grouped `List`.
  - The primary action is an `IrisPrimaryButton` pinned at the bottom (`.safeAreaInset(edge: .bottom)`).
  - The secondary actions (Edit position, Complete, Pause/Move to backlog, Delete) are in a toolbar `Menu` (`IrisSymbol.more`).
  - The position editor is an `irisSheet` (medium detent).
  - Confirmations use `confirmationDialog`.
- **The rating card** shows the badge, `#<rank> of <outOf> <plural>` and the sentiment label, or `Not rated yet. Rank it against the other <plural> you’ve finished.` on Done. **Its Re-rank/Rate it/Rankings buttons are I10's job**: in I8 the card shows information only.
- **Out of scope:**
  - The rate-on-finish prompt (I10).
  - Cover art loading beyond `IrisCover` with the stored `metadata.coverUrl`. The seed has no URLs, and tests never touch the network.
- **The app target** spells `IrisCore.Category` and `IrisCore.Progress`, and never imports GRDB. Kit components are used as they are; if one must change, `components.md` changes with it.
- **Work branch:** `worktree-iris-detail` (`.claude/worktrees/iris-detail`). Merge into `iris` with `--no-ff` and push.
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01V2n8Vxn8Hq7b6BTCpwRhYj
  ```

## Review Focus

1. **The track changes or disappears while open.** Advancing the last unit moves it to Done while the screen is open: the screen must update in place (position, timeline and Done state). If the track is deleted from another tab, the screen shows the not-found state, not stale data or a crash. Pinned by `Library.detail` observation tests (Task 2) and a `DetailModel` test (Task 3).
2. **Position-editor input.** Typed values must be refused, with Save disabled, exactly when TS refuses them: empty, non-digits, `0`, beyond the total, a season that doesn't exist, an episode beyond its season. Leading and trailing spaces are trimmed. An empty field takes the placeholder, which is the current position. Pinned by fixture cases (Task 1).
3. **Time-dependent text.** "Added 3 Oct 2026 · 5 days ago" depends on `now` and the calendar. Fixtures pin it under UTC with a fixed `now`, and the app passes `Date()` with `.current`. Pinned by fixture cases (Task 1).
4. **Long descriptions and AX5.** A multi-paragraph description shows six lines and a Show more toggle. At AX5 nothing primary truncates, and the bottom primary button doesn't cover the last section. Pinned by Task 6's AX5 screenshots of every screenful.
5. **Delete from the detail screen.** After confirming, the screen pops and the row is gone from its shelf. On failure, it doesn't pop. Pinned by a `DetailModel` test and a UI test (Tasks 3 and 6).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/ui/trackDetail.ts` | pure detail text + position-editor rules, moved from `[id].tsx` / `ProgressEditor.tsx` |
| `app/track/[kind]/[id].tsx`, `src/ui/ProgressEditor.tsx` | use them (no behaviour change) |
| `shared/fixtures/cases/trackDetail.ts`, `shared/fixtures/trackDetail.json` | cases, recorded |
| `shared/fixtures/registry.ts`, `__tests__/fixtures.test.ts` | register (`testFiles: []`, like `trackLabels`) |
| `apple/IrisCore/Sources/IrisCore/Presentation/TrackDetail.swift` | Swift port |
| `apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+TrackDetail.swift`, `FixtureTests.swift` | replay |
| `apple/IrisCore/Sources/IrisCore/Persistence/Library.swift` | `detail(_:)`, `setPosition`, `syncAfterMove` |
| `apple/IrisCore/Sources/IrisCore/Persistence/DemoLibrary.swift` | metadata (creator, year, description) on seeded tracks |
| `apple/IrisCore/Tests/IrisCoreTests/LibraryTests.swift` | detail observation tests |
| `apple/Iris/Features/Detail/DetailModel.swift` | state, actions, confirmations, pop |
| `apple/Iris/Features/Detail/TrackDetailView.swift` | the screen |
| `apple/Iris/Features/Detail/ExpandableText.swift` | six-line clamp with Show more / Show less |
| `apple/Iris/Features/Detail/PositionEditorSheet.swift` | A12 editor |
| `apple/Iris/Features/Shelves/ShelfView.swift` | push `TrackDetailView`; delete the placeholder |
| `apple/IrisTests/DetailModelTests.swift` | app logic |
| `apple/IrisUITests/DetailTests.swift` | open, advance, edit position, delete, screenshots |

---

### Task 1: Detail text and editor rules, held to TS by fixtures

**Interfaces (TS, `src/ui/trackDetail.ts`, no React imports):**

```ts
/** "MOVIE · 2016 · Ongoing" — the line under the credit. */
export function detailMeta(track: TrackSummary, releaseYear: string | null): string;
/** The bottom button: "Mark Episode 14 watched", "Start", "Watched", "Resume", or null with nothing next. */
export function detailPrimaryLabel(track: TrackSummary): string | null;
/** "13 of 19 episodes" (unit pluralised on total), or null without progress or unit. */
export function progressCaption(track: TrackSummary, unitLabel: UnitLabel | null): string | null;
/** The timeline rows: [["Added", "3 Oct 2026 · 5 days ago"], ["Started", …], ["Finished", "8 Oct 2026"]]. */
export function detailStats(timeline: Timeline, now: string): [string, string][];
/** A12 editor state for what was typed. */
export type PositionEdit = {
  unitWord: string;              // "Episode" | "Issue" | "Volume"
  seasoned: boolean;             // shows a Season field
  seasonPlaceholder: number | null;
  unitPlaceholder: number;       // the current position
  unitTotal: number | null;      // "of 10" next to the unit field
  target: number | null;         // the ordinal Save would set; null = Save disabled
};
export function positionEdit(track: TrackSummary, seasonText: string, unitText: string): PositionEdit;
```

The bodies are cut verbatim from `[id].tsx`:
- `meta` and `KIND_LABEL` become `detailMeta`.
- `primaryLabel` becomes `detailPrimaryLabel`, returning `null` when `!track.nextEntryId`.
- The `track.progress && unitLabel` caption becomes `progressCaption`.
- The `stats` array becomes `detailStats`.

`positionEdit` is the body of `ProgressEditor`, from `typed` down to `target`, returning the computed fields. `[id].tsx` and `ProgressEditor.tsx` then call these functions instead of computing inline.

**Fixture fns:** `detailMeta`, `detailPrimaryLabel`, `progressCaption`, `detailStats`, `positionEdit`. Cases go in `shared/fixtures/cases/trackDetail.ts`, using the same `t()` helper as `trackLabels.ts` (copy it):

- [ ] **Step 1: Move the TS code (no behaviour change).** Run `npx jest src/ui app` → all pass, and `npm run typecheck` → clean. Commit `refactor(ui): move detail text and editor rules to trackDetail.ts`.
- [ ] **Step 2: Author the cases:**
  - **`detailMeta`:** all five categories; with and without a year; ongoing.
  - **`detailPrimaryLabel`:** each `rowAction` branch, plus Done, which gives `null`.
  - **`progressCaption`:** episode/issue/volume; total 1 (singular); no progress; `unitLabel` null.
  - **`detailStats`:** added only; added + started; all three; `now` on the same day, `yesterday`, and 40 days later. The timestamps are fixed strings.
  - **`positionEdit`:** the Review Focus 2 list on a flat 10-volume series and on a two-season show (9 + 10). Inputs `''`/`''`, `' 3 '`, `'3a'`, `'0'`, `'11'`, season `'3'` (missing), season `'2'` episode `'11'` (beyond), season `'1'` episode `'9'`, and season `''` episode `'5'` (uses the current season).

  Run `npm run fixtures:record`. Check by hand that `positionEdit` with season `'2'` and episode `'5'` on 9 + 10 gives `target` 14, that `' 3 '` gives 3, and that `'0'` gives `null`. Then `npx jest shared` → PASS.
- [ ] **Step 3: Failing Swift replay.** Add `Registry+TrackDetail.swift` mapping the five fns, add `func testTrackDetail()` to `FixtureTests`, and add `trackDetail` to its `ported` set. Run `swift test --package-path apple/IrisCore --filter FixtureTests` → compile failure.
- [ ] **Step 4: Port to `Presentation/TrackDetail.swift`.**
  - `public struct PositionEdit: Codable, Equatable, Sendable` holds the six fields.
  - `typed()` must match TS exactly: trim JS whitespace (`jsTrim`), require ASCII `^\d+$`, then `Number`. Use `JSCompat`'s ASCII digit rule. A fullwidth `３` is refused, so add a Swift-parity case for it.
  - `detailStats` takes `calendar: Calendar = .current`, like `formatDate`.

  Run → PASS; the whole package → PASS.
- [ ] **Step 5: Commit** (`feat(iris-core): detail text held to TS by fixtures`).

### Task 2: `Library` for one track

**Interfaces:**

```swift
public struct TrackPage: Equatable, Sendable { public let detail: TrackDetail; public let rating: RatingSummary? }
extension Library {
    /// nil once the track no longer exists.
    public func detail(_ ref: TrackRef) -> AsyncStream<Result<TrackPage?, Error>>
    public func setPosition(seriesId: String, ordinal: Int, now: Date) async throws
    /// A25 after a move (advance or set position) of a series. Never throws.
    public func syncAfterMove(seriesId: String, registry: ProviderRegistry?) async -> Bool
}
```

The seed adds `TrackMetadata` to tracks that need it:
- Dune: creator `Frank Herbert`, year `1965`, and a description of at least three paragraphs, enough to need Show more.
- Severance: creator `Dan Erickson`, year `2022`.
- Project Hail Mary: creator `Andy Weir`, year `2021`.
- Interstellar: creator `Christopher Nolan`, year `2014`.

These go through `StandaloneInput(metadata:)` and `SeriesDraft(metadata:)`.

- [ ] **Step 1: Failing tests (LibraryTests):**
  1. `detail` emits the page, then a new page after an advance (position changes).
  2. After `delete`, it emits `nil`.
  3. A rated Done track carries its `RatingSummary`.
  4. `setPosition` on Severance to ordinal 3 gives progress 2 of 19.
  5. The seeded Dune has its creator, year and description.
- [ ] **Step 2: Implement** these with `ValueObservation.tracking { try getTrackDetail(...) … getRating(...) }` through the existing private `stream`.
- [ ] **Step 3: Run the tests and see them pass. Commit** (`feat(iris-core): observe one track; set its position`).

### Task 3: `DetailModel`

**Interfaces:**

```swift
protocol DetailLibrary: Sendable {
    func detail(_ ref: TrackRef) -> AsyncStream<Result<TrackPage?, Error>>
    func advance(entryId: String, now: Date) async throws
    func resume(_ track: TrackRef) async throws
    func returnToBacklog(_ track: TrackRef) async throws
    func complete(_ track: TrackRef, now: Date) async throws
    func delete(_ track: TrackRef) async throws
    func setPosition(seriesId: String, ordinal: Int, now: Date) async throws
    func syncAfterMove(seriesId: String, registry: ProviderRegistry?) async -> Bool
}
@MainActor @Observable final class DetailModel {
    enum State: Equatable { case loading, missing, loaded(TrackPage) }
    enum Pending: Identifiable, Equatable { case complete, moveToBacklog, delete; var id: Self { self } }
    private(set) var state: State
    var pending: Pending?
    var failure: ShelfModel.Failure?
    var editing: Bool                       // position sheet
    private(set) var dismissed = false      // the view pops when this turns true
    private(set) var commits = 0            // haptic trigger, bumped only on success
    init(ref: TrackRef, library: any DetailLibrary, registry: ProviderRegistry?)
    func start()
    func primary() async                    // advance or resume, then A25 sync for a series
    func pauseOrRequestMove()               // Currently: pause now; Done: pending = .moveToBacklog
    func confirm(_ p: Pending) async
    func setPosition(_ ordinal: Int) async  // then A25 sync
    static func dialogTitle(_ p: Pending, _ t: TrackSummary) -> String
    static func dialogMessage(_ p: Pending, _ t: TrackSummary) -> String
    static func confirmLabel(_ p: Pending) -> String
    static func isDestructive(_ p: Pending) -> Bool
    static let missingMessage = "This track couldn’t be found — it may have been deleted."
}
```

- [ ] **Step 1: Failing tests:**
  - `primary()` advances the next entry and syncs a series; it resumes a paused track.
  - Failure titles: `Could not update`, `Could not resume`, `Could not pause`, `Could not move`, `Could not complete`, `Could not delete`.
  - Delete sets `dismissed` only on success.
  - Pause on Currently doesn't ask; on Done it asks, with `Its progress will be cleared.`
  - A `nil` page means `.missing`.
  - An observation failure keeps the last page and recovers on the next `start()`, as I7's I-1 fix does.
  - `commits` is bumped only on a successful advance or completion.

  Use a `FakeDetailLibrary`, like I7's `FakeLibrary`.
- [ ] **Step 2: Run them and see them fail. Step 3: Implement. Step 4: Run them and see them pass. Commit** (`feat(iris): detail model — actions, confirmations, pop on delete`).

### Task 4: `ExpandableText` and `PositionEditorSheet`

- **`ExpandableText(text:lines: 6)`:**
  - Clamps with `.lineLimit(expanded ? nil : lines)`.
  - Whether to show "Show more"/"Show less" is measured, not guessed: an invisible, unclamped copy in a `background` reports its height through `onGeometryChange`, and the toggle appears only when the full text is taller than the clamped one.
  - The toggle is a `Button`, `subheadline` semibold, in `color.accent`; that's a glyph-free text button, so check its contrast in the audit.
  - The invisible copy is `.accessibilityHidden(true)`.
- **`PositionEditorSheet(track:onSave:)`:**
  - A `Form`: a Season `TextField` (number pad) when `positionEdit(...).seasoned`, a unit field with the placeholder and an `of N` suffix, and Save/Cancel in the toolbar. Save is disabled while `target == nil`.
  - The title is `Edit track number`, with the track title as the subtitle, as in TS.
  - Presented with `irisSheet(detents: [.medium])`.
- [ ] **Step 1: Failing test.** In `IrisTests`, the editor's `saveEnabled(season:unit:)` helper mirrors `positionEdit(...).target != nil`. Assert three inputs.
- [ ] **Step 2: Implement both views, plus Gallery-free previews.** **Step 3:** the tests pass. **Commit** (`feat(iris): expandable text and the position editor`).

### Task 5: `TrackDetailView`, wired from the shelves

**Layout** (inset-grouped `List`):
1. **Header section, no background:**
   - `IrisCover(size: .hero, decorative: false)`, centred.
   - The title: `title2`, with no line limit.
   - The credit line: `creatorLine`, `subheadline`.
   - `detailMeta`: `footnote`, `color.label`.
2. **Progress:**
   - The position label (`seasonPositionLabel ?? positionLabel`).
   - `progressCaption`.
   - An `IrisProgress`, using I7's rule for flat versus season segments.
3. **Timeline:** `LabeledContent` per `detailStats` row, then `activityLine` as a footer.
4. **Rating:** only when there is a rating or the track is Done.
   - With a rating: `IrisRatingBadge`, plus `#rank of outOf plural`, plus the sentiment label (`I liked it` / `It was fine` / `I didn’t like it`).
   - Without one: the TS "Not rated yet…" text.
5. **About:** `ExpandableText(cleanDescription(...))`, only when there's a description.

**Around the list:**
- **Bottom inset:** `IrisPrimaryButton(detailPrimaryLabel, fullWidth: true)`, when non-nil. Its haptic is the kit's own.
- **Toolbar `Menu`** (`IrisSymbol.more`, label "Actions"):
  - Edit position, when `canEditPosition`;
  - Complete…, when not Done;
  - Pause, on Currently, or Move to Backlog…, on Done;
  - a divider;
  - Delete…, destructive.
- **Dialogs:** `confirmationDialog` for `pending`, `.alert(item: $model.failure)`, and `.irisSheet` for the editor.
- **States:** `.missing` shows an `IrisEmptyState` with `DetailModel.missingMessage`; `.loading` shows a `ProgressView`.
- **Pop:** `onChange(of: model.dismissed) { if $0 { dismiss() } }`.

**Wiring:** `ShelfView`'s `navigationDestination(item:)` builds `TrackDetailView(model: DetailModel(ref:library:registry:))`. `ShelfView` therefore needs the library and registry, so pass them into `ShelfModel`, which already holds them, and expose them through `makeDetailModel(_ ref:)`. Delete `TrackPlaceholderView.swift`.

- [ ] **Step 1: Failing UI test.** In `DetailTests`, tapping the Severance row shows a navigation bar `Severance`, the text `S2 Ep 5 of 10`, `13 of 19 episodes`, and a button `Mark Episode 14 watched`. Run → FAIL.
- [ ] **Step 2: Implement. Step 3:** the test passes, and LaunchTests, GalleryTests and ShelvesTests still pass. **Step 4: Look** at Severance, Dune (Show more) and Project Hail Mary (rating card) in light, dark and system AX5. Fix anything that breaks §5. **Commit** (`feat(iris): track detail screen`).

### Task 6: UI tests, audit, screenshots

- [ ] **Tests in `DetailTests`:**
  - The primary button advances in place (`14 of 19 episodes`).
  - Edit position: open the menu, then Edit position, type season `1` and episode `3`, Save. The screen shows `2 of 19 episodes`.
  - Save is disabled for season `3`.
  - Delete: open the menu, then Delete…, then confirm. The screen pops, and the Currently shelf no longer has the row.
  - Show more expands Dune's description, and Show less returns.
  - The contrast, element-description and hit-region audit on Severance, Dune and Project Hail Mary, collecting every issue as `ShelvesTests` does.
- [ ] **Screenshots:** `testCaptureDetailScreenshots` writes `docs/design/iris/screens/Detail-<Severance|Dune|HailMary>-<light|dark|ax5>[-p<n>].png`. AX5 uses the system setting and captures every screenful, plus `Detail-Severance-editor-light.png`. Extend `screenshots.sh` with an `IRIS_DETAIL_SCREENSHOT_DIR` pass. Read every PNG.
- [ ] **Commit** (`test(iris): detail smoke tests, audit, screenshots`).

### Task 7: Docs, verification, review, merge

- [ ] **Verify:** `npm run typecheck`, `npm test` and `apple/scripts/test.sh`, all fresh, quoting the counts.
- [ ] **Docs:**
  - **HANDOFF:** I8 is done. Record what I9 and I10 consume: the rating card's missing buttons are I10's, and Add is I9's. Note that `trackDetail` is the second `src/ui` fixture module.
  - **DEVLOG:** the decisions and gotchas.
  - **`apple/README.md` and `shared/README.md`:** mention `trackDetail`.
  - **Scripts dictionary:** the `screenshots.sh` detail pass.
- [ ] **Final review** (superpowers:requesting-code-review, most capable model) on `iris...worktree-iris-detail`, using this Review Focus. Fix the confirmed findings, test first.
- [ ] **Merge and push**, as in I7. Update the memory file: I8 merged; next is I9 (Add).
