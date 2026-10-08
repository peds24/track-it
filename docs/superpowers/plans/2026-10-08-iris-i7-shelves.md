# Iris I7 — Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Iris app opens to the real library: three tabs (Currently, Backlog, Done) of real tracks from the on-device SQLite database. Each tab advances, starts, resumes, pauses, completes, renames and deletes exactly as the Android app does, built from the I6 kit and checked against the spec §5 checklist.

**Architecture:**
- **Library.** A new `IrisCore.Library` wraps the GRDB `DatabaseQueue` behind async methods and `AsyncStream` shelf observations, so the app target never imports GRDB.
- **Row text.** What a row *says* comes from TS's pure label functions. They move out of `TrackRow.tsx` into `src/ui/trackLabels.ts`, a new fixture module records them, and Swift ports them to `IrisCore/Presentation/` and replays them. That way Android and iOS rows can't drift.
- **App target.** The app adds an `@Observable` `ShelfModel` per tab that maps `TrackSummary` to `IrisShelfRow.Model`, plus `ShelfView` screens and a root `TabView`.
- **Testing.** A DEBUG `-IrisSeed demo` launch argument opens a seeded temporary library, so UI tests and screenshots are deterministic.

**Tech Stack:** Swift 6.4 / SwiftUI (iOS 26), GRDB 7 (`ValueObservation`), XCTest/XCUITest (incl. `performAccessibilityAudit`); TS: jest fixture recorder.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md`. This plan implements:
- §5, the full per-screen checklist;
- §6, the shelf rows of the screen map;
- §8 I7: "Shelves — Now/Up Next/Finished tabs, advance/start/pause/delete — §5 checklist; screenshots";
- the §3 new-feature rule: fixtures first, then both implementations.

It also uses `design/iris/components.md` (I6).

## Global Constraints

- **Tab names stay "Currently / Backlog / Done".** Spec §6: "Tab names are proposals for I7, not decisions; they stay 'Currently / Backlog / Done' unless changed there." The proposal "Now / Up Next / Finished" goes to the user at plan review. If they choose it, change only the three `Tab` titles in Task 5 and the HANDOFF line.
- **Same behaviour as the TS screens** (`app/(tabs)/index.tsx`, `backlog.tsx`, `done.tsx`, `src/ui/SwipeableTrackRow.tsx`): the same repository calls, the same confirmation copy, the same orderings (Currently grouped by category in the order show, movie, book, comic, manga; most recently advanced first within a group), and the same empty-state copy.
- **Native idioms (spec §5):**
  - The commit action is a leading full swipe (Currently: advance; Backlog: start/resume). The trailing swipe holds Pause/Backlog and Delete.
  - Everything else goes in `.contextMenu`: Complete, Rename, Move to Backlog, Delete.
  - Destructive and irreversible actions (Delete; Complete; Done → Backlog) confirm with `confirmationDialog`, using the TS titles and messages verbatim.
  - Rename is reversible, so it has no confirmation (A15).
- **Out of scope (later steps):**
  - Track detail (I8): a row tap pushes a placeholder.
  - The position editor (A12, I8).
  - Add and search (I9): no + button yet.
  - Rate and Rankings (I10): an unrated Done row shows no accessory, there's no Rankings button, and nothing asks for a rating on finish.
  - The feedback mail and "?" help sheet: listed under I12 in the handoff.
- **Swift 6 strict concurrency.** `IrisCore` stays free of UI frameworks. The app target never `import GRDB`s.
- **The app target spells `IrisCore.Category`.** Kit components come from I6 and are used as they are; if a component needs to change, change `components.md` with it.
- **Decision for the spec's I4 open item:** keep `DatabaseQueue` (not `DatabasePool`/WAL). There is one user and one writer, the library is small (I12 measures 1,000 tracks), and a queue serialises reads and writes, which keeps observation simple. Record it in DEVLOG; it reverses no numbered decision, so there is no amendment.
- **NUL bytes (I4 open item):** rename strips U+0000 from the typed title before saving. Catalogue text is I9's concern.
- **Work branch:** `worktree-iris-shelves` (`.claude/worktrees/iris-shelves`). Merge into `iris` with `--no-ff` and push, as I0–I6 did.
- **Commits end with:**
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01V2n8Vxn8Hq7b6BTCpwRhYj
  ```

## Review Focus

