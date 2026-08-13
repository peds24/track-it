import { ManualProvider, unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';

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

test('every category resolves to ManualProvider in v1', () => {
  for (const category of ['show', 'movie', 'book', 'comic', 'manga'] as const) {
    expect(providerFor(category)).toBeInstanceOf(ManualProvider);
  }
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
