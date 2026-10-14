# Iris I11 — Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On iOS the app is Iris:
- the **spectrum-iris** aperture mark is its app icon, in light, dark and tinted variants;
- the launch screen shows the mark;
- the display name is "Iris", the bundle ID `com.peds24.iris`, and the `iris://` URL scheme is registered.

The mark comes from one source, shared with the other platforms.

**Architecture:**
- **One source.** `design/iris/mark.json` (the geometry, plus colours referencing `tokens.json`) is the single source of the mark.
- **Generated files.** A no-dependency Node generator, `scripts/iris-mark.js` (`npm run mark`), writes the SVGs: `design/iris/mark.svg`, plus the light, dark and tinted icon SVGs and a launch-mark SVG. As with the tokens, jest fails when a generated SVG is stale.
- **PNGs.** `rsvg-convert` (Homebrew, already on this Mac) renders the PNGs into a new `apple/Iris/Resources/Assets.xcassets`: the AppIcon with Any, Dark and Tinted appearances, a LaunchMark image set and a LaunchBackground colour set.
- **Wiring.** `project.yml` wires the asset catalogue, the launch screen and the URL scheme.
- **Out of scope.** Android/web keep their icons and name until I13 (spec §7).

**Tech Stack:** Node (CommonJS, no deps), `rsvg-convert`, Xcode asset catalogues (iOS 18+ appearance variants), xcodegen, XCTest, jest.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md`:
- §7, Rebrand: display name Iris; URL scheme `iris`; a new aperture mark (icon, iOS 26 layered or tinted icon variants, launch screen); bundle ID decided in I11; Android keeps `com.peds24.trackit`; the repo, slug and landing page change at I13.
- §8 I11: "Icon renders in all variants".

**User decisions (2026-10-14):**
- Mark: **B, Spectrum iris**. Six aperture blades, one per colour: accent blue, then the five category tints in spectrum order (show purple, comic pink, movie orange, book green, manga teal). Gaps are the background colour.
- Bundle ID: **keep `com.peds24.iris`**.

## Global Constraints

- **Colours come from `design/iris/tokens.json` by token name.** No hex in `mark.json`. Light uses the light values (`accentFill` for the blue blade, so it matches the primary button); dark uses the dark values.
- **Variants** (Apple's appearance guidance):
  - Any (light): the mark on white.
  - Dark: the mark on black, using dark token values.
  - Tinted: the mark in greyscale on black. Each blade gets a distinct luminance so the aperture still reads when the system tints it.
- **One master image per variant.** The icon is a single 1024 × 1024 PNG per variant (single-size iOS app icon); Xcode derives the other sizes. No transparency in Any; Dark and Tinted are opaque black.
- **Launch screen.** It uses Info.plist `UILaunchScreen`, with `UIImageName = LaunchMark` and `UIColorName = LaunchBackground` (white or black by appearance). `INFOPLIST_KEY_UILaunchScreen_Generation` is removed. The mark is 200 pt wide, centred.
- **Committed outputs.** Generated SVGs and PNGs are committed, so a build needs neither Node nor rsvg. `npm run mark` regenerates them, and `npm run mark -- --check` fails when they are stale. The jest test runs the check on the SVGs; rendering the PNGs needs `rsvg-convert`, and is checked by file existence plus pixel size.
- **Identity.** Display name `Iris`, bundle `com.peds24.iris`, and URL scheme `iris` (`CFBundleURLTypes`, with a single entry). The scheme only opens the app; deep links are out of scope.
- **Android/web untouched.** No changes under `app/`, `src/`, `assets/` or `app.json`.
- **Work branch:** `worktree-iris-brand`. Merge into `iris` with `--no-ff` and push. Commits end with:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01V2n8Vxn8Hq7b6BTCpwRhYj
  ```

## Review Focus

1. **The tinted variant reads.** With the system tint applied, the six blades must remain distinguishable rather than one grey disc. Pinned by a generator test that blade luminances differ by at least 12% in the tinted palette (Task 1), and by looking at the tinted PNG (Task 2).
2. **The icon really ships with all three appearances.** It's not enough that the PNGs exist: the compiled `Assets.car` in the built app must list AppIcon with dark and tinted appearances. Pinned by an `assetutil --info` check in Task 3's verification and by an XCTest asserting the app icon name is set.
3. **The launch screen in dark mode** shows the dark mark on black, never a white flash. Pinned by a simulator screenshot at launch in dark (Task 3).
4. **Drift between the mark and the tokens.** If a category colour changes in `tokens.json`, the generated mark must change too, or a test fails. Pinned by the jest staleness check, which reads colours from tokens (Task 1).
5. **Nothing on Android/web changes.** Pinned by `git diff --stat iris...` showing no paths outside `apple/`, `design/`, `scripts/`, `docs/`, `package.json` and the tests (Task 4).

---

### Task 1: The mark as a generated source

**Files:** `design/iris/mark.json`, `scripts/iris-mark.js`, `scripts/__tests__/iris-mark.test.ts`, `package.json` (`"mark": "node scripts/iris-mark.js"`), generated `design/iris/mark.svg`, `design/iris/icon/{light,dark,tinted,launch}.svg`

**`mark.json`:**

```json
{
  "blades": 6,
  "outerRadius": 360, "innerRadius": 150, "twist": 38, "gap": 14,
  "order": ["accentFill", "categoryShow", "categoryComic", "categoryMovie", "categoryBook", "categoryManga"],
  "tinted": [1.0, 0.86, 0.72, 0.58, 0.44, 0.30]
}
```

