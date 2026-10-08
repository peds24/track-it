# DEVLOG

## 2026-10-08 — Iris I6: component kit + Gallery

- `design/iris/components.md` specifies the ten components once, for every
  platform. `apple/Iris/DesignSystem/` is the SwiftUI reference rendering,
  and a DEBUG-only Gallery shows every state. 30 screenshots (light, dark,
  AX5) sit in `docs/design/iris/`, shown by `iris.html`.
- **Why presentational components**: what a row's detail line says
  ("S3 Ep 15 of 24", "Paused · Volume 31") is shelf logic. It ports with
  I7's shelves, next to the data that feeds it, rather than hiding inside
  the kit.
- **Why three name lists and tests between them**: `components.md`'s
  headings, Swift's `GalleryComponent`, and the generator's `COMPONENTS`
  must agree, and every component must have its PNGs. A component added in
  one place without the others turns jest or XCTest red. The tests check
  that the PNGs exist, not that they are current: regenerate them after a
  visual change.
- **Glass fallback is solid, not a blur**: Reduce Transparency asks for an
  opaque surface, so the fallback is the glass tint composited over the
  grouped secondary background. The final review caught that the first
  version painted the bare 35–70% tint. The token's `blur` is for
  platforms that composite their own blur.
- **Screenshots through `TEST_RUNNER_` env**: xcodebuild passes
  `TEST_RUNNER_IRIS_SCREENSHOT_DIR` to the UI-test runner as
  `IRIS_SCREENSHOT_DIR`. The simulator runner can write host paths, so the
  test saves PNGs straight into the repo. The script fixes the status bar
  at 9:41 and halves the 3x captures.
- **Gotchas found by looking, not by tests**: a `.bordered` button in a
  List row hid its own title until given `.labelStyle(.titleAndIcon)`, and
  a 44 pt frame on the label (not the button) clipped it. An HStack of chip
  + detail split "Show" into "Sho w"; the detail line is now one wrapping
  `Text` with the chip inlined. And `Category` in the app target resolves
  to Objective-C's, so the kit says `IrisCore.Category`.

## 2026-10-07 — Iris I5: catalogue providers

- `apple/IrisCore/Sources/IrisCore/Providers/` ports TMDB, Google Books,
  Metron and AniList; 180 recorded provider calls in `shared/providers/`
  replay with identical requests and results. The backfill and issue sync
  are ported too, with their scenarios.
- **Why record requests, not just results**: a provider is mostly the
  request it builds — URL encoding, Metron's Basic auth, AniList's GraphQL
  text. A Swift port that got any of it wrong would still pass a
  result-only test, then fail against the real API.
- **Why loose JSON (`JSONValue`) instead of Codable models**: the TS
  providers read responses with optional chaining and truthiness, so a
  missing or wrong-typed field degrades rather than failing the decode.
  Typed models would turn those into errors.
- **Quirks kept on purpose**: Metron's hand-rolled base64 encodes each UTF-16
  surrogate on its own (an emoji password differs from standard UTF-8), and
  a non-numeric AniList id is sent as `null`. Both platforms do the same,
  so the stored credentials work on both.
- **Gotcha**: the scenario id normaliser replaces ids by substring, so the
  TS tests' one-letter row ids (`a`, `e`) rewrote JSON keys (`f#1iled`). The
  scenarios use distinctive ids instead.

## 2026-10-07 — Iris I4: persistence on GRDB

