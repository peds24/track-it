# Iris I12 — iOS Hardening + TestFlight Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Iris is ready for TestFlight in every respect except the account. That covers:
- An app-wide accessibility audit in light, dark and AX5.
- A measured, budgeted 1,000-track library.
- Android's feedback mail and "?" data-sources sheet.
- The I7–I11 deferred minors, fixed.
- A Release build that passes a local pre-upload check.
- `apple/scripts/testflight.sh`, which uploads once the account exists.

**Architecture:**
- **Audit.** One shared `Audit` helper in `IrisUITests/` replaces the four copies, and one `AppAuditTests` walks every screen.
- **Performance.**
  - IrisCore gains a seeded 1,000-track library: a test helper plus the DEBUG `-IrisSeed perf` flag.
  - Budget and query-plan tests run in `swift test`; launch and scroll metrics come from a UI test.
- **Feedback.** Feedback text follows the `src/ui` fixture pattern: a fifth module, `feedback`, with `appName`.
- **Release.**
  - Release readiness is a privacy manifest, an export-compliance key and a script with two modes.
  - `--check` builds Release unsigned, inspects the bundle and launches it in the simulator. It runs now.
  - `--upload` archives, signs and uploads with an App Store Connect API key. It is written now and runs after you join.

**Tech Stack:** SwiftUI, XCTest/XCUITest (`performAccessibilityAudit`, `XCTApplicationLaunchMetric`, `XCTOSSignpostMetric`), GRDB, xcodebuild archive/export, jest.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md`:
- §5, the per-screen checklist, now checked app-wide.
- §8 I12: "a11y audit, performance on a 1,000-track library, … TestFlight", done when a "TestFlight build installed on a device".
- §12: iPad layouts are out of scope.

**User decisions (2026-10-14):**
- **No paid Apple Developer account yet.** Build everything else and prepare the upload; the upload itself waits.
  - I12 is therefore done when `testflight.sh --check` passes.
  - "TestFlight build installed on a device" moves to a follow-up step, **I12b**, run once the account exists. It is recorded in spec §8.
- **Upload route:** a local script with an App Store Connect API key, not Xcode Cloud and not Organizer by hand.
- **Scope adds:**
  - the feedback mail and "?" help sheet;
  - all the deferred minors from I7–I11.
- **Scope excludes iPad orientations.** The user didn't pick it. Known risk: portrait-only under device family `1,2` will probably fail upload validation (ITMS-90474) on the first `--upload`. `--check` warns about it rather than failing.

## Global Constraints

- **Branch:** `worktree-iris-hardening` off `iris`. Merge into `iris` with `--no-ff` and push. Commits carry the Opus 5.5 co-author line and the Claude-Session line.
- **Secrets stay local.** `apple/Iris/Config/Secrets.xcconfig` is git-ignored and is never printed, read aloud or committed. `--check` only reports whether each key is set (non-empty), never its value. The App Store Connect API key (`.p8`) lives outside the repo; its path, key ID and issuer ID come from environment variables.
- **Android/web untouched**, except for comment-only cleanup in `app/add.tsx` (an I9 minor) and `src/ui/feedback.ts` gaining an optional `appName` (its default keeps Android's output byte-identical).
- **Copy is held by fixtures.** Every new user-facing string on iOS comes from a `src/ui` module plus a fixture (pattern from I7–I10), except for system chrome.
- **DEBUG-only stays DEBUG-only.** `-IrisSeed perf`, the Gallery and every launch flag stay under `#if DEBUG`; `--check` proves that the Release binary lacks them.

## Review Focus

1. **The audit really covers every screen and state**, including sheets, dialogs, the position editor, the scanner fallback and the empty states, in light, dark and AX5. Pinned by `AppAuditTests` asserting the list of screens it visited (Task 1).
2. **The performance budget measures the real query path** (`Library.tracks` stream, `rankings`, `detail`), not a hand-written SQL stand-in, on a library shaped like real use: long shows, comics with hundreds of issues. Pinned by the seed shape test and the query-plan test (Task 2).
3. **Feedback with no mail account** must not silently do nothing. Pinned by a test that a rejected `openURL` shows the "No mail app found" alert (Task 3).
4. **The Release bundle ships no DEBUG surface and no secrets in git.** Pinned by `--check`'s symbol and string checks and the Secrets-not-tracked check (Task 6).
5. **Double-tap guards don't swallow legitimate second actions.** A second advance after the first finishes must still work. Pinned by tests for "in flight" and "after completion" (Task 4).

