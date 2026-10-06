# v2.0.0 "Iris" — Native iOS App & a Cross-Platform Design Language

**Date:** 2026-10-06
**Milestone:** ROADMAP v2.0.0 (Iris rebrand), expanded: Iris now starts as a
native SwiftUI iOS app, and its design language later takes over Android and
web.
**Branches:** long-lived integration branch `iris`, cut from
`claude/practical-knuth-20yw3y` (android + A26 ratings) at `65b3b39`,
then synced with `android` at `276375c` (v1.4.0, A26–A27) once that work merged there. Each step
is a `worktree-iris-<slug>` branch merged into `iris` with `--no-ff`.
**Decision record:** adds **A28** to `2026-08-12-track-it-design.md`.

---

## 1. Intent

What the user asked for (2026-10-06), in their words where it matters:

- "A new branch for an iOS version of the app, call it the IRIS update."
- "The rebrand to Apple's design language and fundamentals — take the logic
  from the Android version and plug it into Apple's design principles."
- "It should also be written in Swift native for iOS."
- "After the iOS version is stable, this design language will take over on all
  other platforms — so begin to figure out a way so that the design is
  consistent."

Decisions taken in brainstorming:

| Question | Decision |
| --- | --- |
| Branch model | `iris` integration branch, not a permanent fourth platform branch |
| Base | The ratings branch, so Iris redesigns Rate/Rankings too |
| Rebrand | Yes — the app becomes **Iris** (name, icon, scheme) |
| "Swift native" | A full SwiftUI app with its own Swift logic layer — not an Expo shell hosting SwiftUI views |
| Where it lives | Same repo, `apple/` directory, on `iris` |

**Success looks like:** an iOS app a user would take for a first-party Apple
app, with feature parity with Android at the time of cut-over, provably the
same behaviour (shared fixtures), and a design source that Android and web
can adopt without a second redesign.

**Assumptions (correct these if wrong):** iOS 26 is the minimum target, so
Liquid Glass is available without fallbacks on iOS; no iOS build has shipped
to the App Store yet, so the bundle ID is free to choose; the TS app remains
the Android/web codebase indefinitely — there is no plan to replace it with
Kotlin.

## 2. Architecture

Two codebases, one product. Each has a logic half and a UI half:

```
                ┌──────────────── shared/ ────────────────┐
                │ fixtures/*.json   behaviour test vectors │
                │ schema/           SQLite schema snapshot │
                └───────▲──────────────────────────▲───────┘
                        │ jest                      │ XCTest
┌───────── TS (Android, web) ─────────┐   ┌──────── apple/ (iOS) ─────────┐
│ src/domain   src/data   src/db      │   │ IrisCore (Swift package)      │
│ src/providers                       │   │   Domain · Persistence · Prov │
│ app/ + src/ui  (M3 today, Iris I13) │   │ Iris (SwiftUI app target)     │
└──────────────────▲──────────────────┘   └──────────────▲────────────────┘
                   │ tokens.ts / iris.css                │ IrisTokens.swift
                ┌──┴──────────── design/iris/ ───────────┴──┐
                │ tokens.json   single source of the look   │
                │ components.md the shared component contract│
                └───────────────────────────────────────────┘
```

### 2.1 `apple/` layout

```
apple/
  project.yml                 xcodegen spec — the .xcodeproj is generated, not committed
  IrisCore/                   Swift package, no UIKit/SwiftUI imports
    Sources/IrisCore/
      Domain/                 ports of src/domain/*.ts, one file per TS file
      Persistence/            GRDB database, migrations 1–10, repositories, backup
      Providers/              TMDB, Google Books, Metron, AniList, manual
    Tests/IrisCoreTests/      fixture runners + Swift-only tests
  Iris/                       SwiftUI app target
    App/                      IrisApp, root TabView, dependency wiring
    DesignSystem/             IrisTokens.swift (generated) + component kit
    Features/                 Shelves, TrackDetail, Add, Rate, Rankings, Gallery
    Resources/                Assets.xcassets, Localizable.xcstrings
  IrisUITests/                screenshot + smoke tests
```

The layer rule that `src/domain` obeys carries over unchanged: **`IrisCore`
does no UI and its `Domain/` does no I/O.** The app target depends on
`IrisCore`; never the reverse.

### 2.2 Swift choices

- **Swift 6, strict concurrency.** Repositories are `Sendable` and async;
  views use `@Observable` models.