1. **A failed write.** If advancing a row the database rejects throws (say the entry was deleted in another tab a moment ago), the screen shows an alert with TS's title ("Could not update") and the message. The list stays live and is not left stale or emptied. Pinned by a `ShelfModel` test with a throwing `Library` stub (Task 4).
2. **Acting on a row while its shelf changes under it.** Advancing the last unit moves the row from Currently to Done. Observation must deliver both shelves' new contents without a manual reload, and a swipe on a row that just left the shelf must not crash. Pinned by a `Library` observation test (Task 2) and the UI smoke test (Task 6).
3. **First launch with no database file.** The library file is created in Application Support and migrated, and the shelves show their empty states. A second launch opens the same file. Pinned by a `Library.open(at:)` test on a temp path (Task 2).
4. **Long titles and AX5 on real screens.** Section headers, context-menu titles and confirmation titles carry full track titles. At AX5 nothing primary truncates, and swipe actions keep their labels. Pinned by AX5 screenshots of each tab (Task 6) and by `performAccessibilityAudit` (Task 6).
5. **Parity of row text.** "Watching Episode 4", "S3 Ep 15 of 24", "Paused · Volume 31" and the completion copy must match Android byte for byte. Pinned by the `trackLabels` fixture module replayed in Swift (Task 1).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/ui/trackLabels.ts` | pure row-text functions moved out of `TrackRow.tsx` (+ new `rowAction`) |
| `src/ui/TrackRow.tsx` | imports and re-exports them; uses `rowAction` for its button |
| `shared/fixtures/cases/trackLabels.ts`, `shared/fixtures/trackLabels.json` | authored cases, recorded expectations |
| `shared/fixtures/registry.ts`, `shared/fixtures/__tests__/fixtures.test.ts` | register the module; coverage-by-title only for `src/domain` modules |
| `apple/IrisCore/Sources/IrisCore/Presentation/TrackLabels.swift` | Swift port |
| `apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+TrackLabels.swift`, `FixtureTests.swift` | replay |
| `apple/IrisCore/Sources/IrisCore/Persistence/Library.swift` | `Library`: open, observe shelves and scores, actions |
| `apple/IrisCore/Sources/IrisCore/Persistence/TrackRepo.swift` | public `TrackSummary` init (no behaviour) |
| `apple/IrisCore/Sources/IrisCore/Persistence/DemoLibrary.swift` | `seedDemoLibrary(_:)` for DEBUG and tests |
| `apple/IrisCore/Tests/IrisCoreTests/LibraryTests.swift` | open/observe/act |
| `apple/Iris/Features/Shelves/ShelfRowMapping.swift` | `TrackSummary` (+ score) → `IrisShelfRow.Model` |
| `apple/Iris/Features/Shelves/ShelfModel.swift` | `@Observable` per-tab state, actions, pending confirmation, errors |
| `apple/Iris/Features/Shelves/ShelfView.swift` | the List screen, swipe actions, context menu, dialogs |
| `apple/Iris/Features/Shelves/TrackPlaceholderView.swift` | I8 stand-in for a pushed detail |
| `apple/Iris/App/RootView.swift`, `IrisApp.swift`, `AppLibrary.swift` | TabView; library location; `-IrisSeed demo` |
| `apple/IrisTests/ShelfRowMappingTests.swift`, `ShelfModelTests.swift` | app-side logic |
| `apple/IrisUITests/ShelvesTests.swift`, `LaunchTests.swift` | smoke, a11y audit, screenshots |
| `apple/scripts/screenshots.sh` | also captures the shelves into `docs/design/iris/screens/` |

---

### Task 1: Row text held to TS by fixtures

**Files:**
- Create: `src/ui/trackLabels.ts`, `shared/fixtures/cases/trackLabels.ts`, `apple/IrisCore/Sources/IrisCore/Presentation/TrackLabels.swift`, `apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+TrackLabels.swift`
- Modify: `src/ui/TrackRow.tsx`, `shared/fixtures/registry.ts`, `shared/fixtures/__tests__/fixtures.test.ts`, `apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift`, `apple/IrisCore/Sources/IrisCore/Persistence/TrackRepo.swift` (public init)
- Recorded: `shared/fixtures/trackLabels.json`

**Interfaces:**
- **TS:** `src/ui/trackLabels.ts` exports:
  - `verbFor(category)`, `positionLabel(track)`, `seasonPositionLabel(track)`, `canEditPosition(track)`: moved verbatim from `TrackRow.tsx`, together with `READ_CATEGORIES` and `hasSeasonProgress`.
  - `rowAction(track): RowAction | null`, which is new: the inline button logic, extracted. Its type is `type RowAction = { kind: 'advance' | 'resume'; entryId: string; label: string; accessibilityLabel: string }`.
  - `completionMessage` stays in `src/ui/completionMessage.ts`.
- **Swift (IrisCore, public):** `verbFor(_:) -> String`, `positionLabel(_: TrackSummary) -> String`, `seasonPositionLabel(_:) -> String?`, `canEditPosition(_:) -> Bool`, `rowAction(_:) -> RowAction?`, `completionMessage(_:) -> String`.
  - `public struct RowAction: Codable, Equatable, Sendable { public enum Kind: String, Codable, Sendable { case advance, resume }; public let kind: Kind; public let entryId: String; public let label: String; public let accessibilityLabel: String }`
  - `completionMessage` takes `TrackSummary` (TS takes a `Pick` of it).
- **Fixture fns:** `verbFor`, `positionLabel`, `seasonPositionLabel`, `canEditPosition`, `rowAction`, `completionMessage`. `args[0]` is a full `TrackSummary` JSON (or a `Category` string for `verbFor`).

- [ ] **Step 1: Move the TS functions (no behaviour change).** Create `src/ui/trackLabels.ts`. It must have no React or React Native imports. It holds `READ_CATEGORIES`, `verbFor`, `positionLabel`, `hasSeasonProgress`, `seasonPositionLabel` and `canEditPosition`, cut from `TrackRow.tsx` unchanged with their doc comments, plus:

```ts
/** The row's one button: what it says and what it does (TrackRow, and Iris rows via fixtures). */
export type RowAction = { kind: 'advance' | 'resume'; entryId: string; label: string; accessibilityLabel: string };

export function rowAction(track: TrackSummary): RowAction | null {
  const { nextEntryId, nextEntryTitle } = track;
  if (!nextEntryId || !nextEntryTitle) return null;
  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  const startLabel = track.category === 'movie' ? 'Watched' : 'Start';
  return {
    kind: resuming ? 'resume' : 'advance',
    entryId: nextEntryId,
    label: resuming ? 'Resume' : starting ? startLabel : 'Done',
    accessibilityLabel: resuming
      ? `Resume ${track.title}`
      : starting
        ? `${startLabel} ${track.title}`
        : `Mark ${nextEntryTitle} ${verbFor(track.category)}`,
  };
}
```

In `TrackRow.tsx`, delete the moved code. Add `import { canEditPosition, positionLabel, rowAction, seasonPositionLabel } from '@/ui/trackLabels';` and `export { canEditPosition, positionLabel, seasonPositionLabel } from '@/ui/trackLabels';`, because other files import them from `TrackRow`. Grep first: `grep -rn "from '@/ui/TrackRow'" app src`. Then replace the inline `resuming/starting/startLabel` button logic with `const action = rowAction(track);` and render `{action && (<Pressable accessibilityLabel={action.accessibilityLabel} onPress={() => (action.kind === 'resume' ? onResume(track) : onAdvance(action.entryId))} …>{action.label}</Pressable>)}`. Keep `onLongPress`, `editable` and the styles as they are.

Run: `npx jest src/ui` → expected: all TrackRow/SwipeableTrackRow/screen tests still pass (the refactor is behaviour-free), and `npm run typecheck` is clean.

- [ ] **Step 2: Author the cases.** In `shared/fixtures/cases/trackLabels.ts`, build `TrackSummary` values with a helper. Cover every branch that the TrackRow tests describe:

```ts
import type { TrackSummary } from '@/data/trackRepo';
import type { FixtureCase } from '../types';