---

### Task 1: One audit helper, one app-wide audit

**Files:**
- Create `IrisUITests/Audit.swift`.
- Create `IrisUITests/AppAuditTests.swift`.
- Modify `ShelvesTests`, `DetailTests`, `AddTests` and `RateTests` to use the helper and drop their copies.

**Helper:** `Audit.run(_ app: XCUIApplication, screen: String, types: XCUIAccessibilityAuditType = .all, excusing: [Excuse])`.
- It collects issues into a shared `[String]`; the failure is reported once at the end, which is the existing pattern.
- `Excuse` moves the current excuse rules into one place:
  - system chrome;
  - elements under the pinned button or the bars' blur band;
  - the two named "nearly passed" contrast cases.
- Each excuse has a comment saying why.

**AppAuditTests:**
- **Scope.** For each of light, dark and AX5, it audits with `.all`. That includes `.dynamicType`, `.textClipped`, `.trait`, `.elementDetection` and `.parentChild`.
- **Screens, one by one:**
  - three shelves, filled and empty (an empty seed via `-IrisSeed empty`);
  - detail for a show, a book, a movie and a comic;
  - the position editor;
  - all three confirmation dialogs (complete, delete, move to backlog);
  - the rename alert;
  - Add: categories, search results, confirm, comic mode;
  - the Rate steps: sentiment, compare, result;
  - Rankings;
  - the rate prompt;
  - the new Feedback and Data sources sheets (Task 3).
- **Visit list.** The test records each screen it visited and asserts that list equals a declared `Self.screens` list (Review Focus 1).

**Reduce Motion and Reduce Transparency (§5.9):**
- New DEBUG flags `-IrisReduceMotion YES` and `-IrisReduceTransparency YES` inject the environment values at the root. They work like `-IrisColorScheme`.
- A UI test launches with both. It asserts that the glass surfaces expose the solid-fallback identifier the kit sets (`glass.fallback`) and that the audit still passes.

- [ ] **Step 1:** Write `AppAuditTests` and the helper. Run it and collect every issue; the expected result is a list of findings, which is RED. Ledger the list.
- [ ] **Step 2:** Fix each finding at its source: a kit token, a label, a trait or a frame. A narrowly scoped `Excuse` with a ledgered ruling is only for system-owned UI. The I7 cramped AX5 delete dialog, a system `confirmationDialog`, is one candidate.
- [ ] **Step 3:** Move the four suites onto the helper and run them all → PASS. **Commit:** `test(iris): one audit helper and an app-wide audit in every appearance`, plus a separate fix commit for each kind of fix.

### Task 2: A 1,000-track library, measured

**Files:**
- Create `IrisCore/Sources/IrisCore/Persistence/PerformanceSeed.swift` (public `seedLargeLibrary(_:tracks:)`; deterministic, no randomness).
- Create `IrisCore/Tests/IrisCoreTests/PerformanceTests.swift`.
- Modify `Iris/App/AppLibrary.swift` (`-IrisSeed perf`, open off the main actor).
- Create `IrisUITests/PerformanceTests.swift`.

**Seed shape (1,000 tracks):**

| Category | Tracks | Shape |
| --- | --- | --- |
| Shows | 300 | 20 of them with 8 seasons × 22 episodes; the rest 1–3 seasons |
| Books | 250 | |
| Movies | 200 | |
| Comics | 150 | 10 of them with 400 issues |
| Manga | 100 | Up to 60 volumes |

Shelf split: 15% Currently, 50% Backlog, 35% Done. 300 Done tracks are rated across the categories.

