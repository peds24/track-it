import { ManualProvider, MAX_UNITS, unitLabelFor } from '@/providers/manual';

test('manual search returns nothing — there is no catalogue in v1', async () => {
  await expect(new ManualProvider().search('berserk')).resolves.toEqual([]);
});

test('hydrate generates numbered volume entries for a manga', async () => {
  const draft = await new ManualProvider().hydrate({
    id: 'manual',
    title: 'Berserk',
    category: 'manga',
    count: 3,
  });

  expect(draft.mediaType).toBe('manga');
  expect(draft.unitLabel).toBe('volume');
  expect(draft.entries).toEqual([
    { ordinal: 1, title: 'Volume 1' },
    { ordinal: 2, title: 'Volume 2' },
    { ordinal: 3, title: 'Volume 3' },
  ]);
});

test('hydrate labels show entries as episodes', async () => {
  const draft = await new ManualProvider().hydrate({
    id: 'manual',
    title: 'Severance',
    category: 'show',
    count: 2,
  });
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Episode 1' });
});

test('hydrate rejects a count below 1', async () => {
  await expect(
    new ManualProvider().hydrate({ id: 'manual', title: 'X', category: 'show', count: 0 }),
  ).rejects.toThrow(/at least 1/);
});

test('unitLabelFor maps each category, with null for standalone ones', () => {
  expect(unitLabelFor('show')).toBe('episode');
  expect(unitLabelFor('comic')).toBe('issue');
  expect(unitLabelFor('manga')).toBe('volume');
  expect(unitLabelFor('book')).toBeNull();
  expect(unitLabelFor('movie')).toBeNull();
});

test('hydrate generates numbered issue entries for a comic', async () => {
  const draft = await new ManualProvider().hydrate({
    id: 'manual',
    title: 'Saga',
    category: 'comic',
    count: 2,
  });

  expect(draft.mediaType).toBe('comic');
  expect(draft.unitLabel).toBe('issue');
  expect(draft.entries).toEqual([
    { ordinal: 1, title: 'Issue 1' },
    { ordinal: 2, title: 'Issue 2' },
  ]);
});

test.each(['book', 'movie'] as const)(
  'hydrate rejects %s — a standalone track has no entries to generate',
  async (category) => {
    await expect(
      new ManualProvider().hydrate({ id: 'manual', title: 'X', category, count: 3 }),
    ).rejects.toThrow(`${category} is a standalone track and has no entries to generate`);
  },
);

test('hydrate rejects a fractional count rather than silently truncating it', async () => {
  await expect(
    new ManualProvider().hydrate({ id: 'manual', title: 'X', category: 'show', count: 2.5 }),
  ).rejects.toThrow(/whole number/);
});

test('hydrate rejects a count above the upper bound', async () => {
  // A mistyped "3000000" would issue that many INSERTs in one transaction.
  await expect(
    new ManualProvider().hydrate({ id: 'manual', title: 'X', category: 'show', count: 3_000_000 }),
  ).rejects.toThrow(new RegExp(`more than ${MAX_UNITS}`));
  await expect(
    new ManualProvider().hydrate({ id: 'manual', title: 'X', category: 'show', count: MAX_UNITS + 1 }),
  ).rejects.toThrow(/more than/);
});

test('hydrate accepts an ongoing series with no usable count', async () => {
  // The Add screen never collects a count for an ongoing series, so it arrives
  // here as NaN — that must not trip the whole-number check meant for finite
  // series.
  const draft = await new ManualProvider().hydrate({
    id: 'manual',
    title: 'Pluribus',
    category: 'show',
    count: Number.NaN,
    ongoing: true,
  });
  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Episode 1' }]);
});

test('hydrate accepts a count exactly at the bound', async () => {
  const draft = await new ManualProvider().hydrate({
    id: 'manual',
    title: 'X',
    category: 'show',
    count: MAX_UNITS,
  });
  expect(draft.entries).toHaveLength(MAX_UNITS);
});
