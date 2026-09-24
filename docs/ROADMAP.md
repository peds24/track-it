# Track-it (Iris) — Feature Roadmap & Architectural Blueprint

**Status:** Proposed Roadmap & Implementation Architecture  
**Target Versions:** v1.1.0 → v2.0.0  
**Baseline Version:** v1.0.0 (Expo SDK 57 / React Native 0.86 / TypeScript Strict)  

---

## 1. Executive Summary & Vision

This roadmap establishes the technical implementation plan for the four major evolutions of `track-it`:

1. **Status Notifications, Action Feedback & Undo Stack**: Reliable undo mechanisms for advance, pause, and delete operations across all shelves, paired with celebration moments on completing media. **Still pending** as of 2026-09-23 — v1.2.0 (below) shipped ahead of it.
2. **Reading & Watching Insights (Stats Engine)**: Automated completion metrics, averages, category distributions, velocity metrics, and shareable graphic cards built on top of existing database timestamps.
3. **Individual Track Details & Formatted Metadata**: Rich detail view for every item displaying full synopses, creator/author credits, persistent cover artwork, time-in-progress statistics, and inline action controls. **Shipped as v1.2.0, 2026-09-23** — see `CHANGELOG.md` and amendments A22–A24 in `docs/superpowers/specs/2026-08-12-track-it-design.md`.
4. **The "Iris" Evolution (Rebrand & Modern Glass UI)**: Transitioning from the current Material 3 theme to **Iris** — a refined, Apple-inspired human interface characterized by clean simplicity, subtle translucency (`expo-blur`), purposeful micro-animations, and a new camera/aperture brand identity.

---

## 2. Architectural Principles & Invariants

All new features must strictly conform to existing architectural invariants:

* **Pure Domain Boundary (`src/domain/`)**: Zero I/O, zero database queries, zero React/UI dependencies. Pure TypeScript functions taking plain objects and returning new state. All calculations (stats, undo state deltas, formatting) live here.
* **Derived Truth (`D3`)**: Progress and statistics are computed dynamically at read time from `entry` timestamps (`created_at`, `started_at`, `finished_at`) and `series` rows — never stored as redundant counter columns that can drift.
* **Unified Model (`D1`)**: All tracked items are either standalone `Entry` rows (books, movies, comic collections) or parent `Series` rows with child `Entry` rows (shows, comic issues, manga volumes).
* **Local-First Privacy (`D6`)**: Local SQLite database via `expo-sqlite`. External providers (`src/providers/`) are read-only metadata enrichers; the app never requires an account or cloud sync.
* **Test-Driven Discipline**: Every state transition and domain computation must have corresponding unit tests before UI integration.

---

## 3. Detailed Feature Breakdown & Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ROADMAP MILESTONES                             │
├──────────────────────┬──────────────────────┬───────────────────────────────┤
│ v1.1.0: Feedback &   │ v1.2.0: Track Detail │ v1.3.0: Insights &   │ v2.0.0 │
│ Undo Architecture    │ & Cover Artwork      │ Stats Page           │ "Iris" │
└──────────────────────┴──────────────────────┴───────────────────────────────┘
```

---

### Milestone v1.1.0: Status Notifications, Action Feedback & Celebrations

#### User Goals
* When advancing a track ("Done"), pausing it ("Pause" / return to backlog), or deleting it, display a clear confirmation notification with action details and a visible **Undo** option.
* Make this feedback uniform across all screens (**Currently**, **Backlog**, and **Done**).
* When a track is completely finished (last episode watched, final volume read, or standalone item completed), trigger an extra special celebration experience with celebratory animation/emojis and rewarding tactile feedback.

#### Architectural Breakdown

```
[User Action] ──> [Optimistic Action or Staged Operation]
                          │
                          ▼
            [ActionSnackbar / Toast Overlay] (Floating 4-5s)
               ├── Action Description: "Marked Episode 12 as Watched"
               ├── Action Button: [UNDO]
               └── Timer: Auto-commits or dismisses
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      [Undo Clicked]           [Timer Completes]
   Reverts via Domain       Finalizes if staged /
   State Inversion          Dismisses overlay