// Extracted from src/ui/__tests__/TrackRow.test.tsx; inputs only, expectations are recorded.
function t(over: Partial<TrackSummary>): TrackSummary {
  return {
    kind: 'series', id: 's1', title: 'Severance', category: 'show', shelf: 'currently', createdAt: '2026-08-12T10:00:00.000Z',
    progress: { done: 3, total: 10 }, ongoing: false, paused: false, seasons: null, nextEntryStatus: 'unstarted',
    nextEntryId: 'e4', nextEntryTitle: 'Episode 4', lastAdvancedAt: null, completionDrops: null, ...over,
  };
}
const SEASONS = [{ number: 1, episodeCount: 9 }, { number: 2, episodeCount: 10 }];
const each = (fn: string, name: string, track: TrackSummary): FixtureCase => ({ name: `${fn}: ${name}`, fn, args: [track] });

const tracks: [string, TrackSummary][] = [
  ['a watching show', t({})],
  ['a reading series, next unstarted', t({ category: 'manga', title: 'One Piece', nextEntryTitle: 'Volume 31' })],
  ['a reading series, next in progress', t({ category: 'book', title: 'Dune', kind: 'entry', nextEntryStatus: 'in_progress', nextEntryTitle: 'Dune' })],
  ['a standalone movie in backlog', t({ kind: 'entry', category: 'movie', title: 'Arrival', shelf: 'backlog', progress: null, nextEntryTitle: 'Arrival', nextEntryId: 'm1' })],
  ['a backlog show, not started', t({ shelf: 'backlog', progress: { done: 0, total: 10 } })],
  ['a paused series with progress', t({ shelf: 'backlog', paused: true, category: 'manga', title: 'One Piece', nextEntryTitle: 'Volume 31' })],
  ['a paused standalone', t({ kind: 'entry', shelf: 'backlog', paused: true, category: 'book', title: 'Dune', nextEntryTitle: 'Dune', progress: null })],
  ['a show with seasons, watching', t({ seasons: SEASONS, progress: { done: 13, total: 19 }, nextEntryTitle: 'Episode 14' })],
  ['a paused show with seasons', t({ seasons: SEASONS, progress: { done: 13, total: 19 }, shelf: 'backlog', paused: true })],
  ['an unstarted backlog show with seasons', t({ seasons: SEASONS, progress: { done: 0, total: 19 }, shelf: 'backlog' })],
  ['an ongoing comic', t({ category: 'comic', title: 'Saga', ongoing: true, nextEntryTitle: 'Issue 67', completionDrops: 'Issue 67' })],
  ['an ongoing comic with nothing to drop', t({ category: 'comic', title: 'Saga', ongoing: true, completionDrops: null })],
  ['a finished series', t({ shelf: 'done', progress: { done: 10, total: 10 }, nextEntryId: null, nextEntryTitle: null })],
  ['a finished book', t({ kind: 'entry', category: 'book', shelf: 'done', progress: null, nextEntryId: null, nextEntryTitle: null })],
  ['a finished movie', t({ kind: 'entry', category: 'movie', shelf: 'done', progress: null, nextEntryId: null, nextEntryTitle: null })],
  ['a series with no total', t({ progress: { done: 0, total: 0 } })],
  ['a title with an apostrophe and emoji', t({ title: 'Bob’s Burgers 🍔', nextEntryTitle: 'Episode 1' })],
];

export const cases: FixtureCase[] = [
  ...(['show', 'movie', 'book', 'comic', 'manga'] as const).map((c): FixtureCase => ({ name: `verbFor: ${c}`, fn: 'verbFor', args: [c] })),
  ...['positionLabel', 'seasonPositionLabel', 'canEditPosition', 'rowAction', 'completionMessage'].flatMap((fn) =>
    tracks.map(([name, track]) => each(fn, name, track)),
  ),
];
```

Register the module:
- In `shared/fixtures/registry.ts`, import the six functions (`completionMessage` from `@/ui/completionMessage`, the rest from `@/ui/trackLabels`) and add them to `registry`.
- In `fixtures.test.ts`, add `trackLabels: { cases: trackLabels, testFiles: [] }` to `MODULES`. Filter the "coverage by title" `describe.each` to modules with `testFiles.length > 0`, with the comment `// src/ui modules: their tests render components, so there is no title list to cover.`

Check `shared/fixtures/types.ts` for the `FixtureCase` shape before writing.

- [ ] **Step 3: Record and read.** Run `npm run fixtures:record`. Open `shared/fixtures/trackLabels.json` and check five expectations by hand against `TrackRow.test.tsx`:
  - "a show with seasons, watching" → positionLabel `Watching Episode 14`, seasonPositionLabel `S2 Ep 5 of 10`;
  - "a paused series" → `Paused · Volume 31`;
  - "a standalone movie in backlog" → rowAction label `Watched`, a11y `Watched Arrival`;
  - "a finished movie" → `Watched`;
  - "an ongoing comic" completionMessage starts `Issue 67 isn't marked done`.

Then run `npx jest shared` → PASS.

- [ ] **Step 4: Failing Swift replay.** Add `func testTrackLabels() throws { try check("trackLabels", trackLabelsFixtures) }` to `FixtureTests.swift`, and create `Registry+TrackLabels.swift`:

