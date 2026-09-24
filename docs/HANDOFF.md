# Track It — session handoff

**Last updated:** 23 September 2026

Where the project stands, what is unmerged, and what bit us — so the next
session does not rediscover any of it. Newest section is at the top; older
sections below are left as written, and may describe a branch layout
(`main`, PRs) that predates the `android`/`web`/`gh-pages` pipeline
(CLAUDE.md §6) — read them as history, not current state.

## v1.2.0 (2026-09-23)

Feature branch `worktree-v1.2.0-track-detail` (`.claude/worktrees/
v1.2.0-track-detail`) implements the full v1.2.0 milestone — track detail
screen, persistent cover/creator/description metadata (migration 7),
first-launch backfill, manual completion, and search disambiguation. All
15 implementation tasks plus this docs/version-bump task are committed on
the branch; `npm run typecheck` and `npm test` are green as of the final
commit. **Not yet merged into `android`** — that merge is held for the
user's explicit go-ahead (see task-16-brief.md's controller ruling: docs
and version bump only, no merge). **Not yet ported to `web`** — that is
the next milestone's job, via `.claude/skills/porting-android-changes-to-
web/SKILL.md`, once this lands on `android`.

**Backfill behavior, worth restating precisely:** on first launch after
the migration, every existing `series`/standalone `entry` row with a
catalogue `external_id` and no `metadata_checked_at` gets a one-time,
sequential `details()` call to fetch its cover/creator/description/year.
**Hand-typed tracks (no `external_id`) are never touched and nothing about
them is guessed** — this was an explicit user decision on 2026-09-22, not
an oversight: a hand-typed title showing someone else's catalogue cover by
best-effort match would be worse than showing none. A row whose lookup
fails (network, missing key) is retried on the next launch; a row whose
lookup succeeds but simply has no cover is stamped and left alone.

**Toolchain gotcha found this session:** on this machine, plain `source
~/.nvm/nvm.sh && nvm use 22` (as the version-release skill and the older
gotcha list below both say) now **exits 3** — a broken default alias
somewhere in this profile's nvm setup. Use `source ~/.nvm/nvm.sh --no-use;
nvm use 22` instead (load nvm without its own auto-`use`, then `use 22`
explicitly). Worth fixing in the skill/scripts once confirmed reproducible
outside this worktree.

**Also worth knowing before the next on-device pass:** Expo Go on the
Pixel_10 emulator overlays a floating dev-menu button in the top-right
corner of the screen — it sits directly on top of the app's own "+ Add"
control on the tab screens that put one there, so a tap meant for "+ Add"
can hit the dev-menu button instead. Not a code bug; just something to
route around (or dismiss the dev-menu bubble first) when driving the
emulator by hand or via a screenshot script.

## Branch state (pre-v1.2.0 — see above for current)

`main` is current through **PR #6** (`84f5616`) — it holds the full v1 app,
EAS Build/Update setup, and everything from PR #5 (ongoing series, one-tap
advance, pause/resume, the full e-ink/monochrome design pass, the app icon).
All the feature branches that fed into those two PRs (`fix/3-*`, `fix/4-*`,
`feat/2-track-actions`, `feat/2-ongoing-series`) are fully absorbed and safe
to delete.

**`feat/2-one-tap-advance` is 2 commits ahead of `main`, unpushed:**

| Commit | What |
| --- | --- |
| `da70f00` | Split Done into its own third tab, reversing D11 (recorded as **A8**) |
| `4808b6b` | Real Google Books / Metron / TMDB providers + barcode scanning, fulfilling D5 (recorded as **A9**) |

Neither has a PR yet. Next step for this branch is `git push` then a PR
against `main` (same pattern as #5/#6) — see "Next steps" below for why
that shouldn't happen blind.

**Heads up:** a peer Claude Code session (`track-it-d9`) has touched this
repo recently and may still be around. Check `git status` and `git log`
before assuming the tree is exactly as this doc describes.

## Where the decisions live

- `docs/superpowers/specs/2026-08-12-track-it-design.md` — D1–D12 plus
  amendments **A1 through A9**. Read before changing behaviour; every
  amendment records what changed and why, including two real reversals
  (A6 reworked D4's backlog-reset into pause/resume; A8 reversed D11 to give
  Done its own tab) and one fulfilled deferral (A9 built out D5's provider
  interface with real catalogues).
- `docs/superpowers/plans/2026-08-12-track-it-v1.md` — the original v1 plan.
- `docs/design/design-language.html` — the visual system. Also published as
  a Claude artifact (ask if you don't have the URL handy — it was updated
  in place across several redesign passes, not recreated). **This is
  current** as of the e-ink/monochrome pass below; skim it before touching
  any UI file, since several things it documents (no colour at all, a
  monospace face, underline as the only "this is emphasised" mark) will
  look wrong if you don't know they're deliberate.
- `docs/index.html` — the landing page, mirrors the design doc's tokens.
  Published to **`gh-pages`** (a separate orphan branch — pushing to `main`
  does **not** update the live site; see "Publishing the landing page"
  below).

## The design system, in one paragraph

Everything went through two passes this session. First: a bolder, e-ink-
device-inspired read — sharper corners, thicker borders on anything
pressable, heavier type. Second, in response to explicit direction: **colour
was removed entirely** (no accent, no danger, no pause hue — all gone from
`src/ui/theme.ts`), replaced by underline (for "this is emphasised/
actionable") and ink-fill inversion (for "this is the heaviest/most
consequential thing here" — a pressed button, an irreversible swipe-delete).
The typeface switched from the platform's proportional system face to its
**monospace register** (Menlo on iOS, `monospace` alias on Android — real
SF Mono/Roboto Mono aren't addressable from a plain React Native
`fontFamily` string the way they are in CSS). Light mode's background is an
actual e-ink panel tint (`#DCDFD0`, a grey with green in it) rather than
paper-white; dark mode stayed a plain dark theme on purpose — e-ink has no
authentic dark-panel equivalent to chase.