```

1. **Domain Layer (`src/domain/undo.ts`)**:
   * Implement invertible action definitions:
     ```typescript
     export type InvertibleAction =
       | { type: 'advance'; entryId: string; previousStatus: Status; previousStartedAt: string | null; previousFinishedAt: string | null }
       | { type: 'return_to_backlog'; trackKind: 'series' | 'entry'; trackId: string; previousPaused: boolean; previousChildStates?: Array<{ id: string; status: Status; startedAt: string | null; finishedAt: string | null }> }
       | { type: 'delete'; snapshot: SerializedTrackSnapshot };
     ```
   * Add pure inversion functions:
     * `canRevertAdvance(entry: Entry): boolean`
     * `computeRevertAdvance(entry: Entry): Partial<Entry>` — reverts `done` → `in_progress` (for read mode), `in_progress` → `unstarted` (for read mode), or `done` → `unstarted` (for watch mode).
   * Add pure completion detector:
     * `isTrackFullyCompleted(track: TrackSummary, updatedEntry: Entry): boolean` — returns `true` if this advance moved the final entry of a series to `done`, or completed a standalone movie/book.

2. **Data Layer (`src/data/trackRepo.ts`)**:
   * Implement `revertAdvanceEntry(db: SqlDriver, entryId: string, previousState: InvertibleAction): Promise<void>`.
   * For deletions: Implement staged / delayed deletion or snapshot restoration via `restoreTrackSnapshot(db: SqlDriver, snapshot: SerializedTrackSnapshot): Promise<void>`.

3. **UI & Components Layer (`src/ui/feedback/`)**:
   * **`ActionFeedbackProvider.tsx` & `useActionFeedback()`**:
     * Global context rendered at the root of `app/_layout.tsx`.
     * Manages an active toast stack with timer (4–5 seconds default).
     * Accessible snackbar floating above the bottom navigation bar (`elevation.level3`, `surfaceContainerHighest` background, contrasting action text).
   * **Celebration Component (`src/ui/feedback/CelebrationOverlay.tsx`)**:
     * Triggers when `isTrackFullyCompleted` evaluates to `true`.
     * Visual: High-framerate confetti burst with celebratory emojis (`🎉`, `✨`, `🏆`, `🍿`, `📚`) using React Native Animated / subtle spring physics.
     * Haptics: Integrated with `expo-haptics` (`notificationAsync(NotificationFeedbackType.Success)`).
     * Modal or banner dismisses gracefully after 2.5 seconds or on tap.

---

### Milestone v1.2.0: Individual Track Pages, Cover Art & Formatted Metadata — Shipped 2026-09-23

> Landed as designed below, plus two additions agreed alongside it: search-result
> disambiguation and manual completion (including for an ongoing series). See
> `CHANGELOG.md`'s `[1.2.0]` entry and amendments A22–A24 in
> `docs/superpowers/specs/2026-08-12-track-it-design.md` for what actually shipped,
> including the places implementation diverged from this plan (`app/track/[kind]/[id].tsx`
> rather than `app/track/[id].tsx`; RN's built-in `Image` rather than `expo-image`).

#### User Goals
* Tapping a track row anywhere brings up a dedicated **Individual Track Page** (or interactive sheet) mirroring and expanding upon the Add confirmation view.
* Displays: Title, Creator/Author/Director, Formatted Details (genres, publication year, release dates, runtime/page count, synopses), and Persistent Cover/Poster Art.
* **Fix detail formatting**: Clean up raw metadata strings, remove trailing artifacts, format author lists ("By Neil Gaiman"), and clean up synopses.
* Display historical timeline stats: Date added, Date started, Date finished, and Time elapsed ("Started 12 days ago · Reading for 2 weeks").
* Provide direct actions: Editable unit count, Direct position jumps, Pause/Resume, and Delete.

#### Architectural Breakdown

```
┌────────────────────────────────────────────────────────┐
│                   TRACK DETAIL VIEW                    │
├────────────────────────────────────────────────────────┤
│  [  Cover Art  ]  Title: Severance                     │
│  [  Poster     ]  Creator: Dan Erickson                │
│                   Badge: SHOW · 2022 · Apple TV+       │
├────────────────────────────────────────────────────────┤
│  Timeline & Stats:                                     │
│  • Added: Aug 12, 2026 (3 weeks ago)                   │
│  • Started: Aug 15, 2026 (Active for 18 days)          │
│  • Current Pace: ~1.2 episodes / week                  │
├────────────────────────────────────────────────────────┤
│  Progress Control:                                     │
│  [======== Season 1 ========] [==== Season 2 ====]     │
│  Current: S2 Ep 3 of 10  [Edit Count] [Jump Position]  │
├────────────────────────────────────────────────────────┤
│  Synopsis:                                             │
│  Mark leads a team of office workers whose memories... │
├────────────────────────────────────────────────────────┤
│  Actions:                                              │
│  [ Pause / Backlog ]              [ Delete Track ]     │
└────────────────────────────────────────────────────────┘
```

1. **Database Schema Migration (`src/db/schema.ts`)**:
   * Create migration adding metadata columns to both `series` and `entry`:
     ```sql
     ALTER TABLE series ADD COLUMN cover_url TEXT;
     ALTER TABLE series ADD COLUMN creator TEXT;
     ALTER TABLE series ADD COLUMN description TEXT;
     ALTER TABLE series ADD COLUMN release_year TEXT;

     ALTER TABLE entry ADD COLUMN cover_url TEXT;
     ALTER TABLE entry ADD COLUMN creator TEXT;
     ALTER TABLE entry ADD COLUMN description TEXT;
     ALTER TABLE entry ADD COLUMN release_year TEXT;
     ```
   * Ensure `backup.ts` handles the new columns seamlessly during import/export.

2. **Metadata Providers Enhancement (`src/providers/`)**:
   * **Google Books (`src/providers/googleBooks.ts`)**:
     * Extract `imageLinks?.thumbnail` or `imageLinks?.smallThumbnail` (secure HTTPS URL).
     * Extract `authors` array and join cleanly: `"By " + authors.join(", ")`.
     * Clean `description` (strip raw HTML `<p>`, `<i>`, `<b>` tags and decode HTML entities `&amp;`, `&quot;`).
   * **TMDB (`src/providers/tmdb.ts`)**:
     * Extract `poster_path` and prepend TMDB CDN: `https://image.tmdb.org/t/p/w500${hit.poster_path}`.
     * Query credits/created_by or cast/director in show/movie details.
   * **Metron & AniList (`src/providers/metron.ts`, `src/providers/anilist.ts`)**:
     * Extract `image` / `coverImage.large` and creator/artist credits.
   * **Formatting Engine (`src/domain/formatters.ts`)**:
     * Pure functions to format metadata uniformly for both Add Confirmation and Track Detail screens:
       * `formatCreator(category: Category, rawCreator?: string): string`
       * `formatMetadataLine(category: Category, details: { year?: string; count?: number; runtime?: number; pages?: number }): string[]`
       * `cleanSynopsis(rawText?: string | null): string | null`
       * `formatElapsedTime(startDate: string, endDate?: string | null): string` (e.g. "Started 3 weeks ago", "Finished in 4 days")

