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

  const entryId = await firstEntryOf(db, created);
  await advanceEntry(db, entryId, NOW);

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

  const entryId = await firstEntryOf(db, created);
  await advanceEntry(db, entryId, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.title).toBe('Dune');
});

test('starting a show right after adding it marks episode 1 watched — watch mode has no reading state', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);

  const entryId = await firstEntryOf(db, created);
  await advanceEntry(db, entryId, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 1, total: 3 });
  expect(track!.nextEntryTitle).toBe('Episode 2');
});

test('firstEntryOf always points at ordinal 1, regardless of insert order', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Saga', category: 'comic', count: 5 }, NOW);

  const entryId = await firstEntryOf(db, created);

  const [row] = await db.all<{ ordinal: number }>('SELECT ordinal FROM entry WHERE id = ?', [
    entryId,
  ]);
  expect(row!.ordinal).toBe(1);
});
