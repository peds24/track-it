# Iris component contract

The platform-neutral definition of each Iris component (spec §4.2). iOS
implements it first in SwiftUI (`apple/Iris/DesignSystem/`) and is the
reference rendering. Its screenshots are in `docs/design/iris/` and shown
in `docs/design/iris.html`. The TS kit (`src/ui/iris/`, I13) implements the
same names. Tokens come from `design/iris/tokens.json`; a value written
here as `space.md` or `color.accent` means that token.

Where the platform's own control is the answer (lists, forms, menus, tab
bars, search fields, swipe actions, context menus, empty-state views), Iris
uses it and this file says only how it must behave.

## IrisShelfRow
**Purpose.** One track on a shelf: what it is, where you are, and the one thing to do next.
**Anatomy.** Leading `IrisCover` (row size, 2:3). A text column with the title (`headline`) and a detail line (`subheadline`, `color.secondaryLabel`) prefixed by the compact `IrisCategoryChip`, set inline so chip and detail wrap as one line of text. An optional `IrisProgress` under the text. A trailing accessory: an action button (`IrisSymbol` + short verb, e.g. "Done", "Start", "Resume", "Watched"), an `IrisRatingBadge`, a "Rate" button, or nothing. Insets: `space.lg` horizontal, `space.md` vertical.
**States.** Default; with progress (flat or season-segmented); finished and rated; finished and unrated; long title; no cover. At accessibility text sizes the row stacks: cover, then title, then the detail, progress and accessory full-width below. The title never truncates at accessibility sizes, and wraps to at most 2 lines otherwise.
**Behaviour.** Tapping the row opens the track. Tapping the accessory runs it, with a success haptic, and never opens the row. Swipe and context actions belong to the list, not the row (§5.2).
**Accessibility.** The row is one element. Its label is "<title>, <category>, <detail>"; its value is the rating ("Rated 8.7 out of 10") when the accessory is a rating badge, otherwise the progress. Its default action opens the track. The accessory is also a named custom action (e.g. "Mark Episode 4 watched"). Accessory hit target is ≥ 44×44 pt.

## IrisCover
**Purpose.** A track's cover art, or a deliberate stand-in when there is none.
**Anatomy.** A 2:3 rectangle with `radius.control` continuous corners, the image filled and cropped. Fallback: the category tint at 18% opacity behind the title's initials (`initialsOf`) in the category tint, `title3` weight bold; at row size, the category symbol instead of initials. Sizes: `row` 48 pt wide, `card` 120 pt, `hero` 180 pt, each scaled with text size up to a cap (`row` 72, `card` 160, `hero` 240) so covers never overflow a phone's width.
**States.** Loading and failed both show the fallback (never a spinner or a blank). Loaded shows the image.
**Behaviour.** `http://` URLs are upgraded to `https://` before loading. An empty or unparseable URL is treated as none.
**Accessibility.** Decorative inside a row or card (hidden). Standalone (hero), its label is "Cover of <title>".

## IrisProgress
**Purpose.** How far through a track you are.
**Anatomy.** A 4 pt capsule track in `color.fill` with the fill in `color.accent`. Season mode splits the track into one segment per season, each with flex equal to its episode count (minimum 1) and `space.xxs` gaps.
**States.** Flat (`done of total`); seasons (a list of `{number, episodeCount, done}`).
**Behaviour.** The fraction is clamped to 0…1. A total of 0 or less shows an empty track, and so does a season with 0 episodes. Changes animate with `motion.smooth` (a fade under Reduce Motion).
**Accessibility.** Not separately focusable inside a row. Its value is "<done> of <total>", with `done` clamped to 0…total like the bar. In season mode the value is "Season <current>, <done> of <total> episodes", where `current` is the first season not finished.

## IrisCategoryChip
**Purpose.** Names a track's category at a glance.
**Anatomy.** The category symbol in the category tint, then the label (`caption1` semibold, `color.secondaryLabel`). Regular size sits in a capsule of `color.fill`; compact has no capsule.
**States.** One per category × {regular, compact}.
**Behaviour.** Static.
**Accessibility.** Its label is the category name ("Show"). Compact chips inside a row are folded into the row's label.

