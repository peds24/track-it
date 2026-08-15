import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf, listTracks } from '@/data/trackRepo';
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
 * The Add screen's "Start" button is exactly this sequence: addTrack, then
 * firstEntryOf + advanceEntry on what it created — no second query to
 * rediscover the track, and no detour through the backlog first.
 */
test('addTrack reports what it created, so the caller can start it immediately', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Berserk', category: 'manga', count: 3 }, NOW);
  expect(created.kind).toBe('series');

  const first = await firstEntryOf(db, created);
  expect(first.status).toBe('unstarted');
  await advanceEntry(db, first.id, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.title).toBe('Berserk');
  // A7: starting reads as "started", not "already read one".
  expect(track!.progress).toEqual({ done: 0, total: 3 });
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('starting a standalone track right after adding it works the same way', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
  expect(created.kind).toBe('entry');

  const first = await firstEntryOf(db, created);
  await advanceEntry(db, first.id, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.title).toBe('Dune');
});

/**
 * A10: a show episode is now consistent with a manga volume (A5/A7) —
 * starting it right after adding is a first tap, not a finish.
 */
test('starting a show right after adding it starts episode 1, watch mode now has a reading state', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);

  const first = await firstEntryOf(db, created);
  expect(first.status).toBe('unstarted');
  await advanceEntry(db, first.id, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 0, total: 3 });
  expect(track!.nextEntryTitle).toBe('Episode 1');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('a standalone movie still completes in one tap right after adding', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Sicario', category: 'movie', count: 1 }, NOW);

  const first = await firstEntryOf(db, created);
  await advanceEntry(db, first.id, NOW);

  expect(await listTracks(db, 'currently')).toHaveLength(0);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('firstEntryOf points at ordinal 1 when nothing has started it early', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Saga', category: 'comic', count: 5 }, NOW);

  const first = await firstEntryOf(db, created);

  const [row] = await db.all<{ ordinal: number }>('SELECT ordinal FROM entry WHERE id = ?', [
    first.id,
  ]);
  expect(row!.ordinal).toBe(1);
});
