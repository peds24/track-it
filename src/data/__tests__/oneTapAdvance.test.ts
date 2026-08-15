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

/**
 * A10: a series child's tracking granularity comes from its position in the
 * series, not from its mode (A5/A7 already established this for read mode) —
 * an episode now passes through in_progress exactly like a volume does. Only
 * a standalone watch-mode entry (a movie) keeps D2's original one-tap rule,
 * covered separately below.
 */
test('the first tap on a show episode starts it, not finishes it', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 0, total: 3 });
  expect(track!.nextEntryTitle).toBe('Episode 1');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('finishing an in-progress episode starts the next one in the same tap', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW); // starts episode 1

  const [watching] = await listTracks(db, 'currently');
  await advanceEntry(db, watching!.nextEntryId!, NOW); // finishes episode 1

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 1, total: 3 });
  expect(track!.nextEntryTitle).toBe('Episode 2');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

/**
 * The full show flow end to end: add, Start ("Watching Episode 1"), episode 1
 * is never touched a second time before advancing again, Done ("Watching
 * Episode 2"), and episode 1 now reads done.
 */
test('a show goes add -> Start -> Watching Episode 1 -> Done -> Watching Episode 2', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 3 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW); // Start
  const [afterStart] = await listTracks(db, 'currently');
  expect(afterStart!.nextEntryTitle).toBe('Episode 1');
  expect(afterStart!.nextEntryStatus).toBe('in_progress');

  await advanceEntry(db, afterStart!.nextEntryId!, NOW); // Done
  const [afterDone] = await listTracks(db, 'currently');
  expect(afterDone!.nextEntryTitle).toBe('Episode 2');
  expect(afterDone!.nextEntryStatus).toBe('in_progress');
  expect(afterDone!.progress).toEqual({ done: 1, total: 3 });
});

/**
 * A10: a standalone watch-mode entry (a movie) has no series to belong to and
 * no next unit to reveal, so D2's original one-tap rule still applies exactly
 * as it always did.
 */
test('a standalone movie still completes in a single tap', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Sicario', category: 'movie', count: 1 }, NOW);
  const [backlogged] = await listTracks(db, 'backlog');

  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  expect(await listTracks(db, 'currently')).toHaveLength(0);
  expect(await listTracks(db, 'done')).toHaveLength(1);
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
