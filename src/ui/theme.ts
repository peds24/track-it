import { Platform, useColorScheme } from 'react-native';

/**
 * Colour resolves per scheme (docs/design/design-language.html, "Palette"), so it
 * cannot live in a frozen object the way the metrics can. Components read it
 * through `useTheme()`; everything scheme-independent stays a plain export.
 *
 * There is no accent, danger or pause any more — the design went fully
 * achromatic. What colour used to signal (a kind label, a header action, an
 * irreversible swipe action) is now underline or weight/inversion instead;
 * see TrackRow and SwipeableTrackRow.
 */
export type Palette = {
  readonly bg: string;
  readonly ink: string;
  readonly muted: string;
  readonly faint: string;
  readonly rule: string;
  /** Bordered controls (buttons, chips, fields) draw from this, not `rule` —
   * a list is quiet, a control is not, and the two should not share a weight. */
  readonly ruleStrong: string;
  /** The surface behind a revealed, not-yet-inverted swipe action (Pause). */
  readonly chip: string;
};

export const palettes: { readonly light: Palette; readonly dark: Palette } = {
  light: {
    // The colour of an e-ink panel's own film, not paper-white software
    // convention — a grey with green in it.
    bg: '#DCDFD0',
    ink: '#111208',
    muted: '#4B4F3F',
    faint: '#767A67',
    rule: '#C6CAB6',
    ruleStrong: '#111208',
    chip: '#D2D5C4',
  },
  dark: {
    // Deliberately not tinted the way light is — e-ink is reflective and
    // light-only, so there is no authentic dark panel to chase. Plain dark.
    bg: '#08090B',
    ink: '#F3F4F6',
    muted: '#C6C9CF',
    faint: '#8B8F97',
    rule: '#2A2E34',
    ruleStrong: '#F3F4F6',
    chip: '#191C21',
  },
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

export const radius = { sm: 3, md: 3, chip: 3, bar: 0, control: 3 } as const;

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
  progressHeight: 4,
} as const;

/**
 * The platform's own font, still — just its monospace register (SF Mono on
 * iOS, Roboto Mono on Android) rather than the proportional one. Sharper at
 * small sizes, and every glyph sits in an equal box, the way it does on the
 * e-ink panels this pass is chasing. `ui-monospace`/`Roboto Mono` are not
 * addressable through React Native's plain `fontFamily` string the way they
 * are in CSS, so this picks the closest always-available system face per
 * platform instead of bundling one.
 */
export const monoFace = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * React Native only accepts weights in hundreds. The scale collapsed to three
 * stops this pass — regular, medium, bold — because a system monospace face
 * rarely ships the six-step gradient a variable proportional face does.
 * Letter-spacing dropped out everywhere except the uppercase kind label: a
 * monospace face is already an even grid, and tightening it just crowds the
 * boxes rather than closing up curves the way it did on the old face.
 */
export const font = {
  screenTitle: { fontFamily: monoFace, fontSize: 38, fontWeight: '700', letterSpacing: 0 },
  rowTitle: { fontFamily: monoFace, fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  body: { fontFamily: monoFace, fontSize: 16, fontWeight: '400', letterSpacing: 0 },
  option: { fontFamily: monoFace, fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  meta: { fontFamily: monoFace, fontSize: 13, fontWeight: '400', letterSpacing: 0 },
  /** "4 of 34" — bolder than the meta line it sits beside. */
  count: { fontFamily: monoFace, fontSize: 13, fontWeight: '600', letterSpacing: 0 },
  control: { fontFamily: monoFace, fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  kind: { fontFamily: monoFace, fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
} as const;

/** Shared so every underline in the app reads as the same one mark, not a
 * handful of similar-but-not-identical ones. */
export const underline = {
  textDecorationLine: 'underline',
} as const;