- `apple/IrisCore/Sources/IrisCore/Persistence/` ports `src/db` and the
  repositories in `src/data` (tracks, addTrack, ratings, what's-new, backup);
  127 recorded scenarios replay identically.
- **Why recorded scenarios (A29)**: the user's choice over hand-mirrored
  tests — a data-layer change on android re-records, and Swift goes red.
- **Why not GRDB's migrator**: its bookkeeping table would make the schema
  differ; the TS `schema_version` table and migration strings are reused.
- **Why hand-written JSON column text**: JSONEncoder escapes "/", and
  `genres_json`/`seasons_json` text is compared across platforms.
- **Gotchas found**: `SELECT id FROM entry` with no ORDER BY reads the id
  index, so rows come back in random-id order — every multi-row inspection
  query orders by rowid. And `tsc` (no `include`) scanned GRDB's JS under
  `apple/DerivedData`; `tsconfig.json` now excludes `apple/`.
- **Review fixes**: a 1e19 ordinal (whole, so "valid") stored as a REAL in
  TS and trapped Swift's Int — both now require safe integers. Swift's
  writes are atomic on their own (savepoints), proven by tests that call
  them outside any transaction.

## 2026-10-06 — Iris I3: Swift domain port

- `apple/IrisCore/Sources/IrisCore/Domain/` ports all of `src/domain`, one
  file per TS file; XCTest replays all 380 `shared/fixtures` cases.
- **Why reproduce JS quirks**: TS is the reference. V8 accepts Feb 31 and
  24:00; toFixed rounds exact ties up; JS regex \d is ASCII; Swift's regex
  treats "\r\n" as one Character. Each became a "Swift parity" fixture
  first, then a JSCompat helper.
- **Why a calendar parameter**: the TS reads the process timezone; Swift
  takes `calendar: Calendar = .current`, so fixtures pin UTC and the app
  gets the device's day without a global.

## 2026-10-06 — Iris I2: shared behaviour fixtures

- `shared/fixtures/<module>.json` for all ten pure domain modules (322
  vectors), recorded from TS under TZ=UTC; `shared/schema/schema.sql`
  after migration 10. jest fails if TS stops matching either.
- **Why record instead of hand-writing expectations**: TS is the
  reference implementation; hand-written expectations would be a third
  opinion that could disagree with both. Each recording was checked
  against the original test's assertion.
- **Why `rankingScenario`**: a ranking session is a sequence; recording
  whole walks (oracle answers for every slot) holds Swift to the same
  opponent order, not just the slot.
- **Why a custom jest environment for UTC**: jest gives each test file a
  copy of `process.env`, so a test can't change the process timezone;
  `shared/fixtures/utcEnvironment.js` sets it on the real worker for the
  fixture file only and restores it after.

## 2026-10-06 — Iris I1: design tokens

- `design/iris/tokens.json` → `scripts/iris-tokens.js` → IrisTokens.swift,
  src/ui/iris/tokens.ts, design/iris/iris.css, docs/design/iris.html.
- **Why hand-rolled, not Style Dictionary**: four small outputs and no
  dependency to keep current; the generator is ~330 lines and tested.
- **Why a hash check in XCTest**: Swift tests can't run Node, so they
  verify the generated file's embedded SHA-256 against tokens.json; jest
  does the full regenerate-and-diff.
- Accent is Apple system blue; category tints are system colours.

## 2026-10-06 — Iris I0: native iOS foundations

- New `iris` branch and spec (A28): a native SwiftUI iOS app in `apple/`
  with its own Swift logic (`IrisCore`), held to the TS app by shared
  fixtures, and one design-token source for every platform.
- `apple/`: `IrisCore` package, `Iris` app, `IrisUITests`, `project.yml`,
  `scripts/test.sh`.
- **Why xcodegen**: two agents work this repo in parallel; a generated
  `.xcodeproj` can't produce `.pbxproj` merge conflicts.
- **Why a package for logic**: `swift test` runs it on the Mac in
  seconds with no simulator, which keeps the domain port's TDD loop fast.

## 2026-10-06 — v1.4.0: Ratings & Rankings release

- Version bumped to **1.4.0** (`package.json`, `app.json`). The planned
  Insights & Stats milestone moves to **v1.5.0**.
- **A27**: what's-new on first launch (`src/domain/whatsNew.ts`,
  `src/data/whatsNew.ts`, `src/ui/WhatsNew.tsx`, `src/ui/releaseNotes.ts`,
  migration 10 `app_meta`) and the version line in Done's ? sheet.
- **Why a table, not AsyncStorage**: the app already owns one SQLite
  database and its migration runner; adding a native storage module for
  one string would mean a new native dependency and a rebuild for no gain.
