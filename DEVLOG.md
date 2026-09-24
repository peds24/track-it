# DEVLOG

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











