import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf, listTracks } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { parseSeriesTitle } from '@/domain/seriesTitle';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-13T10:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

/**
 * A10: "Saga #12" parses to { title: "Saga", ordinal: 12 } upstream (see
 * seriesTitle.test.ts) — these tests cover what addTrack/createSeriesTrack do
 * with that ordinal once it reaches them.
 */
test('a parsed ordinal within range starts that entry in_progress, backfills what came before as done, and lands the series in Currently', async () => {
  const db = await freshDb();
  const { title, ordinal } = parseSeriesTitle('Saga #3');
  await addTrack(
    db,
    { title, category: 'comic', count: 5, startAtOrdinal: ordinal ?? undefined },
    NOW,
  );

  expect(await listTracks(db, 'backlog')).toHaveLength(0);
  const [track] = await listTracks(db, 'currently');
  expect(track!.title).toBe('Saga');
  // A11: starting at issue 3 of 5 means issues 1-2 already happened.
  expect(track!.progress).toEqual({ done: 2, total: 5 });
  expect(track!.nextEntryTitle).toBe('Issue 3');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

/**
 * A11: the bug this backfill fixes — before it, issues 1-2 stayed
 * `unstarted`, so finishing issue 3 made `nextEntry()` fall back to the
 * lowest unstarted ordinal (1) instead of continuing to 4.
 */
test('finishing the started entry continues to the next ordinal, not back to 1', async () => {
  const db = await freshDb();
  const { title, ordinal } = parseSeriesTitle('Saga #3');
  const created = await addTrack(
    db,
    { title, category: 'comic', count: 5, startAtOrdinal: ordinal ?? undefined },
    NOW,
  );

  const first = await firstEntryOf(db, created);
  await advanceEntry(db, first.id, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 3, total: 5 });
  expect(track!.nextEntryTitle).toBe('Issue 4');
});

test('an out-of-range ordinal is ignored, falling back to a normal all-unstarted series', async () => {
  const db = await freshDb();
  const { title, ordinal } = parseSeriesTitle('Saga #99');
  await addTrack(
    db,
    { title, category: 'comic', count: 5, startAtOrdinal: ordinal ?? undefined },
    NOW,
  );

  expect(await listTracks(db, 'currently')).toHaveLength(0);
  const [track] = await listTracks(db, 'backlog');
  expect(track!.title).toBe('Saga');
  expect(track!.progress).toEqual({ done: 0, total: 5 });
  expect(track!.nextEntryTitle).toBe('Issue 1');
  expect(track!.nextEntryStatus).toBe('unstarted');
});

test('an ordinal of exactly the last entry is in range, not off-by-one', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Saga', category: 'comic', count: 5, startAtOrdinal: 5 }, NOW);

  const [track] = await listTracks(db, 'currently');
  expect(track!.nextEntryTitle).toBe('Issue 5');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('no ordinal at all creates a normal series, unstarted at entry 1', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Saga', category: 'comic', count: 5 }, NOW);

  expect(await listTracks(db, 'currently')).toHaveLength(0);
  const [track] = await listTracks(db, 'backlog');
  expect(track!.nextEntryTitle).toBe('Issue 1');
  expect(track!.nextEntryStatus).toBe('unstarted');
});

/**
 * A4 + A10: an ongoing series only ever generates one bootstrap entry — a
 * parsed ordinal renumbers that entry instead of matching it against a range
 * that does not exist yet, so "One Piece Volume 8" creates "Volume 8", not a
 * "Volume 1" that contradicts the title.
 */
test('an ongoing series with a parsed ordinal renumbers its bootstrap entry', async () => {
  const db = await freshDb();
  await addTrack(
    db,
    { title: 'One Piece', category: 'manga', count: Number.NaN, ongoing: true, startAtOrdinal: 8 },
    NOW,
  );

  const [track] = await listTracks(db, 'currently');
  expect(track!.title).toBe('One Piece');
  expect(track!.ongoing).toBe(true);
  expect(track!.progress).toBeNull();
  expect(track!.nextEntryTitle).toBe('Volume 8');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('an ongoing series with no parsed ordinal starts at Volume 1, unstarted', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: Number.NaN, ongoing: true }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.nextEntryTitle).toBe('Volume 1');
  expect(track!.nextEntryStatus).toBe('unstarted');
});

/**
 * The Add screen's "Start" button runs firstEntryOf + advanceEntry on
 * whatever it just created (see addAndStart.test.ts). When A10 already
 * started the parsed entry, that entry must not be advanced a second time —
 * doing so would finish it instead of merely starting it.
 */
test('firstEntryOf reports the A10-started entry as already in_progress, not ordinal 1', async () => {
  const db = await freshDb();
  const created = await addTrack(
    db,
    { title: 'Berserk', category: 'manga', count: 10, startAtOrdinal: 5 },
    NOW,
  );

  const first = await firstEntryOf(db, created);
  expect(first.status).toBe('in_progress');

  const [row] = await db.all<{ ordinal: number }>('SELECT ordinal FROM entry WHERE id = ?', [
    first.id,
  ]);
  expect(row!.ordinal).toBe(5);
});
