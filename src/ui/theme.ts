import { useColorScheme } from 'react-native';

/**
 * Colour resolves per scheme (docs/design/design-language.html, "Palette"), so it
 * cannot live in a frozen object the way the metrics can. Components read it
 * through `useTheme()`; everything scheme-independent stays a plain export.
 *
 * The accent lightens rather than inverting in dark: #2B50E0 on near-black fails
 * contrast at the 10.5pt the kind label uses.
 */
export type Palette = {
  readonly bg: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly rule: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly onAccent: string;
  /**
   * The surface behind a revealed swipe action. Achromatic, so the only colour
   * in a resting list is still the accent.
   */
  readonly chip: string;
  /**
   * Semantic, not decorative — the one colour outside the accent, reserved for
   * an action that destroys data. The design language is otherwise achromatic;
   * a delete that looks like every other control is worse than a second hue.
   */
  readonly danger: string;
  /**
   * A6: the swipe action that pauses a track — distinct from danger because
   * pausing is reversible (Resume undoes it) where delete is not. A colour
   * that reads as "caution" rather than "destroyed" earns its own hue.
   */
  readonly pause: string;
};

export const palettes: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    bg: '#FFFFFF',
    ink: '#16181D',
    muted: '#6E727B',
    faint: '#9AA0AA',
    rule: '#E7E9ED',
    accent: '#2B50E0',
    accentSoft: '#EDF0FE',
    /** Text on a filled accent control — white in both schemes, by spec. */
    onAccent: '#FFFFFF',
    chip: '#F2F3F6',
    danger: '#C4342B',
    pause: '#C2660B',
  },
  dark: {
    bg: '#0B0D10',
    ink: '#F2F4F7',
    muted: '#979DA7',
    faint: '#6A6F78',
    rule: '#23272E',
    accent: '#8AA0FF',
    accentSoft: '#182040',
    onAccent: '#FFFFFF',
    chip: '#191D23',
    danger: '#E5584D',
    pause: '#E8873A',
  },
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

export const radius = { sm: 7, md: 8, chip: 9, bar: 1.5, control: 8 } as const;

/**
 * Screen metrics taken from the mockups, which are the rendered spec. The inset
 * is 20 there rather than the 24 the rhythm table names for `space.lg`; the
 * mockups win, since they are what the design was signed off against.
 */
export const layout = {
  inset: 20,
  headerTop: 28,
  headerBottom: 14,
  rowTop: 14,
  rowBottom: 15,
  /** Text column to advance control. */
  rowGap: 16,
  metaGap: 7,
  progressHeight: 3,
} as const;

/**
 * React Native only accepts weights in hundreds, so the spec's 660/640/520/480
 * are rounded to the nearest hundred. Tracking is expressed in points (em x size).
 */
export const font = {
  screenTitle: { fontSize: 27, fontWeight: '600', letterSpacing: -0.6 },
  rowTitle: { fontSize: 17, fontWeight: '500', letterSpacing: -0.17 },
  body: { fontSize: 16, fontWeight: '500' },
  option: { fontSize: 17, fontWeight: '500' },
  meta: { fontSize: 13, fontWeight: '400' },
  control: { fontSize: 13, fontWeight: '500' },
  kind: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.9 },
} as const;
