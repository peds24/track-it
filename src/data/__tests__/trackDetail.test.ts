import { addTrack } from '@/data/addTrack';
import { advanceEntry, createSeriesTrack, getTrackDetail } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import { createMemoryDriver } from '../../../test/memoryDriver';

const T0 = '2026-09-01T12:00:00.000Z';
const DUNE_META = {
  coverUrl: 'https://books.google.com/dune.jpg',
  creator: 'Frank Herbert',
  description: 'Spice.',
  releaseYear: '1965',
};

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('a standalone add stores its metadata and marks it checked', async () => {
  const db = await freshDb();
  const created = await addTrack(
    db,
    { title: 'Dune', category: 'book', count: 1, match: { id: 'gb1', title: 'Dune', category: 'book', count: 1 }, metadata: DUNE_META },
    T0,
  );

  const detail = await getTrackDetail(db, 'entry', created.id);

  expect(detail?.metadata).toEqual(DUNE_META);
  expect(detail?.summary.title).toBe('Dune');
  expect(detail?.unitLabel).toBeNull();
  const [row] = await db.all<{ metadata_checked_at: string | null }>('SELECT metadata_checked_at FROM entry');
  expect(row?.metadata_checked_at).toBe(T0);
});

test('a hand-typed add has empty metadata and is not marked checked', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Notes', category: 'book', count: 1 }, T0);

  const detail = await getTrackDetail(db, 'entry', created.id);

  expect(detail?.metadata).toEqual({ coverUrl: null, creator: null, description: null, releaseYear: null });
  const [row] = await db.all<{ metadata_checked_at: string | null }>('SELECT metadata_checked_at FROM entry');
  expect(row?.metadata_checked_at).toBeNull();
});

test('a series stores draft metadata on the series row and reports a timeline', async () => {
  const db = await freshDb();
  const id = await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
      externalSource: 'tmdb',
      externalId: '95396',
      metadata: { coverUrl: 'https://image.tmdb.org/t/p/w342/x.jpg', creator: 'Dan Erickson', description: null, releaseYear: '2022' },
    },
    T0,
  );
  const [first] = await db.all<{ id: string }>('SELECT id FROM entry WHERE ordinal = 1');
  await advanceEntry(db, first!.id, '2026-09-03T12:00:00.000Z');

  const detail = await getTrackDetail(db, 'series', id);

  expect(detail?.metadata.creator).toBe('Dan Erickson');
  expect(detail?.unitLabel).toBe('episode');
  expect(detail?.summary.shelf).toBe('currently');
  expect(detail?.timeline).toEqual({ addedAt: T0, startedAt: '2026-09-03T12:00:00.000Z', finishedAt: null });
});

test('a missing track returns null', async () => {
  const db = await freshDb();
  expect(await getTrackDetail(db, 'series', 'nope')).toBeNull();
});