- [ ] **Step 1, failing tests (IrisCore):**
  - **Seed shape:** counts per category and per shelf, and the largest series' unit count.
  - **Budgets.** Each check takes the median of 5 runs after one warm-up, against the 1,000-track seed.
    - The first value of `tracks(shelf:category:)` for every shelf, with and without a category, arrives in < 150 ms.
    - `rankings(category:)` for a category returns in < 50 ms.
    - `detail` for the 400-issue comic returns in < 50 ms.

    The budgets are deliberately loose for debug-build `swift test`. Their job is to catch an O(n²) or a missing index, not to benchmark.
  - **Query plan.** `EXPLAIN QUERY PLAN` for the shelf, rankings and detail queries shows no `SCAN entry` and no `SCAN rating` without `USING INDEX`. Runs come from the same SQL the Library executes (expose the statements internally for tests).

  Run → FAIL: the seed helper is missing.
- [ ] **Step 2: Implement the seed.** Run the tests and ledger the real timings and plans. Add a migration-free fix only if a budget or plan fails. A new index needs a TS migration first (CLAUDE.md §6: a domain or schema change lands its fixture first). If one is needed, stop and ledger a ruling: schema changes go through `npm run fixtures:record` and both platforms.
- [ ] **Step 3: App side.**
  - **Seed flag.** `-IrisSeed perf` (DEBUG) seeds 1,000 tracks into an in-memory library.
  - **Launch off the main actor.** `AppLibrary.make()` runs off the main actor: `RootView` shows a `ProgressView` until the library opens (this is the I7 minor "Library opened on the main actor"). A unit test asserts that `make` is `nonisolated async`.
- [ ] **Step 4: UI test** (`PerformanceTests`, perf seed):
  - **Launch to first row:** < 2 s, asserted.
  - **Scroll:** `measure(metrics: [XCTApplicationLaunchMetric()])` and a Backlog scroll to the bottom under `XCTOSSignpostMetric.scrollingAndDecelerationMetric`. These are recorded in DEVLOG, not asserted, because simulator numbers swing.
  - **Row on screen:** the test also asserts that the last row becomes hittable, which proves the list is lazy and complete.

  **Commit:** `perf(iris): a 1,000-track library, budgeted and measured`.

### Task 3: Feedback mail and the "?" data-sources sheet

**Files:**
- Modify `src/ui/feedback.ts`: `feedbackMailto(message, app: { version; platform; name?: string })`, where `name` defaults to `'Track It'`.
- Create `src/ui/aboutText.ts`. The data-sources copy and `versionLine(name, version, platform)` move here from `app/(tabs)/done.tsx`, which then imports them, so Android's output is unchanged.
- Create `shared/fixtures/feedback.json` and `shared/fixtures/aboutText.json` (the fifth and sixth `src/ui` modules, `testFiles: []`).
- Create `IrisCore/Sources/IrisCore/Presentation/FeedbackText.swift` and its fixture runner case.
- Create `Iris/Features/Done/FeedbackSheet.swift` and `Iris/Features/Done/DataSourcesSheet.swift`.
- Modify `ShelfView` (Done toolbar).

**Behaviour:**
- **Toolbar.** Done's toolbar gains a `Menu` ("More", `ellipsis.circle`, identifier `shelf.more`) next to Rankings, holding "Send Feedback…" and "Data Sources".
- **Feedback.** Feedback is an `irisSheet` (medium detent) with the TS copy, a multi-line `TextField`, and Cancel and Send. Send is disabled while the text is blank. Send calls `openURL(feedbackMailto(…, name: "Iris", platform: "iOS"))`. If iOS rejects the URL, the app shows the alert "No mail app found" / "You can email your feedback to serdiopedro@gmail.com." Otherwise it clears the draft and dismisses.
- **Data sources.** Data Sources is an `irisSheet` with the TMDB notice, the Google Books/Metron line, `versionLine("Iris", 2.0.0, "iOS")` and Close. TMDB's attribution is a condition of its API terms, so this must ship before TestFlight.

- [ ] **Step 1: Failing tests:**
  - jest: the default `name` keeps Android's mailto byte-identical, `name: 'Iris'` changes the subject and signature, and the fixtures are recorded.
  - Swift fixture cases.
  - A UI test, `-IrisSeed demo`: open More → Send Feedback, check that Send is disabled when blank, type and send.
  - The "No mail app found" alert. The simulator has no Mail account, so `openURL(mailto:)` is rejected there; this is real behaviour, not a mock.
  - Data Sources shows the TMDB line and "Iris 2.0.0 · iOS".

  Run → FAIL.