```swift
@testable import IrisCore

let trackLabelsFixtures: [String: FixtureFn] = [
    "verbFor": { a in try toJSON(verbFor(arg(a, 0))) },
    "positionLabel": { a in try toJSON(positionLabel(arg(a, 0))) },
    "seasonPositionLabel": { a in try toJSON(seasonPositionLabel(arg(a, 0))) },
    "canEditPosition": { a in try toJSON(canEditPosition(arg(a, 0))) },
    "rowAction": { a in try toJSON(rowAction(arg(a, 0))) },
    "completionMessage": { a in try toJSON(completionMessage(arg(a, 0))) },
]
```

Run `swift test --package-path apple/IrisCore --filter FixtureTests/testTrackLabels`. Expected: a compile failure, because the functions are undefined. If `TrackSummary`'s JSON decode fails on `seasons: null` or on a missing key, fix the decoding in the fixture's `arg` path rather than the type.

- [ ] **Step 5: Port.** In `apple/IrisCore/Sources/IrisCore/Presentation/TrackLabels.swift`, write a line-by-line port of `trackLabels.ts` and `completionMessage.ts`, using `currentSeason` (Domain/Seasons.swift) and `Category`. String interpolation must reproduce TS's exactly, including the `·` (U+00B7) and `’` characters copied from the TS source. Add `public init(...)` to `TrackSummary` with every stored property, in declaration order; the app and tests need it.

Run the Step 4 command → PASS. Then run the whole `swift test --package-path apple/IrisCore` → PASS.

- [ ] **Step 6: Commit.** Use `refactor(ui): move row labels to trackLabels.ts` for Step 1 alone, then `feat(iris-core): row labels held to TS by fixtures` for Steps 2–5. Stage files by name.

---

### Task 2: `Library`: open, observe, act

**Files:**
- Create: `apple/IrisCore/Sources/IrisCore/Persistence/Library.swift`, `DemoLibrary.swift`, `apple/IrisCore/Tests/IrisCoreTests/LibraryTests.swift`

**Interfaces:**
- Consumes: the repo functions in `TrackRepo.swift`/`RatingRepo.swift`, `openLibrary(at:)`, `migrate(_:)`, `syncUnitForEntry`, `ProviderRegistry`.
- Produces:

```swift
public final class Library: Sendable {
    public static func open(at url: URL) throws -> Library            // creates the directory + file, migrates
    public static func inMemory() throws -> Library                   // tests, previews, demo
    public func tracks(shelf: Shelf, category: Category?) -> AsyncStream<Result<[TrackSummary], Error>>
    public func scores() -> AsyncStream<[String: Double]>             // ratingKey → score, re-emitted on any rating change
    public func advance(entryId: String, now: Date) async throws
    public func resume(_ track: TrackRef) async throws
    public func returnToBacklog(_ track: TrackRef) async throws
    public func complete(_ track: TrackRef, now: Date) async throws
    public func rename(_ track: TrackRef, title: String) async throws  // strips U+0000, trims; empty → no-op
    public func delete(_ track: TrackRef) async throws
    public func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool
}
public func seedDemoLibrary(_ library: Library) throws               // the Gallery-sample tracks, fixed timestamps
```

`now` is rendered with the same ISO formatter the persistence layer uses. Grep `ISODate.swift` for the existing `Date` → `"…Z"` helper and reuse it. Each observation uses `ValueObservation.tracking { try listTracks($0, shelf: shelf, category: category) }` and emits on the main actor's next run via `.values(in:)`, wrapped so errors become `.failure`.

`TrackSummary` conforms to `TrackRef`-like use through `TrackRef(kind:id:)`; add `public var ref: TrackRef { TrackRef(kind: kind, id: id) }` to `TrackSummary`.

- [ ] **Step 1: Failing tests.**

```swift
import Foundation
import XCTest
@testable import IrisCore

final class LibraryTests: XCTestCase {
    func testOpenCreatesAndReopensTheSameFile() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let url = dir.appendingPathComponent("Library/library.sqlite")
        let first = try Library.open(at: url)
        try seedDemoLibrary(first)
        let second = try Library.open(at: url)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        XCTAssertFalse(try second.snapshot(shelf: .currently).isEmpty)
    }

    func testObservationFollowsATrackFromCurrentlyToDone() async throws {
        let library = try Library.inMemory()
        let id = try library.write { db in
            try createStandaloneTrack(db, StandaloneInput(title: "Dune", category: .book), now: "2026-10-01T10:00:00.000Z")
        }
        let first = try await library.firstEntryId(of: TrackRef(kind: .entry, id: id))
        var current = library.tracks(shelf: .currently, category: nil).makeAsyncIterator()
        var done = library.tracks(shelf: .done, category: nil).makeAsyncIterator()
        _ = await current.next(); _ = await done.next()             // initial values
        try await library.advance(entryId: first, now: Date())     // backlog → currently (in progress)
        try await library.advance(entryId: first, now: Date())     // → done
        var sawDone = false
        while let value = await done.next() {
            if case let .success(tracks) = value, tracks.contains(where: { $0.id == id }) { sawDone = true; break }
        }
        XCTAssertTrue(sawDone)
    }

    func testRenameStripsNULAndIgnoresBlank() async throws {
        let library = try Library.inMemory()
        let id = try library.write { try createStandaloneTrack($0, StandaloneInput(title: "Dune", category: .book), now: "2026-10-01T10:00:00.000Z") }
        let ref = TrackRef(kind: .entry, id: id)
        try await library.rename(ref, title: "Du\u{0}ne Messiah ")
        XCTAssertEqual(try library.snapshot(shelf: .backlog).first?.title, "Dune Messiah")
        try await library.rename(ref, title: "  \u{0} ")
        XCTAssertEqual(try library.snapshot(shelf: .backlog).first?.title, "Dune Messiah")
    }

    func testAdvanceOfAMissingEntryThrows() async throws {
        let library = try Library.inMemory()
        do { try await library.advance(entryId: "nope", now: Date()); XCTFail("expected a throw") } catch {}
    }

    func testDemoSeedFillsAllThreeShelves() throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        for shelf in [Shelf.currently, .backlog, .done] { XCTAssertFalse(try library.snapshot(shelf: shelf).isEmpty, "\(shelf)") }
    }
}
```

