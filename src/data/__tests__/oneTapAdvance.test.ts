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
 * A7: the first tap on a fresh volume starts it, exactly like a standalone
 * book (D2) — it must not report a volume read that was never opened.
 */
test('the first tap on a series volume starts it, not finishes it', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 4 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 0, total: 4 });
  expect(track!.nextEntryTitle).toBe('Volume 1');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

/**
 * A5 (as refined by A7): once a volume is actually in progress, finishing it
 * and starting the next one is still one tap — the saving applies from the
 * second volume on, not the first.
 */
test('finishing an in-progress volume starts the next one in the same tap', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 4 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW); // starts volume 1

  const [reading] = await listTracks(db, 'currently');
  await advanceEntry(db, reading!.nextEntryId!, NOW); // finishes volume 1

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
  await advanceEntry(db, backlogged!.nextEntryId!, NOW); // starts volume 1
  const [reading1] = await listTracks(db, 'currently');
  await advanceEntry(db, reading1!.nextEntryId!, NOW); // finishes 1, starts 2
  const [reading2] = await listTracks(db, 'currently');

  await advanceEntry(db, reading2!.nextEntryId!, NOW); // finishes volume 2

  const [done] = await listTracks(db, 'done');
  expect(done!.title).toBe('Berserk');
  expect(done!.nextEntryId).toBeNull();
});