3. **Navigation & Screen Architecture (`app/track/[id].tsx`)**:
   * Add dynamic route `app/track/[id].tsx` with query params `?kind=series` or `?kind=entry`.
   * Configure in `app/_layout.tsx` as a standard push stack or presentation modal (`presentation: 'modal'`).
   * Connect row clicks in `TrackRow.tsx` to `router.push('/track/' + track.id + '?kind=' + track.kind)`.
   * Inline actions:
     * Tapping count launches `ProgressEditor` dialog to modify total count or jump ordinal.
     * Tapping Pause toggles `returnTrackToBacklog` or `resumeTrack`.
     * Tapping Delete shows confirmation dialog with undo toast support.

---

### Milestone v1.3.0: Stats Page, Analytics Engine & Shareable Visuals

#### User Goals
* Dedicated **Stats** tab in the main navigation.
* Displays aggregate metrics:
  * Total items completed (all time, this month, this year).
  * Averages: average days from Backlog to Start, average days from Start to Finish (per category: Show, Movie, Book, Comic, Manga).
  * Category balance & distributions (visual bar/pie distribution).
  * Velocity: items finished per month/week.
* **Shareable Graphic Card**: One-tap generation of a beautifully formatted summary card (stats snapshot) that can be shared via native share sheet or saved to photos using `expo-sharing`.
* Individual track stats accessible directly on each track's detail screen.

