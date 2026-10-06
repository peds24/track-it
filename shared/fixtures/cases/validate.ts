import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/validate.test.ts. assert* return
// undefined (recorded as null) or throw (recorded as `throws`).
export const cases: FixtureCase[] = [
  ...['book', 'movie', 'comic', 'episode', 'issue', 'volume', 'podcast'].map((m) => ({
    name: `only book and movie are standalone media types (A16: and comic): ${m}`,
    fn: 'isStandaloneMediaType',
    args: [m],
  })),
  {
    name: 'a parentless entry may not carry a unit label as its media type',
    fn: 'assertEntryInvariants',
    args: [{ mediaType: 'episode', parentUnitLabel: null, createdAt: '2026-08-12T10:00:00.000Z' }],
  },
  { name: "a parented entry's media type must equal its parent's unit label", fn: 'assertEntryInvariants', args: [{ mediaType: 'episode', parentUnitLabel: 'volume' }] },
  { name: "a parented entry's media type must equal its parent's unit label (2)", fn: 'assertEntryInvariants', args: [{ mediaType: 'volume', parentUnitLabel: 'volume' }] },
  ...['2026-08-12T10:00:00.000Z', '2026-08-12', 'not-a-date', 'March 3 2026', '', '2026-13-45T99:00:00Z'].map((v, i) => ({
    name: `timestamps must be ISO-8601, not merely parseable${i ? ` (${i + 1})` : ''}`,
    fn: 'isIsoTimestamp',
    args: [v],
  })),
  { name: 'null timestamps are allowed, bad ones are not', fn: 'assertIsoTimestamp', args: [null, 'startedAt'] },
  { name: 'null timestamps are allowed, bad ones are not (2)', fn: 'assertIsoTimestamp', args: ['nope', 'startedAt'] },
  ...[null, 0, 12, -4.5, -1, 2.5].map((v, i) => ({
    name: `ordinals must be non-negative whole numbers${i ? ` (${i + 1})` : ''}`,
    fn: 'assertOrdinal',
    args: [v],
  })),
  ...(['createdAt', 'startedAt', 'finishedAt'] as const).map((field) => ({
    name: `assertEntryInvariants checks every timestamp field: ${field}`,
    fn: 'assertEntryInvariants',
    args: [{ mediaType: 'book', parentUnitLabel: null, [field]: 'not-a-date' }],
  })),
  { name: 'assertMediaTypeMatchesParent: a unit label with no parent throws', fn: 'assertMediaTypeMatchesParent', args: ['issue', null] },
  { name: 'assertMediaTypeMatchesParent: a matching parent passes', fn: 'assertMediaTypeMatchesParent', args: ['issue', 'issue'] },
];