## IrisPrimaryButton
**Purpose.** The one prominent action on a screen or sheet ("Add", "Rate it").
**Anatomy.** The platform's prominent button: on iOS 26, `.glassProminent` tinted `color.accent`, label `headline`, optional leading `IrisSymbol`, full-width option. Minimum height 50 pt.
**States.** Enabled, disabled, pressed, in progress (a spinner replaces the symbol and the button is disabled).
**Behaviour.** Success haptic on activation.
**Accessibility.** Its label is the title. While in progress the value is "In progress".

## IrisSheet
**Purpose.** Secondary flows: Add, Rate, the position editor (§5.3).
**Anatomy.** The platform sheet with detents (default medium and large), a visible drag indicator, and the system corner radius (iOS 26 sheets are glass; other platforms use `radius.sheet` and `glass.regular`).
**States.** Medium, large.
**Behaviour.** Dragging between detents and swiping down to dismiss are both available. Destructive confirmation inside a sheet uses the platform's confirmation dialog, never a custom alert.
**Accessibility.** Focus moves into the sheet on present and back to the trigger on dismiss. Escape (or the two-finger scrub gesture) dismisses it.

## IrisEmptyState
**Purpose.** A shelf or search with nothing in it.
**Anatomy.** The platform empty-state view: a symbol, a title, a one-sentence message, and an optional action (an `IrisPrimaryButton` at regular width).
**States.** With and without action.
**Behaviour.** Static apart from the action.
**Accessibility.** Title and message are read in order. The action is a button.

## IrisRatingBadge
**Purpose.** A finished track's score out of 10 (A26).
**Anatomy.** A capsule holding `formatScore(score)` in `subheadline` semibold, monospaced digits. Colours depend on sentiment: liked is `color.accent` fill with `color.onAccent` text; fine is `color.fill` with `color.label`; disliked is `color.destructive` at 15% with `color.destructive` text. Minimum width 44 pt.
**States.** liked, fine, disliked.
**Behaviour.** Static.
**Accessibility.** Its label is "Rated <score> out of 10".

## IrisComparisonCard
**Purpose.** One side of Rate's "which did you prefer?" (A26).
**Anatomy.** A card at `radius.card`, background `color.secondaryGroupedBackground`, holding an `IrisCover` (card size), the title (`headline`, up to 3 lines) and a subtitle (`footnote`, `color.secondaryLabel`, e.g. the creator). Two cards sit side by side; at accessibility sizes they stack.
**States.** Default, pressed (scales to 0.97 with `motion.snappy`, no scale under Reduce Motion), chosen (a 2 pt `color.accent` border, set by the caller).
**Behaviour.** Tapping chooses this side, with a selection haptic.
**Accessibility.** A button labelled "<title>" with hint "Choose this one".

## Materials (glass)
Not a component; the rule every glass surface follows. Floating controls use the platform glass (`glass.regular` or `glass.clear`). Under Reduce Transparency, or where glass isn't available, they use the solid fallback: the glass tint composited over `color.secondaryGroupedBackground`, which is opaque, plus the 1 px glass border. The token's blur is for platforms that composite blur themselves; it is never used under Reduce Transparency.

## IrisSymbol
**Purpose.** Every icon, named for its purpose, so each platform draws its own glyph.
**Anatomy.** iOS uses SF Symbols. Android and web use Material Symbols (Rounded).
**Behaviour.** No bitmap glyphs anywhere (§5.4).
**Accessibility.** Decorative unless it is the only content of a control, in which case the control carries the label.

| Case | SF Symbol | Material Symbol |
| --- | --- | --- |
| `show` | `tv` | `tv` |
| `movie` | `film` | `movie` |
| `book` | `book.closed` | `book` |
| `comic` | `magazine` | `auto_stories` |
| `manga` | `character.book.closed.ja` | `menu_book` |
| `add` | `plus` | `add` |
| `advance` | `checkmark` | `check` |
| `start` | `play.fill` | `play_arrow` |
| `pause` | `pause.fill` | `pause` |
| `rate` | `star` | `star` |
| `rankings` | `list.number` | `format_list_numbered` |
| `scan` | `barcode.viewfinder` | `barcode_scanner` |
| `search` | `magnifyingglass` | `search` |
| `delete` | `trash` | `delete` |
| `more` | `ellipsis` | `more_horiz` |
| `emptyShelf` | `tray` | `inbox` |
| `gallery` | `swatchpalette` | `palette` |
