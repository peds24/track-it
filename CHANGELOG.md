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

### Planned for v1.2.0 (Track Detail & Artwork)
- **Added**: Dedicated individual track detail view (`app/track/[id].tsx`).
- **Added**: Persistent cover artwork from Google Books, TMDB, Metron, and AniList.
- **Added**: Rich creator/author attribution and cleaned synopsis formatting.
- **Added**: Track timeline statistics (date added, date started, time active, completion velocity).
- **Added**: In-place controls for editing total count, jumping positions, pausing, and deleting.

### Planned for v1.3.0 (Insights & Stats)
- **Added**: Dedicated Stats & Insights tab (`app/(tabs)/stats.tsx`).
- **Added**: Calculation engine for completion averages, backlog incubation time, and category balance.
- **Added**: One-tap shareable stats graphic card using `expo-sharing`.

### Planned for v2.0.0 (The "Iris" Evolution)
- **Changed**: Rebranding from "Track-it" to "Iris".
- **Added**: Modern Apple-inspired glass design system (`expo-blur`, translucent surfaces, refined typography).
- **Added**: New aperture/iris logo and updated native application icons across iOS and Android.

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
