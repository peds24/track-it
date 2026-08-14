# Track It — session handoff

**Last updated:** 13 August 2026

Where the project stands, what is unmerged, and what bit us — so the next
session does not rediscover any of it.

## Branch state

`main` is still at the pre-implementation commit. Everything lives on branches.

| Branch | What it is | Base |
| ------ | ---------- | ---- |
| `feat/v1-implementation` | The whole v1 app + design language + landing page source | `main` |
| `fix/3-tab-bar-legibility` | Issue #3 — bigger tab labels, ripple removed | v1 |
| `fix/4-dark-mode-modal-header` | Issue #4 — themed modal header + status bar | v1 |
| `feat/2-track-actions` | Issue #2 — swipe delete / to-backlog, Start label | v1 |
| `feat/2-ongoing-series` | Issue #2 — ongoing series, no total (A4) | v1 |
| `feat/2-one-tap-advance` | Issue #2 — one tap per series unit (A5) | `feat/2-ongoing-series` |
| `chore/eas-update` | EAS Update so JS ships without a build | v1 |
| `gh-pages` | Orphan branch, the published site only | — |

**Merge order:** the two fixes, `feat/2-track-actions` and `chore/eas-update` are
independent. `feat/2-one-tap-advance` stacks on `feat/2-ongoing-series` — merge
that one first or the diff looks twice its size.

No PRs are open. `gh` is not installed and this session had no GitHub token, so
branches were pushed and the PR links handed over instead.

## Where the decisions live

- `docs/superpowers/specs/2026-08-12-track-it-design.md` — D1–D12 plus amendments
  A1–A5. **Read this before changing behaviour.** Every decision records what was
  rejected and why, so a "fix" that reverts one is visible as such.
- `docs/superpowers/plans/2026-08-12-track-it-v1.md` — the v1 implementation plan
  and the deviations found while executing it.
- `docs/design/design-language.html` — the visual system, with live 390pt mockups
  rendered from the real tokens. Also published as a Claude artifact.
- `.superpowers/sdd/2026-08-12-track-it-v1/progress.md` — the execution ledger,
  including ~25 deferred minor findings the final review triaged. Git-ignored,
  local only.

## Things that cost time once — do not relearn them

- **Node.** The machine default (v23.7.0) is outside React Native 0.86's range.
  Always `source ~/.nvm/nvm.sh && nvm use 22` before any expo/npm command.
- **Tests do not catch rendering.** Three separate rounds of bugs only appeared on
  a real screen: `userInterfaceStyle: "light"` pinned in `app.json` made the whole
  dark palette dead code; a horizontal `ScrollView` stretched the filter chips to
  ~700px; the tab bar drew a second header and placeholder glyph boxes. Boot the
  emulator before claiming UI work is done.
- **react-native-gesture-handler does not work in Expo Go here.** RNGH 3.1's
  native API is absent from the Expo Go binary even though `expo install --check`
  reports dependencies current. A `Swipeable` dies with "Can't find ViewManager
  RNGestureHandlerDetector". The swipe actions use `PanResponder` instead, which
  ships inside React Native.
- **expo-file-system changed in SDK 57.** `cacheDirectory`, `writeAsStringAsync`
  and `readAsStringAsync` are gone or throw at runtime. Use `new File(Paths.cache,
  …)`. The plan's original code typechecked and would have crashed on device.
- **expo-sqlite transactions.** Use `withTransactionAsync`, not
  `withExclusiveTransactionAsync` — the latter hands the callback a separate
  connection, so statements run outside the transaction and migrations silently
  lose atomicity. See amendment A1.

## Verification status

- 115–127 tests depending on branch; `npm run typecheck` clean on all of them.
- Verified on an Android emulator: add flow, one-tap advance, shelf transitions,
  progress bar, dark mode, swipe + delete confirmation, SQLite persistence across
  restart.
- **Not verified on device:** `feat/2-ongoing-series` and
  `feat/2-one-tap-advance`. Tested, never rendered.
- **Never verified anywhere:** export/import. It is also no longer reachable —
  see below.

## Open risks

1. **The app has no backup path.** Export/import was deferred past v1 (A3), so a
   lost or wiped phone loses the library outright and the app never says so.
   `src/data/backup.ts` and its 12 tests remain in the tree, unreferenced by
   `app/`. Re-enabling means adding a screen, not rebuilding the feature.
2. **The import rollback has only ever run against `better-sqlite3`.** The device
   path uses `expoDriver.withTransactionAsync`, which no automated test covers.
   Before trusting import with real data, import a deliberately corrupted file on
   a device and confirm the library survives.
3. **An ongoing series never reaches Done** (A4). Correct by design, but it means
   such a track sits in Currently permanently.

## Next up on issue #2

In the agreed order:

1. **Completion celebration** — a styled popup when something is finished. Needs a
   modal component; the design language has none, so it is a design decision
   before it is a code one.
2. **Scan to add** — blocked on the catalogue API (D5). Nothing to build yet.
3. **Metadata dates** — believed already satisfied: `createdAt` is "added",
   `startedAt` and `finishedAt` exist per entry, and a track-level completion date
   derives from the max across children. Verify and close rather than build.

Also deferred from the request: a confirmation before starting the next unit. It
was left out on purpose (A5) — a dialog on every completion reinstates the second
interaction that amendment removes, and the choice it would offer only becomes
real once a catalogue can say whether a next unit exists.

## Shipping

EAS project is `@peds24/track-it` (id `d319cc51-6ebe-43b0-b50b-f0e843d1903c`),
Android package `com.peds24.trackit`. EAS holds the signing keystore — back it up
with `eas credentials` before any store release.

The installed preview APK **cannot** receive OTA updates; it predates
`expo-updates`. After merging `chore/eas-update`, one more build makes every
JS-only change shippable with `eas update --branch preview`, no build credit.

For day-to-day iteration, no build is needed at all: `npx expo start --tunnel`
and open it in Expo Go.
