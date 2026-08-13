import { migrate } from '@/db/schema';
import { createSeriesTrack, createStandaloneTrack, listTracks } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('creating a series track writes the series and all its entries', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Berserk',
      mediaType: 'manga',
      unitLabel: 'volume',
      entries: [
        { ordinal: 1, title: 'Volume 1' },
        { ordinal: 2, title: 'Volume 2' },
      ],
    },
    NOW,
  );

  const entries = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(entries.map((e) => e.title)).toEqual(['Volume 1', 'Volume 2']);
});

test('a newly created series track lands in the backlog', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    { title: 'Severance', mediaType: 'show', unitLabel: 'episode', entries: [{ ordinal: 1, title: 'Episode 1' }] },
    NOW,
  );

  const backlog = await listTracks(db, 'backlog');
  expect(backlog).toHaveLength(1);
  expect(backlog[0]!.title).toBe('Severance');
  expect(backlog[0]!.progress).toEqual({ done: 0, total: 1 });
  expect(backlog[0]!.nextEntryTitle).toBe('Episode 1');
});

test('a standalone book is created with no series row', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  const backlog = await listTracks(db, 'backlog');
  expect(backlog[0]).toMatchObject({ kind: 'entry', title: 'Dune', category: 'book', progress: null });
});

test('listTracks filters by category', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);

  const books = await listTracks(db, 'backlog', 'book');
  expect(books.map((t) => t.title)).toEqual(['Dune']);
});

test('listTracks sorts by date added, newest first', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Older', category: 'book' }, '2026-08-01T00:00:00.000Z');
  await createStandaloneTrack(db, { title: 'Newer', category: 'book' }, '2026-08-10T00:00:00.000Z');

  const backlog = await listTracks(db, 'backlog');
  expect(backlog.map((t) => t.title)).toEqual(['Newer', 'Older']);
});