- **Persistence: GRDB.swift.** Plain SQLite, so the schema can be the *same*
  schema — not a lookalike — and SQL in `src/db/schema.ts` and
  `src/data/*.ts` ports nearly verbatim. SwiftData was rejected: it owns its
  own schema, which would make the shared-schema fixture and cross-platform
  backup impossible.
- **Networking:** `URLSession` + `Codable`. No third-party networking.
- **API keys:** an `.xcconfig` that is git-ignored, mirroring `.env` on the TS
  side; a committed `Secrets.example.xcconfig` documents the names.
- **Barcode scanning:** VisionKit `DataScannerViewController`.
- **Project generation:** `xcodegen` (installed). Only `project.yml` is
  committed, so two agents never fight over `.pbxproj` merge conflicts.

## 3. Keeping the logic in sync — shared fixtures

Porting ~3,900 lines of TS into Swift creates two implementations that will
drift unless something forces them not to. The force is a set of
language-neutral test vectors:

```jsonc
// shared/fixtures/advance.json
{
  "function": "advance",
  "cases": [
    { "name": "watch mode: unstarted → done",
      "input": { "mode": "watch", "entries": [ ... ] },
      "expected": { "changed": [ ... ] } }
  ]
}
```

- One file per pure domain module: `advance`, `shelf`, `rating`
  (`scoreAt`, `similarity`, insertion), `seasons`, `formatters`, `validate`,
  `seriesTitle`, `genres`, `mode`, `whatsNew` (`announcementFor`).
- Jest gets a generic runner (`src/domain/__tests__/fixtures.test.ts`) that
  maps `function` to the TS export; XCTest gets the mirror. **Both suites run
  every case.** A behaviour change on either side without a fixture update
  turns that side red.
- The existing TS unit tests stay. Fixtures are *extracted* from them (and
  added to), not a replacement — the TS tests remain the most readable
  description of intent.
- **Schema fixture:** `shared/schema/schema.sql` is the `sqlite_master` dump
  after all migrations. A jest test and an XCTest each migrate an empty
  database and compare. Same schema ⇒ the backup JSON format (`backup.ts`,
  version-checked) moves between platforms, which matters on migration day.
- Dates are passed as ISO strings and a fixed `now`, so no fixture depends on
  the clock.

**New-feature rule while both codebases exist:** a feature that changes
domain behaviour lands its fixture first, then both implementations. Android
remains the place features are designed (CLAUDE.md §6); `iris` ports them to
Swift the way `web` ports them to RN Web today.

## 4. Keeping the design in sync — one token source, one component contract

### 4.1 Tokens

`design/iris/tokens.json` is the single source of the look. A generator
(`scripts/iris-tokens.mjs`, Node, no dependencies) writes three outputs:

| Output | Consumer |
| --- | --- |
| `apple/Iris/DesignSystem/IrisTokens.swift` | iOS |
| `src/ui/iris/tokens.ts` | Android + web (from I13) |
| `design/iris/iris.css` | web, the `gh-pages` landing page, `docs/design/iris.html` |

Generated files carry a header saying so and are committed (so builds don't
need Node). A jest test and an XCTest regenerate in memory and fail if the
committed output is stale.

Token groups, all **semantic** (named for purpose, never for a hue):

- **Color** — light and dark values for: `background`, `groupedBackground`,
  `secondaryGroupedBackground`, `label`, `secondaryLabel`, `tertiaryLabel`,
  `separator`, `fill`, `accent`, `onAccent`, `destructive`, plus one
  `category.<kind>` tint per media category (show, movie, book, comic,
  manga). On iOS the neutrals map to the system dynamic colours
  (`.label`, `.systemGroupedBackground`…) so they track accessibility
  settings like Increase Contrast; the JSON holds their published values so
  other platforms can match.
- **Type** — Apple's text styles (`largeTitle`, `title1–3`, `headline`,
  `body`, `callout`, `subheadline`, `footnote`, `caption1–2`) with size,
  weight, leading and tracking. iOS uses the real text styles (Dynamic Type
  for free); other platforms use the numbers with a system font stack
  (SF Pro where available, Inter elsewhere).
- **Space** — a 4-pt scale; **radius** — `control`, `card`, `sheet`, `pill`
  (continuous corners on iOS).
- **Motion** — named springs (`snappy`, `smooth`, `bouncy`) as
  response/damping pairs, which map to SwiftUI `.spring(response:dampingFraction:)`
  and to CSS/Reanimated equivalents.
- **Material** — `glass.regular`, `glass.clear`, and their non-glass
  fallbacks (blur radius + tint + border) for platforms without Liquid Glass
  or when Reduce Transparency is on.

