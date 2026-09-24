# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned for v1.1.0 (Feedback & Undo)
- **Added**: Floating action feedback notification (Snackbar/Toast) across Currently, Backlog, and Done screens.
- **Added**: Instant Undo capability for advance, pause, and delete operations.
- **Added**: Confetti and emoji celebration overlay when a track is completed.
- **Note**: still pending — v1.2.0 shipped ahead of it (see below).

### Planned for v1.4.0 (Insights & Stats)
- **Added**: Dedicated Stats & Insights tab (`app/(tabs)/stats.tsx`).
- **Added**: Calculation engine for completion averages, backlog incubation time, and category balance.
- **Added**: One-tap shareable stats graphic card using `expo-sharing`.

### Planned for v2.0.0 (The "Iris" Evolution)
- **Changed**: Rebranding from "Track-it" to "Iris".
- **Added**: Modern Apple-inspired glass design system (`expo-blur`, translucent surfaces, refined typography).
- **Added**: New aperture/iris logo and updated native application icons across iOS and Android.

---

## [1.3.0] - 2026-09-24

### Added
- **Feedback button** on the Done tab: write a message and it opens in your mail app, addressed to the developer, with the app version attached.
- **Comics advance like Longbox**: a Metron-matched comic's cover and issue number now follow the issue you are reading, after each advance or position edit.

### Changed
- **Sharper covers** on the track detail screen and in search results: TMDB `w780`, AniList `extraLarge`, Google Books `fife=w600`. Covers saved before this update sharpen too, with nothing refetched.
- **Better book search**: matches by title first, keeps only real books (ISBN-bearing, so no journals, reports or conference proceedings), drops summaries and study guides, lists results with a cover and author first, and collapses duplicate printings.
- **No more "How many episodes?"** on the Add screen, anywhere: a catalogue match brings its real count, and a hand-typed series is tracked as you go, finished with Complete.

---

## [1.2.0] - 2026-09-23

### Added
- Dedicated individual track detail screen (`app/track/[kind]/[id].tsx`), modelled on Longbox's comic detail layout: cover art, creator line, meta line, progress, timeline stats, description, and the row's actions.
- Persistent cover artwork, creator/author, description, and release year stored on `series` and `entry` (migration 7), sourced from Google Books, TMDB, Metron, and AniList via a new `details()` provider method.
- One-time first-launch metadata backfill for existing catalogue-matched tracks — hand-typed tracks are never backfilled and nothing about them is guessed.
- Search-result disambiguation: thumbnail, creator, and year shown per result, sourced from the search call itself (TMDB search has no credits, so no creator there).
- Back-to-search: the confirm screen's back button now returns to the search screen with the typed query and results intact, replacing "Nope, search again".
- Manual completion via a two-step left swipe (Edit, then a deep-swipe Complete), including for an ongoing series — completing one drops its auto-appended placeholder unit so it reads "12 of 12", not "13 of 13".

### Changed
- Comic/manga/AniList description cleaning now goes through a single whitelist-based `cleanDescription` (`src/domain/formatters.ts`), retiring AniList's local `stripHtml`.
- RN's built-in `Image` is used for cover art instead of `expo-image`, to avoid a native rebuild and keep parity with `web`.

### Fixed
- Descriptions no longer render raw HTML tags or entities (`<br>`, `&amp;`, `&#39;`, …) — cleaned at the provider boundary and again at render.
- Backups could not restore comic collections; `backup.ts` now round-trips the new metadata columns and comic-collection entries correctly.

---

## [1.0.0] - 2026-09-01

### Added
- **Core Tracking Engine**: Unified `Series` and `Entry` schema supporting Shows, Movies, Books, Comics, and Manga.
- **Three-Shelf Organization**: Currently (in progress), Backlog (unstarted or paused), and Done (finished).
- **Material Design 3 (M3) System**:
  - Full tonal palette for Light and Dark modes (`src/ui/theme.ts`).
  - Standard M3 bottom navigation bar with pill indicator.
  - 32dp filter chips on Backlog and Done screens.
  - Direction-isolated swipeable track rows with instant quick-swipe and deep-drag actions.
- **Catalogue & Barcode Integrations**:
  - Google Books provider for ISBN barcode scanning (books, manga, comic collections).
  - Metron provider for UPC-A barcode scanning with EAN-5 issue resolution.
  - TMDB provider for show and movie search-as-you-type with season episode counts.
  - AniList provider for manga search.
  - Manual fallback for offline/custom tracking without network dependencies.
- **Local-Only Persistence**: SQLite database via `expo-sqlite` with zero telemetry or cloud lock-in.
- **Backup & Restore**: Full JSON import/export in `src/data/backup.ts`.
