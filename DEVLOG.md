# DEVLOG

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
- **Bottom Navigation**: Removed circular ripple press overlay, reinforced active pill highlight container (`radius.full`), and gave active/inactive tabs distinct bold typography weights (800 / 600).
- **Navigation Action**: Replaced `<Link asChild>` with direct `Pressable` + `useRouter().push('/add')` with a filled primary pill style (`elevation.level1`).
- **Row Advance Action**: Switched row advance (`Done`/`Start`/`Resume`) to an outlined pill button (`borderWidth: 1.5`, `borderColor: c.primary`) to visually separate it from the filled `+ Add` primary action.
- **Swipe Action Geometry**: Reduced swipe action rectangle to a compact, vertically centered pill (`width: 68`, `borderRadius: radius.full`, inset 10dp) preventing edge cutoff when swiping.