#### Architectural Breakdown

```
┌────────────────────────────────────────────────────────┐
│                   STATS / INSIGHTS                     │
├────────────────────────────────────────────────────────┤
│  [ SUMMARY CARDS ]                                     │
│  ┌───────────────────────┐   ┌───────────────────────┐ │
│  │ 42 Finished           │   │ 8.4 Days              │ │
│  │ +4 this month         │   │ Avg. Completion Pace  │ │
│  └───────────────────────┘   └───────────────────────┘ │
├────────────────────────────────────────────────────────┤
│  [ CATEGORY BREAKDOWN ]                                │
│  Shows:  ████████████ 14                               │
│  Books:  ████████ 9                                    │
│  Movies: ██████ 7                                      │
│  Comics: ████ 5                                        │
│  Manga:  ███ 4                                         │
├────────────────────────────────────────────────────────┤
│  [ TIME-TO-FINISH AVERAGES ]                           │
│  • Books:  14.2 days from start to finish              │
│  • Shows:  21.5 days from start to finish              │
│  • Movies: 1.0 days                                    │
│  • Backlog incubation: avg. 32 days before first start │
├────────────────────────────────────────────────────────┤
│  [ SHARE SNAPSHOT ]                                    │
│  [  Share Stats Graphic Card (expo-sharing)  ]         │
└────────────────────────────────────────────────────────┘
```

1. **Domain Layer (`src/domain/stats.ts`)**:
   * Pure aggregation functions taking raw entry/series collections and calculating:
     ```typescript
     export type LibraryStats = {
       totalCompleted: number;
       totalInProgress: number;
       totalBacklog: number;
       categoryBreakdown: Record<Category, number>;
       averageDaysToStart: Record<Category, number | null>;
       averageDaysToFinish: Record<Category, number | null>;
       completedByMonth: Array<{ month: string; count: number }>;
     };
     ```
   * Accurately subtracts paused durations when computing "active time to finish" so paused periods don't artificially skew pace metrics.

2. **Data Repository Layer (`src/data/statsRepo.ts`)**:
   * High-performance SQLite aggregation queries utilizing `julianday(finished_at) - julianday(started_at)` and `strftime('%Y-%m', finished_at)` indexes.

3. **UI & Navigation (`app/(tabs)/stats.tsx` & `app/(tabs)/_layout.tsx`)**:
   * Add a 4th tab:
     ```typescript
     <Tabs.Screen
       name="stats"
       options={{
         title: 'Stats',
         tabBarIcon: ({ focused }) => (
           <TabItem
             focused={focused}
             activeIcon="stats-chart"
             inactiveIcon="stats-chart-outline"
             label="Stats"
           />
         ),
       }}
     />
     ```
   * Lightweight, accessible charts built with native SVG (`react-native-svg`) or styled Flexbox containers (ensuring zero heavy bloated chart dependencies).

4. **Shareable Image Generator (`src/ui/stats/ShareableStatsCard.tsx`)**:
   * Dedicated branded card component rendered with clean typography, user stats, and app branding.
   * Captured into a high-res PNG using `react-native-view-shot` or offscreen rendering.
   * Invokes `expo-sharing` (`Sharing.shareAsync(uri)`) to share to Instagram, Messages, Twitter, or save locally.

---

### Milestone v2.0.0: The "Iris" Evolution (Rebrand & Modern Glass UI)

#### User Goals
* Rebrand the application from "Track-it" to **"Iris"**.
* Establish a modern design philosophy inspired by Apple-like simplicity, purposeful typography, and clean glass surfaces (`expo-blur`).
* Update app logo, adaptive icons, splash screens, and public marketing assets.

