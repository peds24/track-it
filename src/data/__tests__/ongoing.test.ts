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

/** Finish whatever the track offers next, however many times. */
async function advanceTimes(db: SqlDriver, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    const shelves = [...(await listTracks(db, 'currently')), ...(await listTracks(db, 'backlog'))];
    const next = shelves[0]?.nextEntryId;
    if (!next) throw new Error('nothing left to advance');
    await advanceEntry(db, next, NOW);
  }
}

test('an ongoing series starts with a single entry and no total', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.ongoing).toBe(true);
  // No denominator exists, so none is reported — the row shows "Ongoing"
  // instead of a count it would have to invent.
  expect(track!.progress).toBeNull();
  expect(track!.nextEntryTitle).toBe('Volume 1');
  expect(await db.all('SELECT id FROM entry')).toHaveLength(1);
});

test('finishing the last entry appends the next one', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);

  // A7: the first tap starts volume 1 (D2); the second finishes it and, per
  // A5, starts volume 2 in the same tap.
  await advanceTimes(db, 2);

  const rows = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(rows.map((r) => r.title)).toEqual(['Volume 1', 'Volume 2']);

  const [track] = await listTracks(db, 'currently');
  expect(track!.nextEntryTitle).toBe('Volume 2');
  // A5: the next volume is already in progress, so the row reads "Reading".
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('an ongoing series never reaches the Done shelf', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);

  // Start volume 1, then finish three volumes in a row (each finish also
  // starts the next, per A5) — four taps to land on volume 4 in progress.
  // A finite series would be Done by now.
  await advanceTimes(db, 4);

  expect(await listTracks(db, 'done')).toHaveLength(0);
  const [track] = await listTracks(db, 'currently');
  expect(track!.nextEntryTitle).toBe('Volume 4');
});

test('a finite series is unaffected — no entry is appended', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, NOW);

  // Start volume 1 (tap 1), finish 1 and start 2 (tap 2), finish 2 (tap 3).
  await advanceTimes(db, 3);

  expect(await db.all('SELECT id FROM entry')).toHaveLength(2);
  const [done] = await listTracks(db, 'done');
  expect(done!.title).toBe('Berserk');
  expect(done!.progress).toEqual({ done: 2, total: 2 });
});

test('an ongoing show appends episodes, not volumes', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 0, ongoing: true }, NOW);

  // Watch mode completes an episode in one tap.
  await advanceTimes(db, 1);

  const rows = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(rows.map((r) => r.title)).toEqual(['Episode 1', 'Episode 2']);
});

test('finishing an earlier entry out of order does not append', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);
  await advanceTimes(db, 2); // volume 1 done, volume 2 created and started

  const [first] = await db.all<{ id: string }>(
    "SELECT id FROM entry WHERE ordinal = 1",
  );
  // Re-finishing volume 1 would throw; instead reset it and finish it again,
  // which is the shape of any out-of-order completion. Resetting to unstarted
  // costs two taps again — starting it, then finishing it — same as the first
  // time (A7).
  await db.run("UPDATE entry SET status = 'unstarted' WHERE id = ?", [first!.id]);
  await advanceEntry(db, first!.id, NOW);
  await advanceEntry(db, first!.id, NOW);

  const rows = await db.all('SELECT id FROM entry');
  expect(rows).toHaveLength(2);
});