- [ ] **Step 2: Implement.** Run `npm run fixtures:record`, then jest, the Swift fixtures and the UI tests → PASS. Add both sheets to the screenshot passes in `screenshots.sh`. **Commit:** `feat(iris): feedback mail and data-sources sheet on Done`.

### Task 4: Deferred minors — behaviour

Each item gets a failing test first, then the fix. All are in the I7–I10 HANDOFF lists.

| # | Minor (origin) | Fix | Test |
| --- | --- | --- | --- |
| a | The haptic fires before the write succeeds (I7) | `swipeCommits` / `model.commits` bump only after `performAccessory`/`confirm` returns success | ShelfModel: a failing write leaves `commits` unchanged |
| b | Double tap advances twice: shelf row and detail (I7/I8) | Per-track in-flight set in `ShelfModel` and `DetailModel`; a second request for the same track while one is in flight is ignored | In flight: 2 calls → 1 write. After completion: a second call writes again (Review Focus 5) |
| c | Double tap pushes an Add step twice (I9) | `AddModel` ignores `pick`/`confirm` while a step transition is pending | AddModel test |
| d | Rename alert title (I7) | Title "Rename Track", copy in `trackLabels.ts` + fixture | Fixture + UI |
| e | Blank dialog if the track is deleted elsewhere while open (I8) | DetailModel clears `pending` when the stream reports `.missing` | DetailModel test |
| f | EAN-5 field has no length limit (I9) | Digits only, max 5, through `addFlow.ts` `normalizeEan5` + fixture | Fixture + AddModel |
| g | DataScanner never stops on teardown (I9) | `stopScanning()` in `dismantleUIViewController` | Logic test on the coordinator's stop call (with a fake scanner protocol) |
| h | "Could not add track" after a successful add whose advance failed (I9) | Distinct copy, "Added, but couldn't start it", in `addFlow.ts` + fixture; no retry button | AddModel test |
| i | Rate sheet has no visible grabber (I10) | Use `irisSheet` (`.presentationDragIndicator(.visible)`) | UI: the drag indicator exists |
| j | "Too tough to call" plays no haptic (I10) | Bump the comparison commit counter on tie | RateModel test |

- [ ] **Step 1:** Write all the failing tests. Run them → FAIL, one per row. **Step 2:** Fix them row by row, rerunning each. **Step 3:** Run the full `apple/scripts/test.sh` → PASS. **Commit:** one commit per row or per closely related pair.

### Task 5: Deferred minors — tests, fixtures, tooling

| # | Minor (origin) | Fix |
| --- | --- | --- |
| a | Assembled detail line isn't fixture-held; no empty-string fixture cases (I7) | Add the `detailLine` and empty-string cases to `trackLabels.json` |
| b | Seasoned-show editor fixture cases `'0'`, `'3a'`, `' 3 '` (I8) | Add them to `trackDetail.json` |
| c | No test for finishing the last unit from the detail screen (I8) | DetailTests UI test |
| d | Rate test gaps: re-rate then cancel; the Later path's Rate accessory; See-your-X from a shelf (I10) | Three RateTests |
| e | Editor's grey footer never audited (I8) | Covered by Task 1's audit; fix the colour if it fails |
| f | Stale `-p<n>` screenshots when a run captures fewer pages (I8) | `screenshots.sh` deletes a screen's old `-p*` files before capturing |
| g | mark.json validator: geometry and object-entry errors (I11) | `blades` a positive integer, `0 < innerRadius < outerRadius`, `gap ≥ 0`; an object entry missing a mode names the mode. jest RED → GREEN |
| h | `INCLUDE_ALL_APPICON_ASSETS` comment (I11) | Remove the setting; it only applies to alternate icons |
| i | Two orphaned comments in `app/add.tsx` (I9) | Delete them (comment-only) |

Not done, with ledgered rulings:
- **Transparent dark icon (I11).** Black matches the launch screen; revisit only if the on-device look in I12b disappoints.
- **"Android does the same"** on double tap. iOS now guards (Task 4b); Android adopts the guard at I13 or in an android-side fix. That is not this branch.

- [ ] Each fixture addition: record, then watch the Swift side fail if the port lacks the case, then fix. Tests first for c, d and g. **Commit** per item group.

### Task 6: Release readiness and `testflight.sh`