The app icon is a new checkmark-in-box mark (ink box, ground-coloured check,
same fill/invert logic as a pressed button) replacing the generic Expo
template placeholders — `assets/icon.png` and the Android adaptive-icon
layers. **It has not shipped anywhere yet** — native icons only take effect
after a new build (EAS or local prebuild); reloading the JS in a dev client
will never show it.

## New this session: real metadata providers + barcode scanning

Fulfills D5, which explicitly designed `MetadataProvider`/`providers/
registry.ts` for this moment — not a retrofit. Mapping: **Google Books**
(book + manga, ISBN-based), **Metron** (comic, UPC-based), **TMDB** (show +
movie, search-only, no barcode exists for these). `ManualProvider`'s entry-
generation logic still runs underneath every real provider as the no-match
fallback — adding a track by typing a title has zero network dependency
regardless of what's configured.

**Comics need two barcodes, not one.** A comic's main UPC-A barcode
identifies its *series*, not the specific issue — the 5-digit EAN-5
supplemental barcode printed beside it is what pins the issue number
(confirmed straight from Metron's own API docs, which document their
`upc_starts_with` filter as existing specifically for scanners that "only
read the 12-digit UPC-A and drop the 5-digit EAN supplemental"). `expo-
camera` cannot read that supplemental barcode at all on either platform —
so the actual flow scans the main UPC-A, then asks for the 5 digits as a
quick skippable manual entry, using Metron's exact `upc` filter if given or
`upc_starts_with` (showing every candidate issue to pick from) if skipped.

**TMDB attribution is a hard requirement**, not a courtesy — the exact
required sentence ("This product uses the TMDB API but is not endorsed or
certified by TMDB") lives behind a `?` icon on the Done tab's header,
alongside credit lines for Google Books and Metron.

**Environment variables** — `.env` exists at the repo root (gitignored,
confirmed not tracked) with four `EXPO_PUBLIC_*` vars: Google Books key,
TMDB key, Metron username/password. Real values are already filled in
locally as of this session — nothing further needed there unless a key
rotates.

**Not yet verified anywhere**: none of this has been exercised against live
data. Tests mock `fetch`; nobody has scanned a real barcode or run a real
search on a device yet. This is the single biggest open item — see below.

## Things that cost time once — do not relearn them

- **Node.** Machine default (v23.7.0) is outside RN 0.86's range. Always
  `source ~/.nvm/nvm.sh && nvm use 22` before any expo/npm/EAS command —
  this includes inside any script or subagent you dispatch; it does not
  inherit from your shell's rc files reliably in every context.
- **Tests do not catch rendering.** This bit the project three separate
  times before this session even started (dark-mode `userInterfaceStyle`,
  a stretched `ScrollView`, a doubled tab-bar header) — always boot a real
  device/emulator before calling UI work done, not just `npm test`.
- **react-native-gesture-handler does not work in Expo Go on this SDK.**
  Swipe actions use `PanResponder` instead (ships inside React Native
  itself) — see `src/ui/SwipeableTrackRow.tsx`.
- **`gh-pages` is a fully separate branch from `main`/`docs/index.html`.**
  Merging design changes to `main` does nothing to the live site. To
  publish: check out `gh-pages` in a throwaway worktree, copy the current
  `docs/index.html` (and `docs/design/design-language.html`, which it links
  to) over the root-level files there, commit, push, remove the worktree.
  Done once already this session; will need doing again once the two
  unpushed commits above eventually reach `main`.
- **App icons need a real build.** JS reload never shows a new `icon.png`
  or Android adaptive-icon layer — only a fresh EAS build or local
  `expo prebuild` will.
- **No SVG rasterizer ships on this machine.** `brew install librsvg` (gives
  `rsvg-convert`) was needed to turn the new logo's master SVG into the six
  PNG sizes the native build actually consumes. Already installed as of
  this session as a local dev tool, not a project dependency.
- **`gh` is installed and authenticated** on this machine (contrary to what
  an earlier version of this project's memory assumed) — PRs were opened
  and merged with it directly this session.

## Open risks

1. **The whole provider/scanning feature is unverified against real data.**
   Typecheck and 197 mocked-fetch tests pass; nothing has hit Google Books,
   TMDB, or Metron for real, and no physical barcode has been scanned.
   Before trusting this, reload the app with real keys in place and: search
   a title in each of the three categories, scan an actual ISBN (a book) and
   an actual UPC+EAN-5 pair (a comic), and confirm the Done-tab attribution
   modal renders.
2. **The entire design pass (colour removal, e-ink tint, monospace face,
   sharpened corners) is unverified on a real screen post-Done-tab-split and
   post-provider-work.** The last real device screenshots predate both.
3. **The app still has no backup path.** Export/import remains deferred
   past v1 (A3) — unrelated to this session's work, just still true.
4. **`feat/2-one-tap-advance`'s two unpushed commits touch a lot of surface**
   (a new tab, a new schema migration, a new native dependency) without a
   PR review pass yet. Don't push-and-merge on autopilot the way #5/#6 went —
   at minimum get the device verification in item 1 and 2 done first, since
   catching a rendering bug pre-merge is cheap and catching one after is not.

## Next steps, in order

1. Reload the app on device/emulator with the real `.env` keys in place;
   walk through search-as-you-type and barcode scanning in all three
   category-pairs, and eyeball the full design pass fresh (tab bar, Done
   screen, add flow, swipe actions).
2. Fix whatever that turns up (there is a strong prior in this project that
   something will).
3. `git push origin feat/2-one-tap-advance`, open a PR against `main`
   (`gh pr create --base main --head feat/2-one-tap-advance`), merge once
   satisfied.
4. Re-publish `gh-pages` from the post-merge `main` (see the gotcha above) —
   it's been stale since before the Done-tab split.
5. Spend an EAS build to get the new app icon and `expo-camera` (a native
   module — the currently-installed preview build predates it and **will
   not have camera/scanning working** until a new build ships) onto an
   actual installed build. This is not optional — barcode scanning cannot
   be tested in the existing preview APK at all, only in a fresh dev-client
   or preview build that includes the native module.