- **Why skip fresh installs**: "What's new" only means something relative
  to a previous version. An empty library with no stored version is a new
  user; one with tracks is an upgrade from a pre-A27 build.

## 2026-10-06 — Beli-style ratings; expandable descriptions

### What Changed
- `src/domain/rating.ts`: sentiment bands, `scoreAt`/`scoresFor`,
  `similarity`, `pickOpponent`, ranking session (`startRanking`/`answer`),
  `placeInRanking`, `matchupReason`. Pure, fully unit-tested, including an
  oracle test that every insertion slot is reachable.
- `src/data/ratingRepo.ts` + migration 9 (`rating` table); `deleteTrack`
  and backups updated.
- Genres: `TrackMetadata.genres`, `src/domain/genres.ts`, all four
  providers, migration 8 (`genres_json`), backfill revisit.
- UI: Rate modal, Rankings screen, detail-screen rating card, Done-row
  score/Rate, finish prompt on Currently/Backlog/detail.
- `src/ui/ExpandableText.tsx` on Add confirm + detail screen.
- Decision record: **A26**.

### Design Decisions & Trade-offs
- **Store order, derive scores.** A rating's score depends on everything
  ranked around it; storing it would mean rewriting a category's scores on
  every insert and risking drift. Positions are rewritten per insert
  (small lists, one transaction); scores never are.
- **Middle-half opponent choice.** Pure similarity-picking would let the
  search stall on one end of the list; pure midpoint ignores the "tough
  matchup" goal. Choosing the most similar track inside the middle half
  of the window keeps ≥25% shrink per answer (≈log₄⁄₃ n worst case —
  ≤12 questions for 30 tracks in tests) while still pairing same-creator
  and same-genre tracks.
- **Mid-slice scoring.** Anchoring the top at 10.0 made the second rating
  jump the first from 8.5 to 10.0; spacing each track at the middle of
  its slice keeps scores stable as a list grows.
- **Prompt, don't force.** Beli routes straight into ranking after a
  visit; here finishing is often a one-tap row action, so an alert with
  Later is less disruptive, and the Rate button stays on the Done row.
- **Genres via the existing backfill.** Revisiting A22-stamped rows once
  (NULL `genres_json`) reuses the paced, failure-tolerant path rather
  than adding a second one.

## 2026-09-24 — v1.3.0: Polish from v1.2.0 Feedback

### What Changed
- **Sharper covers**: `sharpCoverUrl` / `googleBooksImage` in
  `src/providers/images.ts`. Providers store TMDB `w780`, AniList
  `extraLarge`, Google Books `fife=w600`; `trackRepo.metadataOf` applies
  the same rewrite on read, so rows stored at the old sizes sharpen too.
- **Book search** (`googleBooks.ts`): `intitle:` query with a plain-query
  fallback, `printType=books`, ISBN-only results, knock-off titles
  dropped, cover+author ranked first, same title+author deduped.
- **Comic advance** ported from Longbox: `MetadataProvider.unitAt`
  (Metron only) and `src/data/syncSeriesUnit.ts`, called after
  advance/set-position on Currently, Backlog, Done and the detail screen.
- **Add screen**: count field and ongoing toggle removed; hand-typed
  series are always ongoing.
- **Feedback**: Done header button, compose sheet, `mailto:` draft to
  the developer (`src/ui/feedback.ts`).
- Decision record: **A25**. Planned Insights & Stats moved to v1.4.0.

### Design Decisions & Trade-offs
- **Rewrite on read, not a migration.** Upgrading stored cover URLs by
  pattern costs nothing and needs no network. A backfill re-run was
  the alternative, but the backfill `COALESCE`s (fills gaps only), so
  it would not have replaced existing covers without changing its
  contract.
- **`fife` over `zoom` for Google Books.** Measured against the live
  image server: `zoom=3` gives 575px for modern volumes but a 575×92
  "image not available" strip for scanned ones; `fife=w600` gives the
  largest real scan (600px modern, 300px scanned) and never the strip.