The geometry is the concept's: blade *i* spans the outer arc from 60·i° to 60·(i+1)°, and closes through the inner hexagon vertices rotated by `twist`. `tinted` holds per-blade grey levels.

**Generator API** (exported for tests): `generate(markJson, tokensJson) → { mark, light, dark, tinted, launch }`, where each value is an SVG string with a header comment naming the sources' SHA-256, as in `iris-tokens.js`. It also exports `main(argv)`, which writes or `--check`s.

- [ ] **Step 1: Failing jest tests:**
  - The generated outputs match the committed files (staleness).
  - `light` uses `tokens.color.categoryShow.light` and `dark` uses `.dark`.
  - Changing a token colour changes the output.
  - Tinted blade luminances differ pairwise by ≥ 0.12.
  - Every SVG has `viewBox="0 0 1024 1024"`.
  - `launch` has a transparent background.

  Run `npx jest scripts/__tests__/iris-mark` → FAIL.
- [ ] **Step 2: Implement** the generator, run `npm run mark`, then run the tests → PASS. Run `npx jest scripts` → all PASS. **Commit** (`feat(iris): the aperture mark as a generated design source`).

### Task 2: Icons and launch assets

**Files:**
- `apple/scripts/render-mark.sh`, which runs `rsvg-convert` on the generated SVGs:
  - `AppIcon.appiconset/{icon-light,icon-dark,icon-tinted}.png` at 1024 px;
  - `LaunchMark.imageset/launch@{2x,3x}.png` at 400 and 600 px;
  - `Contents.json` files listing the appearances (`luminosity: dark`, `luminosity: tinted`).
- `apple/Iris/Resources/Assets.xcassets/`: AppIcon, LaunchMark, LaunchBackground.colorset (white / black), and `Contents.json`.

- [ ] **Step 1: Failing XCTest** (`IrisTests/BrandTests.swift`):
  - `UIImage(named: "LaunchMark")` is not nil;
  - `UIColor(named: "LaunchBackground")` resolves to white in light and black in dark;
  - the bundle's `CFBundleIcons`, or the build setting `ASSETCATALOG_COMPILER_APPICON_NAME` via Info.plist `CFBundleIconName`, is `AppIcon`.

  Run → FAIL.
- [ ] **Step 2: Implement** the script and the asset catalogue. In `project.yml`, set `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` and `ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS: YES`. Run the script, then look at all three icon PNGs and the launch mark with the Read tool, light and dark. **Step 3:** the tests pass. **Commit** (`feat(iris): app icon in light, dark and tinted; launch assets`).

### Task 3: Launch screen, URL scheme, identity

- **`project.yml`:**
  - Remove `INFOPLIST_KEY_UILaunchScreen_Generation`.
  - Add `info.properties.UILaunchScreen: { UIImageName: LaunchMark, UIColorName: LaunchBackground }`.
  - Add `CFBundleURLTypes: [{ CFBundleURLName: com.peds24.iris, CFBundleURLSchemes: [iris] }]`.
  - Keep `PRODUCT_BUNDLE_IDENTIFIER: com.peds24.iris` and `INFOPLIST_KEY_CFBundleDisplayName: Iris`.
- [ ] **Step 1: Failing XCTest.** In BrandTests:
  - `Bundle.main.bundleIdentifier == "com.peds24.iris"`;
  - the display name is "Iris";
  - `CFBundleURLTypes` contains the scheme `iris`;
  - Info.plist `UILaunchScreen.UIImageName == "LaunchMark"`.

  Run → FAIL on the scheme and the launch screen.
- [ ] **Step 2: Implement. Step 3:** the tests pass, along with all existing tests.
- [ ] **Step 4: Verify in the simulator:**
  1. `xcrun assetutil --info <built Iris.app>/Assets.car` lists AppIcon renditions with `Appearance: NSAppearanceNameDarkAqua` and the tinted appearance.
  2. Launch in light and dark (`xcrun simctl ui booted appearance dark`), capturing a screenshot during launch (`simctl io screenshot` within 300 ms of `simctl launch`) and one of the home screen with the icon. Read them.
  3. `xcrun simctl openurl booted iris://` brings Iris to the front.

  Ledger what each shows.
- [ ] **Commit** (`feat(iris): launch screen, iris:// scheme, Iris identity`).

### Task 4: Docs, verification, review, merge

- [ ] Run `npm run typecheck`, `npm test` and `apple/scripts/test.sh` fresh. Check `git diff --stat iris...HEAD` (Review Focus 5).
- [ ] **Docs:**
  - **`docs/design/iris.html`:** a Mark section showing `mark.svg` and the three icon variants. This needs a generator change in `iris-tokens.js` plus a test.
  - **`components.md`:** a short "Mark" note pointing to `design/iris/mark.json`.
  - **HANDOFF, DEVLOG and `apple/README.md`:** `npm run mark` and `apple/scripts/render-mark.sh`.
  - **Scripts dictionary:** entries for both scripts.
  - **The design spec (`2026-10-06-iris-design.md`):** a §7 note that the mark, bundle ID and icons are decided.
- [ ] Final review (most capable model) with this Review Focus. Fix confirmed findings test first, then merge, push and update memory. Next is I12 (hardening + TestFlight).
