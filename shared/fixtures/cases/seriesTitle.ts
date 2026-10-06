import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/seriesTitle.test.ts.
const parse = (name: string, raw: string): FixtureCase => ({ name, fn: 'parseSeriesTitle', args: [raw] });
const bare = (name: string, raw: string): FixtureCase => ({ name, fn: 'stripBareTrailingNumber', args: [raw] });

export const cases: FixtureCase[] = [
  parse('strips a trailing #N', 'Absolute Batman #1'),
  parse('strips a trailing #N with no space before the number', 'Saga #12'),
  ...['Berserk Volume 5', 'Berserk Vol 5', 'Berserk Vol. 5'].map((raw) => parse(`strips a trailing volume form: ${raw}`, raw)),
  ...['Chainsaw Man Issue 12', 'Chainsaw Man Iss 12', 'Chainsaw Man Iss. 12'].map((raw) => parse(`strips a trailing issue form: ${raw}`, raw)),
  parse('matching is case-insensitive for volume/issue forms', 'Berserk VOLUME 5'),
  parse('matching is case-insensitive for volume/issue forms (2)', 'Chainsaw Man issue 12'),
  parse('no trailing number leaves the title untouched', 'Absolute Batman'),
  parse('trims incidental whitespace even with no match', '  Absolute Batman  '),
  parse('does not strip when doing so would empty the title', '#5'),
  parse('does not strip when doing so would empty the title (2)', 'Volume 5'),
  bare('stripBareTrailingNumber: strips a bare trailing number', 'Attack on Titan 30'),
  bare('stripBareTrailingNumber: no trailing number leaves the title untouched', 'Attack on Titan'),
  bare('stripBareTrailingNumber: does not strip when doing so would empty the title', '30'),
  bare('stripBareTrailingNumber: trims incidental whitespace even with no match', '  Attack on Titan  '),
];
