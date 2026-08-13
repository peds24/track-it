import { addTrack } from '@/data/addTrack';
import { listTracks } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('adding a manga generates one entry per volume', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 3 }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.progress).toEqual({ done: 0, total: 3 });
  expect(track!.nextEntryTitle).toBe('Volume 1');
});

test('adding a book ignores the count and creates one standalone entry', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 5 }, NOW);

  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  const [track] = await listTracks(db, 'backlog');
  expect(track!.kind).toBe('entry');
  expect(track!.progress).toBeNull();
});

test('adding a track with a blank title is rejected', async () => {
  const db = await freshDb();
  await expect(
    addTrack(db, { title: '   ', category: 'book', count: 1 }, NOW),
  ).rejects.toThrow(/title/i);
});
