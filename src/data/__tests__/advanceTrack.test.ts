import { migrate } from '@/db/schema';
import { advanceEntry, createSeriesTrack, createStandaloneTrack, listTracks } from '@/data/trackRepo';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('advancing the first episode moves a show from backlog to currently', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
    },
    NOW,
  );

  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  expect(await listTracks(db, 'backlog')).toHaveLength(0);
  const [current] = await listTracks(db, 'currently');
  expect(current!.progress).toEqual({ done: 1, total: 2 });
  expect(current!.nextEntryTitle).toBe('Episode 2');
});

test('advancing a book once makes it currently, not done', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'currently')).toHaveLength(1);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing a movie once completes it', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing a finished entry throws and leaves the row unchanged', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);
  await advanceEntry(db, id, NOW);

  await expect(advanceEntry(db, id, NOW)).rejects.toThrow(/already done/);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing an unknown entry throws', async () => {
  const db = await freshDb();
  await expect(advanceEntry(db, 'nope', NOW)).rejects.toThrow(/not found/);
});
