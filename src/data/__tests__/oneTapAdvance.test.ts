import { addTrack } from '@/data/addTrack';
import { advanceEntry, listTracks } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-13T10:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

/**
 * A5: one tap finishes a volume and starts the next, so reaching volume 4 of a
 * finite manga takes three taps rather than six. A standalone book keeps both
 * steps, because it has no next unit to move to (D2).
 */
test('a series volume completes in a single tap', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 4 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 1, total: 4 });
  expect(track!.nextEntryTitle).toBe('Volume 2');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('a standalone book still needs two taps', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);
  expect(await listTracks(db, 'currently')).toHaveLength(1);
  expect(await listTracks(db, 'done')).toHaveLength(0);

  await advanceEntry(db, backlogged!.id, NOW);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('an episode is left unstarted — watch mode has no in-progress state', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.nextEntryTitle).toBe('Episode 2');
  expect(track!.nextEntryStatus).toBe('unstarted');
});

test('the final volume completes the series rather than starting nothing', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW);
  const [mid] = await listTracks(db, 'currently');

  await advanceEntry(db, mid!.nextEntryId!, NOW);

  const [done] = await listTracks(db, 'done');
  expect(done!.title).toBe('Berserk');
  expect(done!.nextEntryId).toBeNull();
});