The tests also need three internal helpers on `Library`: `write<T>(_:)`, `snapshot(shelf:)` and `firstEntryId(of:)`. They're thin wrappers, `internal`, for tests and the seed.

Run `swift test --package-path apple/IrisCore --filter LibraryTests` → expected: a compile failure.

- [ ] **Step 2: Implement `Library.swift`:**

```swift
import Foundation
import GRDB

/// The app's one door to the library (I7). Wraps the GRDB queue so the app
/// target never imports GRDB; every write is one repo call, as in TS.
public final class Library: Sendable {
    let queue: DatabaseQueue

    init(queue: DatabaseQueue) { self.queue = queue }

    public static func open(at url: URL) throws -> Library {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        return Library(queue: try openLibrary(at: url.path))
    }

    public static func inMemory() throws -> Library {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        return Library(queue: queue)
    }

    public func tracks(shelf: Shelf, category: Category?) -> AsyncStream<Result<[TrackSummary], Error>> {
        let observation = ValueObservation.tracking { db in try listTracks(db, shelf: shelf, category: category) }
        return AsyncStream { continuation in
            let task = Task {
                do {
                    for try await value in observation.values(in: queue) { continuation.yield(.success(value)) }
                } catch {
                    continuation.yield(.failure(error))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func scores() -> AsyncStream<[String: Double]> {
        let observation = ValueObservation.tracking { db in
            Dictionary(try allScores(db).map { ($0.key, $0.score) }, uniquingKeysWith: { a, _ in a })
        }
        return AsyncStream { continuation in
            let task = Task {
                for try await value in observation.values(in: queue) { continuation.yield(value) }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func advance(entryId: String, now: Date) async throws {
        try await queue.write { try advanceEntry($0, entryId: entryId, now: isoString(now)) }
    }
    public func resume(_ track: TrackRef) async throws { try await queue.write { try resumeTrack($0, track) } }
    public func returnToBacklog(_ track: TrackRef) async throws { try await queue.write { try returnTrackToBacklog($0, track) } }
    public func complete(_ track: TrackRef, now: Date) async throws {
        try await queue.write { try completeTrack($0, track, now: isoString(now)) }
    }
    public func delete(_ track: TrackRef) async throws { try await queue.write { try deleteTrack($0, track) } }

    /// A15 rename; U+0000 is dropped because GRDB would truncate the string at it.
    public func rename(_ track: TrackRef, title: String) async throws {
        let clean = title.replacingOccurrences(of: "\u{0}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        try await queue.write { try renameTrack($0, track, title: clean) }
    }

    /// A25 after an advance; never throws, never blocks the advance.
    public func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool {
        guard let registry else { return false }
        return await syncUnitForEntry(queue, entryId: entryId) { source, category in registry.provider(forSource: source, category: category) }
    }

    // MARK: internal helpers (tests, seed)
    func write<T: Sendable>(_ body: @Sendable (Database) throws -> T) throws -> T { try queue.write(body) }
    func snapshot(shelf: Shelf) throws -> [TrackSummary] { try queue.read { try listTracks($0, shelf: shelf) } }
    func firstEntryId(of track: TrackRef) async throws -> String { try await queue.read { try firstEntryOf($0, track).id } }
}
```

Adjust these to the real signatures as you go. `ISODate.swift` has no `Date` → string helper, so add `public func toISOString(_ date: Date) -> String` there, producing exactly what `new Date().toISOString()` does (`yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`, UTC, POSIX locale). Pin it with an IrisCoreTests case for `Date(timeIntervalSince1970: 1_760_000_000.123)` → `"2025-10-09T08:53:20.123Z"`. `isoString` above means `toISOString`. `FirstEntry` may have no `id`, so read `FirstEntry` and use its entry id field. If `ProviderRegistry` is not `Sendable`, make the closure capture what is.

- [ ] **Step 3: `DemoLibrary.swift`.** `seedDemoLibrary` writes fixed-timestamp tracks covering every row state on the Gallery list:
  - **Currently:** Severance (show, seasons 9/10, 13 done), Dune (book standalone, in progress), Saga (comic, ongoing, 3 issues done).
  - **Backlog:** Arrival (movie), One Piece (manga, paused at volume 31 of 108; create with `startAtOrdinal` then pause through `returnTrackToBacklog`), and The Lord of the Rings: The Fellowship of the Ring (Extended Edition) (movie).
  - **Done:** Project Hail Mary (book), rated liked through `saveRating`, and Interstellar (movie), unrated.

Use `createSeriesTrack`/`createStandaloneTrack`/`advanceEntry`/`setTrackPosition` only, so the seed goes through the same code paths as the app.

- [ ] **Step 4: Run the tests and see them pass.** `swift test --package-path apple/IrisCore --filter LibraryTests` → 5 pass; the whole package → PASS.

- [ ] **Step 5: Commit** (`feat(iris-core): a Library the app can observe and act on`).

---

### Task 3: `TrackSummary` → `IrisShelfRow.Model`

**Files:**
- Create: `apple/Iris/Features/Shelves/ShelfRowMapping.swift`, `apple/IrisTests/ShelfRowMappingTests.swift`

**Interfaces:**
- Consumes: `positionLabel`, `seasonPositionLabel`, `rowAction`, `ratingKey`, `seasonSegments` (IrisCore); `IrisShelfRow.Model`/`Accessory`, `IrisProgress.Value` (kit).
- Produces: `extension IrisShelfRow.Model { init(_ track: TrackSummary, score: Double?, sentiment: Sentiment?) }`.

The mapping rules, from `TrackRow.tsx`:
- **detail:**
  - Start with `seasonPositionLabel(track) ?? positionLabel(track)`.
  - Append `" · Ongoing"` when `track.ongoing`.
  - Append `" · \(done) of \(total)"` when there's progress and it isn't ongoing. TS shows the count even on Done; keep that.
