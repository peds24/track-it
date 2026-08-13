import { exportLibrary, importLibrary } from '@/data/backup';
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

test('a library survives an export/import round trip', async () => {
  const source = await freshDb();
  await addTrack(source, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
  const json = await exportLibrary(source);

  const target = await freshDb();
  await importLibrary(target, json);

  const tracks = await listTracks(target, 'backlog');
  expect(tracks).toHaveLength(1);
  expect(tracks[0]!.title).toBe('Berserk');
  expect(tracks[0]!.progress).toEqual({ done: 0, total: 2 });
});

test('import replaces the existing library rather than merging', async () => {
  const source = await freshDb();
  await addTrack(source, { title: 'Berserk', category: 'manga', count: 1 }, NOW);
  const json = await exportLibrary(source);

  const target = await freshDb();
  await addTrack(target, { title: 'Dune', category: 'book', count: 1 }, NOW);
  await importLibrary(target, json);

  const titles = (await listTracks(target, 'backlog')).map((t) => t.title);
  expect(titles).toEqual(['Berserk']);
});

test('malformed JSON is rejected and leaves the library untouched', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  await expect(importLibrary(db, '{ not json')).rejects.toThrow();
  expect(await listTracks(db, 'backlog')).toHaveLength(1);
});

test('a payload with an invalid status is rejected before any write', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  const bad = JSON.stringify({
    version: 1,
    series: [],
    entries: [
      { id: 'x', seriesId: null, title: 'Bad', ordinal: null, mediaType: 'book', status: 'reading', startedAt: null, finishedAt: null, createdAt: NOW },
    ],
  });

  await expect(importLibrary(db, bad)).rejects.toThrow(/status/i);
  const tracks = await listTracks(db, 'backlog');
  expect(tracks.map((t) => t.title)).toEqual(['Dune']);
});
