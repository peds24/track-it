import {
  assertEntryInvariants,
  assertIsoTimestamp,
  assertOrdinal,
  isIsoTimestamp,
  isStandaloneMediaType,
} from '@/domain/validate';

test('only book and movie are standalone media types', () => {
  expect(isStandaloneMediaType('book')).toBe(true);
  expect(isStandaloneMediaType('movie')).toBe(true);
  for (const unit of ['episode', 'issue', 'volume', 'podcast']) {
    expect(isStandaloneMediaType(unit)).toBe(false);
  }
});

test('a parentless entry may not carry a unit label as its media type', () => {
  expect(() =>
    assertEntryInvariants({ mediaType: 'episode', parentUnitLabel: null, createdAt: '2026-08-12T10:00:00.000Z' }),
  ).toThrow(/no parent series/);
});

test("a parented entry's media type must equal its parent's unit label", () => {
  expect(() =>
    assertEntryInvariants({ mediaType: 'episode', parentUnitLabel: 'volume' }),
  ).toThrow(/tracked in volumes/);
  expect(() => assertEntryInvariants({ mediaType: 'volume', parentUnitLabel: 'volume' })).not.toThrow();
});

test('timestamps must be ISO-8601, not merely parseable', () => {
  expect(isIsoTimestamp('2026-08-12T10:00:00.000Z')).toBe(true);
  expect(isIsoTimestamp('2026-08-12')).toBe(true);
  // Date.parse accepts these; lexicographic sorting does not, so they are rejected.
  expect(isIsoTimestamp('not-a-date')).toBe(false);
  expect(isIsoTimestamp('March 3 2026')).toBe(false);
  expect(isIsoTimestamp('')).toBe(false);
  expect(isIsoTimestamp('2026-13-45T99:00:00Z')).toBe(false);
});

test('null timestamps are allowed, bad ones are not', () => {
  expect(() => assertIsoTimestamp(null, 'startedAt')).not.toThrow();
  expect(() => assertIsoTimestamp('nope', 'startedAt')).toThrow(/startedAt/);
});

test('ordinals must be non-negative whole numbers', () => {
  expect(() => assertOrdinal(null)).not.toThrow();
  expect(() => assertOrdinal(0)).not.toThrow();
  expect(() => assertOrdinal(12)).not.toThrow();
  expect(() => assertOrdinal(-4.5)).toThrow(/non-negative whole number/);
  expect(() => assertOrdinal(-1)).toThrow(/non-negative whole number/);
  expect(() => assertOrdinal(2.5)).toThrow(/non-negative whole number/);
});

test('assertEntryInvariants checks every timestamp field', () => {
  const base = { mediaType: 'book', parentUnitLabel: null } as const;
  expect(() => assertEntryInvariants({ ...base, createdAt: 'not-a-date' })).toThrow(/createdAt/);
  expect(() => assertEntryInvariants({ ...base, startedAt: 'not-a-date' })).toThrow(/startedAt/);
  expect(() => assertEntryInvariants({ ...base, finishedAt: 'not-a-date' })).toThrow(/finishedAt/);
});
