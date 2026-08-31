import { Platform, useColorScheme } from 'react-native';

/**
 * Material Design 3 (M3) Semantic Color Palette.
 * Derived from tonal palettes to ensure accessible contrast ratios and dynamic theming.
 */
export type Palette = {
  // Primary Accent
  readonly primary: string;
  readonly onPrimary: string;
  readonly primaryContainer: string;
  readonly onPrimaryContainer: string;

  // Secondary Accent
  readonly secondary: string;
  readonly onSecondary: string;
  readonly secondaryContainer: string;
  readonly onSecondaryContainer: string;

  // Tertiary Accent
  readonly tertiary: string;
  readonly onTertiary: string;
  readonly tertiaryContainer: string;
  readonly onTertiaryContainer: string;

  // Feedback & Error
  readonly error: string;
  readonly onError: string;
  readonly errorContainer: string;
  readonly onErrorContainer: string;

  // Surfaces & Base
  readonly surface: string;
  readonly onSurface: string;
  readonly surfaceVariant: string;
  readonly onSurfaceVariant: string;
  readonly surfaceDim: string;
  readonly surfaceBright: string;

  // Surface Containers (Elevation Hierarchy)
  readonly surfaceContainerLowest: string;
  readonly surfaceContainerLow: string;
  readonly surfaceContainer: string;
  readonly surfaceContainerHigh: string;
  readonly surfaceContainerHighest: string;

  // Outlines & Borders
  readonly outline: string;
  readonly outlineVariant: string;

  // Inverses & Scrim
  readonly inverseSurface: string;
  readonly inverseOnSurface: string;
  readonly inversePrimary: string;
  readonly scrim: string;
  readonly shadow: string;

  // Compatibility aliases
  readonly bg: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly rule: string;
  readonly ruleStrong: string;
  readonly chip: string;
};

export const palettes: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    // M3 Indigo / Deep Teal Key Colors (Authentic Material 3)
    primary: '#0061A4',
    onPrimary: '#FFFFFF',
    primaryContainer: '#D1E4FF',
    onPrimaryContainer: '#001D36',

    secondary: '#535F70',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#D7E3F7',
    onSecondaryContainer: '#101C2B',

    tertiary: '#6B5778',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#F2DAFF',
    onTertiaryContainer: '#251431',

    error: '#BA1A1A',
    onError: '#FFFFFF',
    errorContainer: '#FFDAD6',
    onErrorContainer: '#410002',

    surface: '#FDFBFF',
    onSurface: '#1A1C1E',
    surfaceVariant: '#DFE2EB',
    onSurfaceVariant: '#43474E',
    surfaceDim: '#D9D9E0',
    surfaceBright: '#FDFBFF',

    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F7F8FC',
    surfaceContainer: '#F1F3F8',
    surfaceContainerHigh: '#EBEFF4',
    surfaceContainerHighest: '#E2E6EC',

    outline: '#73777F',
    outlineVariant: '#C3C7D0',

    inverseSurface: '#2F3033',
    inverseOnSurface: '#F1F0F4',
    inversePrimary: '#9ECAFF',
    scrim: '#000000',
    shadow: '#000000',

    // Aliases
    bg: '#F7F8FC',
    ink: '#1A1C1E',
    muted: '#43474E',
    faint: '#73777F',
    rule: '#C3C7D0',
    ruleStrong: '#73777F',
    chip: '#E2E6EC',
  },
  dark: {
    // M3 Dark Palette (Tonal mappings for dark surfaces)
    primary: '#9ECAFF',
    onPrimary: '#003258',
    primaryContainer: '#00497D',
    onPrimaryContainer: '#D1E4FF',

    secondary: '#BBC7DB',
    onSecondary: '#253140',
    secondaryContainer: '#3B4858',
    onSecondaryContainer: '#D7E3F7',

    tertiary: '#D7BDE4',
    onTertiary: '#3B2948',
    tertiaryContainer: '#523F5F',
    onTertiaryContainer: '#F2DAFF',

    error: '#FFB4AB',
    onError: '#690005',
    errorContainer: '#93000A',
    onErrorContainer: '#FFDAD6',

    surface: '#111318',
    onSurface: '#E2E2E9',
    surfaceVariant: '#43474E',
    onSurfaceVariant: '#C3C7D0',
    surfaceDim: '#111318',
    surfaceBright: '#37393E',

    surfaceContainerLowest: '#0C0E13',
    surfaceContainerLow: '#191C20',
    surfaceContainer: '#1D2024',
    surfaceContainerHigh: '#282A2F',
    surfaceContainerHighest: '#33353A',

    outline: '#8D9199',
    outlineVariant: '#43474E',

    inverseSurface: '#E2E2E9',
    inverseOnSurface: '#1A1C1E',
    inversePrimary: '#0061A4',
    scrim: '#000000',
    shadow: '#000000',

    // Aliases
    bg: '#111318',
    ink: '#E2E2E9',
    muted: '#C3C7D0',
    faint: '#8D9199',
    rule: '#43474E',
    ruleStrong: '#8D9199',
    chip: '#282A2F',
  },
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/**
 * Material 3 Shape Scale:
 * - none: 0
 * - xs (extraSmall): 4dp (snackbars, text field top corners)
 * - sm (small): 8dp (chips, text fields)
 * - md (medium): 12dp (cards, action sheets)
 * - lg (large): 16dp (standard cards, navigation drawer)
 * - xl (extraLarge): 28dp (dialogs, bottom sheets, FABs)
 * - full: 9999 (pills, buttons, active navigation indicators)
 */