**Files:**
- Create `apple/Iris/Resources/PrivacyInfo.xcprivacy`:
  - `NSPrivacyTracking false`, no tracking domains, no collected data types;
  - accessed API `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1`, because the app reads its own launch-argument defaults;
  - `NSPrivacyAccessedAPICategoryFileTimestamp` only if the code uses it (grep and rule).
- Modify `project.yml`: `ITSAppUsesNonExemptEncryption: false` (HTTPS only, exempt).
- Create `apple/scripts/testflight.sh` and `apple/ExportOptions.plist`.
- Create `IrisTests/ReleaseReadinessTests.swift`.
- Update the scripts dictionary, `apple/README.md` and `.gitignore` (the archive output).

**`testflight.sh --check`** (runs now and is I12's done-when). In order, it fails on the first problem:
1. **Secrets.** `Secrets.xcconfig` exists and is not tracked (`git ls-files --error-unmatch` fails). Each of the four keys is non-empty (a `grep -c` count, never the value).
2. **Release build.** It runs `xcodegen`, then an `xcodebuild build -configuration Release -destination 'generic/platform=iOS Simulator'` (unsigned, simulator SDK).
3. **Bundle inspection:**
   - `PrivacyInfo.xcprivacy` is present;
   - `ITSAppUsesNonExemptEncryption` is false;
   - `CFBundleIconName` is AppIcon;
   - `CFBundleShortVersionString` is 2.0.0;
   - `nm`/`strings` find no `GalleryView`, `seedDemoLibrary`, `seedLargeLibrary`, `IrisSeed` or `DemoAddCatalogue` in the Release binary (Review Focus 4).
4. **Launch.** It installs and launches the Release build on the simulator, waits 3 s, checks that the process is still alive (`simctl spawn launchctl list`), and screenshots it to `apple/build/check-launch.png`.
5. **iPad warning.** A non-fatal note if `UISupportedInterfaceOrientations~ipad` lacks all four orientations (ITMS-90474).

**`testflight.sh --upload`** (written now, runs at I12b):
- **Environment.** It needs `IRIS_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_PATH`, and exits 2 with a checklist if any is missing.
- **Steps.** It runs `--check` first. Then it sets the build number with `agvtool new-version -all $(date +%Y%m%d%H%M)`, without committing it (it reverts `project.yml` if xcodegen wrote it, or passes `CURRENT_PROJECT_VERSION=` on the command line instead; the latter is preferred).
- **Upload.** It runs `xcodebuild archive -allowProvisioningUpdates` with the `-authenticationKey*` flags, then `-exportArchive` with `ExportOptions.plist` (`method app-store-connect`, `destination upload`). The export performs the upload.

- [ ] **Step 1, failing tests:**
  - `ReleaseReadinessTests`: the privacy manifest is in the bundle, parses, and declares UserDefaults CA92.1; `ITSAppUsesNonExemptEncryption` is false.
  - A bash self-test, `apple/scripts/testflight.sh --self-test`: `--upload` with no environment exits 2 and lists the four variables.

  Run → FAIL.
- [ ] **Step 2: Implement.** Run `--check` and read its output and the launch screenshot. Run the self-test. **Commit:** `build(iris): Release readiness and testflight.sh (check now, upload at I12b)`.

### Task 7: Docs, verification, review, merge

- [ ] **Fresh verification:** `npm run typecheck`, `npm test`, `apple/scripts/test.sh`, `apple/scripts/testflight.sh --check`, and `screenshots.sh` for the new sheets.
- [ ] **Docs:**
  - **Spec:** §8 I12 done-when becomes "`testflight.sh --check` passes", plus a new I12b row: "TestFlight upload + install — needs Developer Program; first `--upload`; expect ITMS-90474 unless iPad orientations are fixed".
  - **HANDOFF:** the I12 entry, including the steps you'll need to take: join the program; create the App Store Connect app `com.peds24.iris`; create an API key; set the four environment variables.
  - **DEVLOG:** the audit findings, performance numbers and rulings.
  - **apple/README** and the **scripts dictionary**: `testflight.sh`.
- [ ] **Review and merge.** Run the final review (opus) with this Review Focus. Fix Critical and Important findings test first, then merge, push and update memory. Next is I12b (when the account exists), then I13.
