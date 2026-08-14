# Track It

A local-only mobile app for tracking shows, movies, books, comics, and manga
as you watch and read them. No accounts, no cloud sync, no cover art — a
minimal, text-focused list you can read in one glance, built to be tapped once
and closed.

## Key features

- **Currently screen** — a flat list of what's in progress, ordered by most
  recently advanced. One tap on a row marks the current episode/issue/volume
  done and starts the next.
- **One-tap advance** — finishing a series unit (episode, issue, volume)
  immediately starts the next one; standalone books and movies keep separate
  started/finished states since there's no next unit to move to.
- **Backlog** — everything not started, sorted by date added, filterable by
  media type.
- **Pause and resume** — leaving Currently pauses a track without resetting
  progress; only a fully finished track resets on return to the backlog.
- **Done** — a filter on the backlog screen, not a separate tab; finished
  things are reachable but deliberately de-emphasized.
- **Ongoing series** — series with no known final count show "Ongoing" and
  grow one entry at a time instead of showing a fraction.
- **Manual entry** — v1 adds tracks by hand (title + count generates numbered
  entries) behind a `MetadataProvider` interface, so catalogue-backed lookup
  (e.g. TMDB, Google Books) can be added later without touching the model.

See `docs/superpowers/specs/2026-08-12-track-it-design.md` for the full
decision log behind these choices, and `docs/design/design-language.html` for
the visual system.

## Tech stack

- [Expo](https://expo.dev/) SDK 57 / React Native 0.86, TypeScript (strict)
- [expo-router](https://docs.expo.dev/router/introduction/) for navigation
- [expo-sqlite](https://docs.expo.dev/versions/latest/sdk/sqlite/) for local
  storage (no backend, no network dependency)
- Jest + `@testing-library/react-native` for tests

Domain-driven layering: `db/` knows storage, `domain/` is pure business logic
with no I/O, `data/` is repositories bridging the two, `providers/` is the
metadata/catalogue interface, `ui/` + `app/` are screens and components.

## Getting started

This repo's React Native version needs a Node version newer than some system
defaults ship — if `expo start` refuses to run, switch first:

```bash
nvm use 22
```

Then:

```bash
npm install
npm start           # expo start — scan the QR code or pick a platform
npm run android      # expo start --android
npm run ios          # expo start --ios
npm run web          # expo start --web
```

Other scripts:

```bash
npm test            # jest
npm run typecheck   # tsc --noEmit
```

## Project structure

```
app/            expo-router screens (file-based routing): tabs, add-track modal
src/db/         SQLite schema, migrations, raw queries
src/domain/     pure TypeScript business logic — status transitions, shelf
                classification, progress computation — no I/O
src/data/       repositories mapping SQLite rows to domain objects
src/providers/  MetadataProvider interface and the manual (v1) implementation
src/ui/         screens' supporting components, theming, hooks
docs/           design language doc, specs, project landing page
```

## Project status

`main` is currently behind — it sits at a pre-implementation commit. The
actual v1 app lives on `feat/v1-implementation`, with several branches
stacked on top of it for follow-on fixes and feature slices (tab bar
legibility, dark-mode theming, one-tap-advance refinements, and so on). Check
`git log --oneline --all --graph` and `git branch -vv` for the current
branch layout before assuming `main` reflects the app.

Export/import (and with it, any backup path) was deferred past v1 — see the
design doc's decision log (D6, A3) for why, and what that costs. The app is
currently single-copy storage: a lost or wiped phone loses the library.