export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  full: 9999,
  // Backward-compatibility aliases
  chip: 8,
  bar: 9999,
  control: 8,
} as const;

/**
 * Material 3 Elevation & Shadow presets
 */
export const elevation = {
  level0: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  level1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 1,
  },
  level2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  level3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  level4: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  level5: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 12,
  },
} as const;

export const layout = {
  inset: 16,
  headerTop: 20,
  headerBottom: 12,
  rowTop: 12,
  rowBottom: 12,
  rowGap: 14,
  metaGap: 6,
  progressHeight: 6,
} as const;

export const googleSans = Platform.select({
  ios: 'Google Sans',
  android: 'Google Sans',
  default: 'Google Sans, Roboto, -apple-system, sans-serif',
});

export const systemSans = googleSans;

export const monoFace = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/**
 * Material 3 Typescale:
 * 5 roles (Display, Headline, Title, Body, Label) × 3 sizes (Large, Medium, Small)
 * Powered by Google Sans.
 */
export const font = {
  // M3 Official Scale
  displayLarge: { fontFamily: googleSans, fontSize: 57, lineHeight: 64, fontWeight: '400' as const, letterSpacing: -0.25 },
  displayMedium: { fontFamily: googleSans, fontSize: 45, lineHeight: 52, fontWeight: '400' as const, letterSpacing: 0 },
  displaySmall: { fontFamily: googleSans, fontSize: 36, lineHeight: 44, fontWeight: '400' as const, letterSpacing: 0 },

  headlineLarge: { fontFamily: googleSans, fontSize: 32, lineHeight: 40, fontWeight: '400' as const, letterSpacing: 0 },
  headlineMedium: { fontFamily: googleSans, fontSize: 28, lineHeight: 36, fontWeight: '400' as const, letterSpacing: 0 },
  headlineSmall: { fontFamily: googleSans, fontSize: 24, lineHeight: 32, fontWeight: '400' as const, letterSpacing: 0 },

  titleLarge: { fontFamily: googleSans, fontSize: 22, lineHeight: 28, fontWeight: '500' as const, letterSpacing: 0 },
  titleMedium: { fontFamily: googleSans, fontSize: 16, lineHeight: 24, fontWeight: '500' as const, letterSpacing: 0.15 },
  titleSmall: { fontFamily: googleSans, fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },

  bodyLarge: { fontFamily: googleSans, fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing: 0.5 },
  bodyMedium: { fontFamily: googleSans, fontSize: 14, lineHeight: 20, fontWeight: '400' as const, letterSpacing: 0.25 },
  bodySmall: { fontFamily: googleSans, fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0.4 },

  labelLarge: { fontFamily: googleSans, fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  labelMedium: { fontFamily: googleSans, fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5 },
  labelSmall: { fontFamily: googleSans, fontSize: 11, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5 },

  // Compatibility aliases
  screenTitle: { fontFamily: googleSans, fontSize: 28, lineHeight: 36, fontWeight: '600' as const, letterSpacing: 0 },
  rowTitle: { fontFamily: googleSans, fontSize: 16, lineHeight: 24, fontWeight: '600' as const, letterSpacing: 0.15 },
  body: { fontFamily: googleSans, fontSize: 14, lineHeight: 20, fontWeight: '400' as const, letterSpacing: 0.25 },
  option: { fontFamily: googleSans, fontSize: 16, lineHeight: 24, fontWeight: '500' as const, letterSpacing: 0.15 },
  meta: { fontFamily: googleSans, fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0.25 },
  count: { fontFamily: googleSans, fontSize: 12, lineHeight: 16, fontWeight: '600' as const, letterSpacing: 0.25 },
  control: { fontFamily: googleSans, fontSize: 14, lineHeight: 20, fontWeight: '600' as const, letterSpacing: 0.1 },
  kind: { fontFamily: googleSans, fontSize: 11, lineHeight: 14, fontWeight: '700' as const, letterSpacing: 0.5 },
} as const;

export const underline = {
  textDecorationLine: 'none',
} as const;