- **progress:**
  - `nil` when `shelf == .done`, or when there's no progress or `total == 0`.
  - Season segments (`.seasons(seasonSegments(seasons, doneCount: done))`) under the same eligibility as `hasSeasonProgress`: Currently, or Backlog and paused, with seasons and progress.
  - Otherwise `.flat(done:total:)`.
- **accessory:**
  - `rowAction(track)` gives `.action(title: action.label, symbol: action.kind == .resume ? .start : (track.shelf == .backlog ? .start : .advance), accessibilityName: action.accessibilityLabel)`.
  - Otherwise a score gives `.rating(score, sentiment ?? .fine)`.
  - Otherwise `.none`. `.rate` arrives in I10.
- **coverURL:** `nil`. Neither the TS nor the Swift `TrackSummary` carries a cover (Android rows show none), so Iris rows show the category fallback. Putting art on rows means adding a cover to the summary on both platforms, which is a separate decision and is listed in the handoff.

- [ ] **Step 1: Failing tests:** one assertion per rule above, using `TrackSummary(...)` (Task 1's public init). The cases: a seasons show on Currently (segments and the `S2 Ep 5 of 10 · 13 of 19` detail), an ongoing comic (`… · Ongoing`, no bar), a backlog movie (`Watched`, symbol `.start`), a paused manga (`Resume`), a Done book with a score of 8.7 liked (a rating accessory, with the count still shown if it has progress), and a Done movie with no score (`.none`).
- [ ] **Step 2: Run them and see them fail** (`-only-testing:IrisTests/ShelfRowMappingTests`).
- [ ] **Step 3: Implement** the extension exactly to the rules.
- [ ] **Step 4: Run the tests and see them pass. Commit** (`feat(iris): map a track summary onto a shelf row`).

---

### Task 4: `ShelfModel`: state, actions, confirmations, errors

**Files:**
- Create: `apple/Iris/Features/Shelves/ShelfModel.swift`, `apple/IrisTests/ShelfModelTests.swift`

**Interfaces:**
- Consumes: `Library` (Task 2), via a protocol so tests can make it throw:

```swift
protocol ShelfLibrary: Sendable {
    func tracks(shelf: Shelf, category: IrisCore.Category?) -> AsyncStream<Result<[TrackSummary], Error>>
    func scores() -> AsyncStream<[String: Double]>
    func advance(entryId: String, now: Date) async throws
    func resume(_ track: TrackRef) async throws
    func returnToBacklog(_ track: TrackRef) async throws
    func complete(_ track: TrackRef, now: Date) async throws
    func rename(_ track: TrackRef, title: String) async throws
    func delete(_ track: TrackRef) async throws
    func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool
}
extension Library: ShelfLibrary {}
```

- Produces:

```swift
@MainActor @Observable final class ShelfModel {
    enum Pending: Identifiable, Equatable { case delete(TrackSummary), complete(TrackSummary), moveToBacklog(TrackSummary); var id: String }
    struct Failure: Identifiable, Equatable { let id = UUID(); let title: String; let message: String }
    struct Section: Identifiable, Equatable { let category: IrisCore.Category; let tracks: [TrackSummary]; var id: String { category.rawValue } }

    let shelf: Shelf
    var category: IrisCore.Category? { didSet { restart() } }   // Backlog/Done filter
    private(set) var tracks: [TrackSummary] = []
    private(set) var scores: [String: Double] = [:]
    private(set) var loaded = false
    var pending: Pending?
    var failure: Failure?

    init(shelf: Shelf, library: any ShelfLibrary, registry: ProviderRegistry?)
    func start()                       // begins observing; idempotent
    var sections: [Section] { get }    // Currently only: show, movie, book, comic, manga; empty groups dropped
    func rowModel(_ t: TrackSummary) -> IrisShelfRow.Model
    func performAccessory(_ t: TrackSummary)   // rowAction: advance or resume, then A25 sync
    func pause(_ t: TrackSummary)              // returnToBacklog on Currently: no confirm (A6)
    func requestMoveToBacklog(_ t: TrackSummary)  // Done → confirm (TS: progress is cleared)
    func requestDelete(_ t: TrackSummary)
    func requestComplete(_ t: TrackSummary)
    func confirm(_ p: Pending)
    func rename(_ t: TrackSummary, to title: String)
    static func dialogTitle(_ p: Pending) -> String
    static func dialogMessage(_ p: Pending) -> String
    static func confirmLabel(_ p: Pending) -> String
}
```

The copy is verbatim from `SwipeableTrackRow.tsx`:
- **delete:** title `Delete <title>?`. Message: series `This removes the track and every episode, issue or volume under it. It cannot be undone.`; entry `This removes the track. It cannot be undone.` Button `Delete`, destructive.
- **complete:** title `Mark <title> complete?`, message `completionMessage(track)`, button `Complete`.
- **moveToBacklog:** title `Move <title> to the backlog?`, message `Its progress will be cleared — the backlog only holds things you have not started.`, button `Move`, destructive.

The failure titles are verbatim from the screens: `Could not update` (advance), `Could not resume track`, `Could not move track`, `Could not complete`, `Could not rename track`, `Could not delete`, `Could not load your tracks` (an observation failure). The message is the error's `localizedDescription`; for a `DomainError` it is `.message`.

- [ ] **Step 1: Failing tests:** use a `FakeLibrary` actor implementing `ShelfLibrary` that records calls, can be set to throw, and yields from a controllable `AsyncStream`.

```swift
@MainActor
final class ShelfModelTests: XCTestCase {
    func testCurrentlyGroupsByCategoryInTSOrderAndDropsEmptyGroups() async { /* yield [book, show, show]; expect sections [show(2), book(1)] */ }
    func testAccessoryAdvancesTheNextEntryThenSyncs() async { /* performAccessory → fake.calls == [.advance("e4"), .sync("e4")] */ }
    func testAccessoryOnAPausedTrackResumes() async { /* backlog paused → [.resume(ref)] */ }
    func testFailedAdvanceShowsTSTitleAndKeepsTheList() async { /* fake throws DomainError("Entry e4 is already done") → failure == ("Could not update", "Entry e4 is already done"); tracks unchanged */ }
    func testObservationFailureShowsCouldNotLoad() async { /* yield .failure → failure.title == "Could not load your tracks" */ }
    func testDeleteAsksFirstAndOnlyDeletesOnConfirm() async { /* requestDelete → pending == .delete; calls empty; confirm → [.delete(ref)] */ }
    func testConfirmationCopyIsTSVerbatim() { /* dialogTitle/Message/confirmLabel for all three, series and entry */ }
    func testPauseOnCurrentlyDoesNotAsk() async { /* pause → [.returnToBacklog]; pending nil */ }
    func testFilterRestartsObservationWithTheCategory() async { /* category = .book → fake.observed last == (.backlog, .book) */ }
}
```

Write each body in full in the step; the comments above name the assertions. To await async effects, use `await fake.waitForCalls(count:)`, which is part of the fake, plus `await Task.yield()` loops bounded to 100.

- [ ] **Step 2: Run them and see them fail. Step 3: Implement** `ShelfModel`. `start()` launches two `Task`s, one per stream, stored and cancelled in `restart()` and `deinit`. Every action is `Task { do { try await …; } catch { failure = Failure(title:…, message: Self.message(error)) } }`. `performAccessory` runs `syncAfterAdvance` after a successful advance, and ignores its result: observation picks up any change.
- [ ] **Step 4: Run the tests and see them pass. Commit** (`feat(iris): shelf model — actions, confirmations, errors`).

---

### Task 5: The screens

**Files:**
- Create: `apple/Iris/Features/Shelves/ShelfView.swift`, `TrackPlaceholderView.swift`, `apple/Iris/App/AppLibrary.swift`
- Modify: `apple/Iris/App/RootView.swift`, `IrisApp.swift`, `apple/IrisUITests/LaunchTests.swift`

**Interfaces:**
- **`AppLibrary.make() -> (Library, ProviderRegistry?)`:**
  - The release path is `Application Support/Iris/library.sqlite`.
  - In DEBUG, `-IrisSeed demo` gives `Library.inMemory()` seeded by `seedDemoLibrary`.
  - The registry is `ProviderRegistry(keys: .fromBundle(), http: URLSessionHTTPClient())`, or `nil` when no key is set. Check the key names on `ProviderKeys`.
  - If opening fails, show a full-screen `IrisEmptyState("Couldn't open your library", symbol: .emptyShelf, message: error text)`, never a crash.
- **`RootView`:** `TabView { Tab("Currently", systemImage: "play.circle") {…}; Tab("Backlog", systemImage: "tray") {…}; Tab("Done", systemImage: "checkmark.circle") {…} }`. Each tab is a `NavigationStack { ShelfView(model:) }` and owns its `ShelfModel` as `@State`. The DEBUG Gallery button moves to the Currently toolbar, keeping its `gallery.open` identifier.
- **`ShelfView`:**
  - `List` (`.insetGrouped`), with `.navigationTitle(shelf title)` as a large title.
  - Currently renders `ForEach(model.sections)` as `Section` with a header `Label(category.plural.capitalized, systemImage: category.symbol.systemName)` and a trailing count. Backlog and Done render one plain section.
  - Backlog and Done have a toolbar `Menu` filter: `Picker("Category", selection: $model.category) { Text("All").tag(nil as IrisCore.Category?); ForEach(IrisCore.Category.allCases) { Label($0.plural.capitalized, systemImage: $0.symbol.systemName).tag(Optional($0)) } }`, with the menu label `Label("Filter", systemImage: model.category == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")`. This is the iOS equivalent of `FilterBar`.
  - Rows are `NavigationLink(value: track.ref)` wrapping `IrisShelfRow(model.rowModel(track), onOpen: {}, onAccessory: { model.performAccessory(track) })`. `.navigationDestination(for: TrackRef.self) { TrackPlaceholderView(ref: $0) }`.
  - Commit swipe: `.swipeActions(edge: .leading, allowsFullSwipe: true) { if let a = rowAction(track) { Button(a.label) { model.performAccessory(track) }.tint(IrisTokens.Colors.accent) } }`.
  - Trailing swipe: on Currently, `Button("Pause", systemImage: IrisSymbol.pause.systemName) { model.pause(track) }`; on Done, `Button("Backlog") { model.requestMoveToBacklog(track) }`; and `Button("Delete", role: .destructive) { model.requestDelete(track) }`.
  - `.contextMenu`: Rename… (sets `renaming = track` and presents an `.alert` with a `TextField`), Complete… (not on Done), Move to Backlog… (Done only), Pause (Currently), and Delete… (destructive).
  - `.confirmationDialog(ShelfModel.dialogTitle, isPresented: pending != nil, presenting: model.pending) { p in Button(ShelfModel.confirmLabel(p), role: destructive-for-delete/move) { model.confirm(p) } } message: { Text(ShelfModel.dialogMessage($0)) }`.
  - `.alert(item: $model.failure)`.
  - Empty state: `IrisEmptyState`, using the TS copy per shelf ("Nothing on the go" / "Add something new, or start a track from your backlog."; "Nothing here yet" / "Tracks in your backlog will appear here."; "Nothing finished yet" / "Completed tracks will be listed here."). Show it only when `model.loaded && tracks.isEmpty`.
  - `.sensoryFeedback(.success, trigger: completedCount)`. The haptic for finishing comes from the row accessory (kit); the full-swipe path triggers it through the model's `commits` counter, observed in the view.
  - Accessibility identifiers: `shelf.<shelf>` on the List, `row.<track.id>` on each row.
- **`TrackPlaceholderView`:** `IrisEmptyState("Track details arrive in I8", symbol: .more, message: ref.id)` with the navigation title "Track".

- [ ] **Step 1: Failing UI test.** In `LaunchTests`, replace the I0 assertion. A plain launch shows three tabs (`app.tabBars.buttons["Currently"]`, `["Backlog"]`, `["Done"]`) and the `Currently` navigation bar. Run → FAIL.
- [ ] **Step 2: Implement** the files above.
- [ ] **Step 3: Run `LaunchTests` and `GalleryTests` → PASS.** The Gallery test opens `gallery.open` from the Currently toolbar.
- [ ] **Step 4: Look.** Install the app and launch it with `-IrisSeed demo`, in light, dark and `-IrisDynamicType accessibility5`. Screenshot each tab with `xcrun simctl io booted screenshot`, downscale and read them. Walk the §5 checklist by eye: large title collapsing, system tab bar, swipe labels, context-menu items, dialogs, SF Symbols only, and no truncated titles at AX5. Fix before committing.
- [ ] **Step 5: Commit** (`feat(iris): Currently, Backlog and Done shelves`).

---

### Task 6: Smoke tests, accessibility audit, screenshots

**Files:**
- Create: `apple/IrisUITests/ShelvesTests.swift`
- Modify: `apple/scripts/screenshots.sh`

**Interfaces:**
- Consumes: the `-IrisSeed demo` data (Task 2) and the identifiers (Task 5).
- Produces: `docs/design/iris/screens/<Currently|Backlog|Done>-<light|dark|ax5>.png` (9 files). They aren't part of the jest PNG check, which covers components only.

- [ ] **Step 1: Failing tests:**

```swift
final class ShelvesTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", "demo"] + extra
        app.launch()
        return app
    }

    @MainActor func testAdvancingFromTheRowButtonMovesTheCount() {
        let app = launch()
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Severance'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(row.value as? String == "Season 2, 13 of 19 episodes")
        row.swipeRight()                                   // leading full swipe = Done
        XCTAssertTrue(NSPredicate(format: "value == 'Season 2, 14 of 19 episodes'").evaluate(with: row) || row.waitForValue("Season 2, 14 of 19 episodes"))
    }

    @MainActor func testStartingABacklogMovieFinishesIt() { /* Backlog tab → swipeRight on "Arrival" row → Done tab shows "Arrival" */ }
    @MainActor func testPauseMovesATrackToBacklog() { /* swipeLeft on Dune → tap "Pause" → Backlog tab shows Dune with "Paused" */ }
    @MainActor func testDeleteConfirmsWithTSCopy() { /* swipeLeft Saga → Delete → sheet shows "Delete Saga?" and the series message → tap Delete → row gone */ }
    @MainActor func testRenameFromTheContextMenu() { /* press(forDuration:1) on Dune → "Rename…" → type " Messiah" → OK → row label begins "Dune Messiah" */ }
    @MainActor func testEachShelfPassesTheAccessibilityAudit() throws {
        let app = launch()
        for tab in ["Currently", "Backlog", "Done"] {
            app.tabBars.buttons[tab].tap()
            try app.performAccessibilityAudit(for: [.dynamicType, .sufficientElementDescription, .hitRegion, .contrast]) { issue in
                // The tab bar and system chrome are Apple's; only our content may fail.
                issue.element?.identifier.hasPrefix("_") ?? false
            }
        }
    }
    @MainActor func testCaptureShelfScreenshots() throws { /* like GalleryTests.testCaptureGalleryScreenshots: three variants × three tabs; writes "<tab>-<variant>.png" to IRIS_SHELF_SCREENSHOT_DIR when set; always attaches */ }
}
```

Write each body in full. Add `waitForValue(_:)` as an `XCUIElement` extension in the test file, which polls `value` for 5 s. Add `-UIViewAnimationSpeed`-style speedups only if a test is flaky, and ledger it.

If the audit flags something in our content, fix the content (labels, contrast, hit regions) rather than widening the filter. The one allowed exclusion is system chrome.

- [ ] **Step 2: Run them and see them fail** (before Task 5's code exists this would be red; at this point at least the screenshot test fails, on missing files). Then implement the bodies until each passes, and read every failure.
- [ ] **Step 3: Screenshots.** Extend `screenshots.sh`: after the Gallery run, set `TEST_RUNNER_IRIS_SHELF_SCREENSHOT_DIR="$REPO_DIR/docs/design/iris/screens"` and run `-only-testing:IrisUITests/ShelvesTests/testCaptureShelfScreenshots` with the same resample loop over `screens/*.png`. Skip it when the first argument narrows to components. Run the script and read all 9 PNGs. Fix anything that breaks §5 before committing.
- [ ] **Step 4: Commit** (`test(iris): shelf smoke tests, accessibility audit, screenshots`).

---

### Task 7: Docs, verification, merge

- [ ] **Step 1: Fresh full verification:** `npm run typecheck`, `npm test`, `apple/scripts/test.sh`. Quote the counts.
- [ ] **Step 2: Docs.**
  - **HANDOFF:**
    - I7 is done.
    - The tab names stay as they are, or change, per the user's call.
    - `DatabaseQueue` is kept.
    - The `trackLabels` fixture module now exists, and Android gets the `trackLabels.ts` move at I13.
    - The library path.
    - `-IrisSeed demo`.
    - What I8 consumes: `TrackRef` navigation and the placeholder.
    - Deferred: covers on rows (`TrackSummary` has none), the feedback/help sheet (I12), and rating prompts (I10).
  - **DEVLOG:** the decisions and gotchas, as in I6.
  - **`apple/README.md`:** the `-IrisSeed demo` line and `Presentation/`, held by `shared/fixtures/trackLabels.json`.
  - **`shared/README.md`:** `trackLabels` is the first `src/ui` module, and it has no coverage-by-title check.
  - **Scripts dictionary:** add the shelves pass to the `screenshots.sh` entry.
- [ ] **Step 3: Commit the docs, then the final review** (superpowers:requesting-code-review) on `iris...worktree-iris-shelves` with this plan's Review Focus. Fix what is confirmed, test first.
- [ ] **Step 4: Merge and push**, as in I6: `git switch iris && git merge --no-ff -F <msg> worktree-iris-shelves && git push origin iris worktree-iris-shelves && git switch worktree-iris-shelves`. Update the memory file: I7 merged at `<sha>`; next is I8 (track detail).
