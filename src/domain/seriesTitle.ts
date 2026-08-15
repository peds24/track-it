/** Splits a trailing volume/issue number off a comic or manga title (A10). */

export type ParsedSeriesTitle = { title: string; ordinal: number | null };

// Tried in order; the first that matches the end of the string wins. Each
// captures the number so it can be parsed and stripped in one pass.
const TRAILING_ORDINAL_PATTERNS: readonly RegExp[] = [
  /#\s*(\d+)\s*$/,
  /\b(?:volume|vol\.?)\s+(\d+)\s*$/i,
  /\b(?:issue|iss\.?)\s+(\d+)\s*$/i,
];

/**
 * "Absolute Batman #1" -> { title: "Absolute Batman", ordinal: 1 }.
 * "Berserk Volume 5" -> { title: "Berserk", ordinal: 5 }.
 * No trailing number -> the trimmed title unchanged, ordinal null.
 * A title that would be emptied by stripping (e.g. "#5" typed alone) is left
 * untouched instead — there is nothing sensible left to call the series.
 */
export function parseSeriesTitle(raw: string): ParsedSeriesTitle {
  const trimmed = raw.trim();

  for (const pattern of TRAILING_ORDINAL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const stripped = trimmed.slice(0, match.index).trim();
    if (stripped.length === 0) continue;
    return { title: stripped, ordinal: Number.parseInt(match[1]!, 10) };
  }

  return { title: trimmed, ordinal: null };
}