- **ISBN as the "real book" signal.** `printType=books` changed nothing
  in live results. Every journal/report/proceedings hit had no ISBN
  (or only an `OTHER` identifier); every real edition had one. It will
  also drop an occasional genuine ISBN-less record (some very old
  books) — accepted, since those are rarely what someone is tracking.
- **Comic sync outside `advanceEntry`.** Keeping the network hop out of
  the data write means an advance is instant and can't fail offline;
  the cover catches up a second later. `external_id` moves with the
  issue, so the A22 backfill and the next sync start from the current
  issue rather than the originally matched one.
- **One filtered Metron request instead of Longbox's full issue list.**
  `/issue/?series_id=&number=` is exact and paging-free; Longbox read
  only the first page of `issue_list`, which silently broke for series
  over 100 issues.
- **Always-ongoing for hand-typed series** rather than keeping a hidden
  default count. A guessed total produced wrong progress ("3 of 12");
  ongoing plus Complete (A23) covers finite runs without asking.
- **`mailto:` feedback.** No backend exists (D6), and a form service
  would need a third-party account and key shipped in the app. Cost:
  the user must have a mail app and press send themselves.

### Architecture State
- New optional provider method `unitAt`; new data module
  `syncSeriesUnit`; `UNIT_TITLE` exported from `trackRepo`.
- No schema migration. No new native modules (no rebuild needed).
- Verified on the Pixel_10 emulator (Expo Go): Metron comic cover moved
  #1 → #2 → #3 across row and detail advances; book search showed only
  real editions; hand-typed show added as ongoing with no count field;
  Feedback sheet opened Gmail.

## 2026-09-23 — v1.2.0: Track Detail, Cover Art, Better Search & Manual Complete

### What Changed
- New detail screen `app/track/[kind]/[id].tsx`, modelled on Longbox's
  `comic/[id].tsx`: cover, creator, meta line, progress, timeline stats,
  collapsible description, and the row's own actions. Rows now open it on
  tap; long-press still renames (A15).
- Migration 7 adds `cover_url`, `creator`, `description`, `release_year`,
  and `metadata_checked_at` to both `series` and `entry` — display-only,
  D3 untouched. `backup.ts` round-trips all five.
- Every provider (Google Books, TMDB, Metron, AniList) gained a
  `details(externalId)` method used both at add time and by a one-time
  first-launch backfill (`src/data/backfillMetadata.ts`) for existing
  catalogue-matched rows. Hand-typed rows are never touched.
- `cleanDescription` (`src/domain/formatters.ts`) replaces AniList's local
  `stripHtml` with one whitelist-based tag strip + entity decode used
  everywhere descriptions render.
- Manual completion: a deep left-swipe (`completeUnits` in `advance.ts`)
  marks every remaining unit done, confirmed first. For an ongoing series
  it drops the trailing auto-appended placeholder unit instead of
  completing it.
- Search results and the confirm screen show a thumbnail, creator, and
  year pulled from the search response itself. The confirm screen's back
  button now returns to the search screen with the query and results
  intact, replacing "Nope, search again" (A17).
- Full amendment record: A22 (metadata/detail screen, reverses "Text is
  the artwork"), A23 (manual complete), A24 (search disambiguation,
  back-to-search) in `docs/superpowers/specs/2026-08-12-track-it-design.md`.

### Design Decisions & Trade-offs
- **RN `Image` over `expo-image`.** `expo-image`'s caching would have been
  nice, but it needs a native rebuild, and this milestone has to land on
  `web` too (CLAUDE.md §6). RN's built-in `Image` needs neither and works
  on both platforms from the same pass — the right trade for a first cut;
  revisit if cover-heavy screens end up needing real caching.
- **`metadata_checked_at` stamp vs. re-querying every launch.** A stored
  "have we asked" flag is a second source of truth in the abstract, but
  the alternative — hitting Metron/TMDB for every row on every cold start
  — would burn rate limit for data that essentially never changes once a
  catalogue match exists. The stamp is intentionally *not* set on a
  failed lookup (network down, missing key), so a row only in a bad state
  transiently gets retried instead of permanently stuck coverless.