### 4.2 Component contract

`design/iris/components.md` names each component once and specifies its
contract — purpose, anatomy, states, behaviour, accessibility — independent
of platform. iOS implements it first in SwiftUI and is the **reference
rendering**; the TS kit (`src/ui/iris/`) implements the same names in I13.
Initial vocabulary:

`IrisShelfRow` (cover, title, progress line, primary action) ·
`IrisCover` · `IrisProgress` · `IrisCategoryChip` · `IrisPrimaryButton` ·
`IrisSheet` (detents) · `IrisEmptyState` · `IrisRatingBadge` ·
`IrisComparisonCard` (Rate's "which did you prefer?") · `IrisSymbol`
(SF Symbol name → each platform's equivalent glyph, mapped in the contract).

Where SwiftUI's own control *is* the right answer (`List`, `Form`, `Menu`,
`TabView`, `.searchable`, `.swipeActions`, `.contextMenu`), iOS uses it
directly and the contract documents the behaviour other platforms must match,
rather than wrapping it in an Iris type for its own sake.

### 4.3 Visual parity check

`docs/design/iris.html` (generated from the tokens + hand-written component
specimens, using `iris.css`) is the living design reference, replacing the
role `design-language.html` played. iOS screenshots from `IrisUITests` sit
beside it so drift is visible by eye; when I13 builds the TS kit, Playwright
screenshots of the web build join them.

## 5. Apple fundamentals — the per-screen checklist

Every screen step (I7–I10) is done only when it satisfies this list, checked
on the simulator in light and dark:

1. Navigation: `NavigationStack`, large title that collapses on scroll;
   the tab bar is the system Liquid Glass `TabView`.
2. Lists are system lists (inset-grouped or plain, chosen per screen), with
   `.swipeActions` for the row's commit actions and `.contextMenu` for the rest.
3. Secondary flows are sheets with detents, not pushed full screens; destructive
   confirmations are `confirmationDialog`.
4. SF Symbols for every icon; no bitmap glyphs.
5. Dynamic Type up to AX5 without truncating primary content.
6. VoiceOver labels and actions on every interactive element; rows read as
   one element with custom actions.
7. Minimum 44×44 pt hit targets.
8. Haptics (`.sensoryFeedback`) on commit actions: advance, finish, rate.
9. Reduce Motion swaps springs for fades; Reduce Transparency swaps glass for
   the solid fallback.
10. No custom chrome where the system provides it — the content (covers,
    titles) carries the colour; the interface is the quiet frame (the
    ROADMAP's Iris "content-first" pillar).

## 6. Screen map (Android → Iris iOS)

| TS screen | Iris iOS |
| --- | --- |
| `(tabs)/index` Currently | Tab "Now" — list of in-progress tracks, swipe to advance |
| `(tabs)/backlog` | Tab "Up Next" — grouped by category, swipe to start |
| `(tabs)/done` | Tab "Finished" — rating badge per row; toolbar → Rankings |
| `track/[kind]/[id]` | Pushed detail: hero cover, metadata, `ExpandableText`, rating card, actions |
| `add` | Sheet with `.searchable`, provider results, scan button → VisionKit |
| `rate/[kind]/[id]` | Sheet: sentiment step, then comparison cards |
| `rankings` | Pushed list, segmented category picker (no "All", per A26) |

Tab names are proposals for I7, not decisions; they stay "Currently / Backlog
/ Done" unless changed there.

## 7. Rebrand

- Display name **Iris**; URL scheme `iris`; new aperture mark per ROADMAP
  v2.0.0 (icon, iOS 26 layered/tinted icon variants, launch screen).
- iOS bundle ID: decided in I11. Proposed `com.peds24.iris`.
- Android keeps `com.peds24.trackit` at takeover (I13) so existing local
  databases survive — renaming an Android package is a new app to the OS.
- Repo name, `app.json` slug and the landing page URL change only at
  takeover, as part of I13, not before.

## 8. Steps

Each step is its own `worktree-iris-<slug>` branch, its own plan under
`docs/superpowers/plans/`, and a `--no-ff` merge into `iris` once its
verification passes. Steps in the same column can run in parallel.

| # | Step | Depends on | Done when |
| --- | --- | --- | --- |
| **I0** | **Foundations** — this spec, A28, CLAUDE.md §6 `iris` row, HANDOFF, `apple/project.yml` with an empty app + `IrisCore` package that builds and runs in the simulator, `apple/README.md` | — | `xcodebuild test` green on an empty test; app launches in simulator |
| **I1** | **Tokens** — `tokens.json`, generator, three outputs, staleness tests | I0 | Both suites check staleness; `iris.html` renders |
| **I2** | **Fixtures** — extract vectors for every pure domain module, jest runner, schema snapshot | I0 | `npm test` runs every fixture; TS unchanged |
| **I3** | **Domain port** — `IrisCore/Domain`, XCTest fixture runner | I2 | Every fixture case passes in Swift |
| **I4** | **Persistence** — GRDB, migrations 1–10, repositories (track, rating, addTrack, whatsNew/`app_meta`), backup import/export | I3 | Schema fixture matches; a TS backup imports on iOS and round-trips |
| **I5** | **Providers** — TMDB, Google Books, Metron, AniList, manual, metadata backfill, `syncSeriesUnit` | I3 | Recorded-response tests per provider |
| **I6** | **Component kit + Gallery** — `components.md`, SwiftUI kit, debug-only Gallery screen | I1 | Gallery screenshots, light/dark, AX5 |
| **I7** | **Shelves** — Now/Up Next/Finished tabs, advance/start/pause/delete | I4, I6 | §5 checklist; screenshots |
| **I8** | **Track detail** — incl. position editor (A12), rating card | I7 | §5 checklist |
| **I9** | **Add** — search, provider results, barcode scan, add-to-Watched → rate prompt | I5, I7 | §5 checklist; real search on device/simulator |
| **I10** | **Rate + Rankings** | I7 | §5 checklist; a three-track ranking session walks through |
| **I11** | **Rebrand** — name, mark, icons, launch screen, bundle ID | I6 | Icon renders in all variants |
| **I12** | **iOS hardening + TestFlight** — a11y audit, performance on a 1,000-track library, EAS or Xcode Cloud TestFlight | I7–I11 | TestFlight build installed on a device |
| **I13** | **Takeover** — `src/ui/iris/` TS kit from the same tokens + contract, migrate Android screens, merge `iris` → `android`, port to `web`, re-skin `gh-pages` from `iris.css`, rename app on Android/web | I12 stable | Android/web screenshots match the iOS reference |

I1 and I2 can run in parallel after I0; so can I4/I5/I6 after their
dependencies. I13 will need its own brainstorm — it is listed so the shape is
agreed, not designed in detail here.

## 9. Branch hygiene while `iris` lives

- `iris` is a fourth long-lived branch until I13 merges it into `android`.
  The same rule as §6 of CLAUDE.md applies: no direct commits; work branches
  merge in with `--no-ff`.
- **Sync from `android` weekly or whenever android gains a domain change**
  (`git merge android` into `iris`, via a `worktree-iris-sync-<date>` branch).
  Any domain change in that merge needs a fixture update and a Swift port in
  the same sync — otherwise iOS silently falls behind.
- The ratings branch this was cut from merged into `android` as v1.4.0;
  `iris` absorbed that (plus A27's what's-new and migration 10) in its
  first sync, before any Swift code existed.

## 10. Testing

- **IrisCore:** XCTest — fixtures (behaviour), schema snapshot, in-memory GRDB
  repository tests mirroring `src/data/__tests__`, provider tests on recorded
  JSON responses (no live network in tests).
- **Iris app:** a handful of UI smoke tests (launch, add a manual track,
  advance it, finish it, rate it) plus screenshot capture for every screen in
  light/dark — run with `xcodebuild test -scheme Iris -destination 'platform=iOS Simulator,name=iPhone 17'`.
- **TS side:** fixture runner, schema snapshot, token staleness — all in the
  existing `npm test`.
- Passing tests is necessary, not sufficient (CLAUDE.md §3): each UI step
  boots the app in the simulator and looks.

## 11. Risks

- **Two logic implementations drift.** Mitigated by fixtures; residual risk
  is behaviour that only exists in the data layer (SQL). The repository test
  suites mirror each other for that reason.
- **Android keeps moving while iOS catches up.** The weekly sync rule above;
  if feature velocity on android outpaces the port, pause new android
  features at a known point rather than chasing a moving target.
- **Metron/AniList/TMDB keys in a shipped binary.** Same exposure as the
  Android build today; noted, not solved here.
- **Scope.** This is a rewrite of the client. Every step ends at a usable,
  merged state on `iris`, so stopping after any step leaves nothing broken.

## 12. Out of scope

iPad-specific layouts (it runs; it is not tailored), widgets, Live
Activities, iCloud sync, Apple Watch, a Kotlin Android rewrite. Each is a
natural follow-up once I12 ships and is listed here so it is not smuggled
into a screen step.