#### Philosophy of "Iris"

> **"Clarity Through Focus"**  
> *Iris* represents both the aperture of a camera lens through which we view visual media and the human eye reading the written word. Where v1.0.0 was utilitarian and brutalist, *Iris* is calm, focused, and elevated — allowing your cultural journey to take center stage.

```
Design Pillars:
1. Content-First: Media posters and artwork provide the color; the interface provides the quiet frame.
2. Atmospheric Glass: Translucent navigation bars, frosted sheets, and subtle specular borders.
3. Fluid Micro-Interactions: Spring physics on swipes, tap ripples, and gentle scale states.
4. Restraint: No clutter, no unnecessary decorative elements, no visual noise.
```

#### Architectural Breakdown

1. **Design System & Theme Tokens (`src/ui/theme.ts`)**:
   * Introduce Iris Design Tokens:
     * **Glass Surfaces**: `glassBackground`, `glassBorder`, `glassBlurIntensity` (`expo-blur`).
     * **Refined Neutral Palette**: Slate neutrals with subtle tinting based on system appearance.
     * **Typography**: Clean Humanist / SF Pro / Inter hierarchy (`Display`, `Title`, `Body`, `MonoNumeral`).
     * **Spec & Radii**: Generous Apple-style corner radii (`card: 20`, `pill: 9999`, `sheet: 32`).

2. **Logo & Asset Suite**:
   * **Mark Design**: Minimalist geometric aperture ring intersecting with an open page motif.
   * **Assets to Generate & Replace**:
     * `assets/icon.png` (1024×1024 master icon)
     * `assets/android-icon-foreground.png`, `assets/android-icon-background.png`, `assets/android-icon-monochrome.png`
     * `assets/splash-icon.png`
     * `assets/favicon.png`
     * Marketing screenshots and interactive simulator on `docs/index.html`.

3. **Project & Package Configuration (`app.json`, `package.json`)**:
   * Update `app.json`:
     * `"name": "Iris"`
     * `"slug": "iris"`
     * `"scheme": "iris"`
     * Preserve Android package ID (`com.peds24.trackit`) or establish migration path to maintain existing local SQLite databases across upgrades.
   * Update landing page and documentation to reflect the Iris identity.

---

## 4. Cross-Branch Delivery Strategy

Work in this repository follows the strict 3-branch pipeline:

```
                  ┌──────────────────┐
                  │     android      │  (Source of Truth)
                  └─────────┬────────┘
                            │
               (Port via porting skill)
                            │
                            ▼
                  ┌──────────────────┐
                  │       web        │  (RN Web Port / Vercel)
                  └─────────┬────────┘
                            │
               (Hand-crafted landing sync)
                            │
                            ▼
                  ┌──────────────────┐
                  │     gh-pages     │  (Live Landing Page)
                  └──────────────────┘
```

1. **All new features are developed and verified on `android` first.**
2. **Once verified on `android`, changes are ported to `web`** using `.claude/skills/porting-android-changes-to-web/SKILL.md`.
3. **Marketing and design spec updates are ported to `gh-pages`** for the public site at `https://peds24.github.io/track-it/`.

---

## 5. Summary of Milestones & Releases

| Version | Milestone Name | Key Highlights | Database Migration? | Status |
| :--- | :--- | :--- | :---: | :--- |
| **v1.1.0** | **Action Feedback & Undo** | Toast notifications, Undo for Advance/Pause/Delete, Finish celebrations | No | Pending |
| **v1.2.0** | **Track Detail & Artwork** | Individual track pages, cover art, formatted details, time elapsed | **Yes** (cover_url, creator, blurb) | **Shipped 2026-09-23** |
| **v1.3.0** | **Stats & Visual Insights** | Stats tab, velocity/averages, shareable graphic cards via `expo-sharing` | No | Pending |
| **v2.0.0** | **Iris Rebrand & Glass UI** | Name change, aperture logo, glass design system (`expo-blur`), modern UI | No | Pending |