- **The ongoing-completion fingerprint (`createdAt === predecessor's
  finishedAt`) has a known limit.** It is correct for every unit
  `appendNextOngoingEntry` (A4) actually produces, but it's a timestamp
  match, not a stored flag — a manually-added trailing unit that happens
  to land on the exact same tick as its predecessor's finish would be
  misread as the placeholder and dropped instead of completed. Accepted
  as a real but vanishingly unlikely edge case rather than adding a
  column to disambiguate a scenario that has never actually occurred.
- **Why TMDB search shows no creator.** Confirmed against the live API:
  TMDB's `/search/tv` and `/search/movie` responses carry no credits at
  all — only the per-item `/tv/{id}` / `/movie/{id}` fetch `hydrate()`
  already makes does. Rather than firing a credits lookup per search
  result (a real cost, and against A9's "search is progressive
  enhancement, not a blocking requirement" precedent), TMDB rows simply
  show no creator subtitle; Google Books and AniList do, since both
  return author/staff in the search response itself.
- **Whitelist-based `cleanDescription`, and an idempotency bug caught in
  review.** An early version decoded entities *then* stripped tags, which
  meant a decoded `&lt;b&gt;` became a literal `<b>` that a second pass
  through the same function would then strip as if it had been real
  markup all along — harmless on a fresh fetch, but wrong the moment the
  render-time defensive pass (applied again for older rows/blurbs) ran on
  already-cleaned text. Fixed by stripping tags first, decoding entities
  second, so a second call on already-clean text is a no-op
  (`fix(domain): make cleanDescription idempotent on decoded brackets`,
  `7c80c9a`).

### Verification
- **Done on-device:** Pixel_10 emulator via Expo Go — detail screen with
  and without a cover, the search result list with thumbnails, confirm →
  back → search (query/results preserved), and the swipe-to-Complete
  gesture on both a finite and an ongoing series.
- **Could not verify:** barcode scan → back navigation. Expo Go's camera
  module works on the emulator, but the emulator has no way to present a
  real barcode to scan, so that specific path (scan → result → back to
  search) is unverified beyond typecheck/tests and code review.
- `npm run typecheck` and `npm test` both green before this commit (see
  commit message for counts).

## 2026-09-03 — Feature Roadmap (v1.1.0 – v2.0.0) & Version Release Workflow

### What Happened
- Defined comprehensive architectural breakdown and roadmap in [`docs/ROADMAP.md`](./docs/ROADMAP.md) and root [`ROADMAP.md`](./ROADMAP.md) covering:
  - **Milestone v1.1.0**: Status notifications, action feedback (Snackbar/Toast), full undo support across advance/pause/delete, and completion celebrations.
  - **Milestone v1.2.0**: Individual track detail views, cover artwork persistence, cleaned metadata formatting, and timeline metrics.
  - **Milestone v1.3.0**: Dedicated stats and reading/watching insights page with shareable graphic cards via `expo-sharing`.
  - **Milestone v2.0.0**: The "Iris" Evolution (rebranding, modern Apple-inspired glass design system, new aperture mark).
- Initialized formal [`CHANGELOG.md`](./CHANGELOG.md) adhering to the Keep a Changelog standard and Semantic Versioning.
- Created `.claude/skills/version-release/SKILL.md` establishing the step-by-step feature implementation, testing, version bumping, changelog recording, and cross-branch synchronization protocol.

### Design Decisions & Trade-offs
- **Derived Stats vs Aggregation Tables**: Preserved D3/D8 invariant — all statistics and velocity calculations are computed on-the-fly from SQLite timestamps (`started_at`, `finished_at`, `created_at`) rather than maintaining fragile secondary summary tables.
- **Undo Architecture via State Inversion**: Action feedback allows instant undo by computing inverse state deltas in pure domain logic (`src/domain/undo.ts`) rather than keeping shadow database tables.
- **Gradual Evolution to Iris (v2.0.0)**: Rather than attempting an immediate disruptive rebrand while core tracking features are still evolving, the Iris transition is scheduled as the v2.0.0 major milestone once feature completeness (detail views and stats) is stabilized.



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











