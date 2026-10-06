import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/genres.test.ts. JSON has no
// `undefined`, so the original's undefined element becomes null.
export const cases: FixtureCase[] = [
  { name: 'splits path-style categories into separate genres', fn: 'genresFrom', args: [['Fiction / Fantasy / Epic']] },
  { name: 'drops filler and case-insensitive duplicates, keeping first spelling', fn: 'genresFrom', args: [['Fiction / General', 'fiction', 'Horror', null, '']] },
  { name: 'nothing in, nothing out', fn: 'genresFrom', args: [null] },
  { name: 'nothing in, nothing out (2)', fn: 'genresFrom', args: [[]] },
  { name: 'withGenres adds the key only when there is something to add', fn: 'withGenres', args: [{ a: 1 }, ['Drama']] },
  { name: 'withGenres adds the key only when there is something to add (2)', fn: 'withGenres', args: [{ a: 1 }, ['General']] },
  { name: 'Swift parity: filler, padding and case duplicates', fn: 'genresFrom', args: [['Sci-Fi / General / Other', ' Drama ', 'DRAMA']] },
];
