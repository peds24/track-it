import { addTrack } from '@/data/addTrack';
import { advanceEntry, listTracks, setTrackPosition } from '@/data/trackRepo';
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

  // A10: an episode is a series child, so — like a volume — it takes two
  // taps to reach done: start episode 1, then finish it (which appends and
  // starts episode 2, per A5).
  await advanceTimes(db, 2);

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

// A20: there was previously no way to correct an ongoing series that got
// advanced too far — setTrackPosition (A18) never checked `ongoing` at all,
// it only needed the entries that already exist, so it already worked here
// underneath the UI gate that excluded it.
test('setTrackPosition rewinds an ongoing series to an earlier, already-existing entry', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);
  await advanceTimes(db, 4); // volumes 1-3 done, volume 4 in progress

  const [beforeRewind] = await listTracks(db, 'currently');
  expect(beforeRewind!.entryCount).toBe(4);

  await setTrackPosition(db, beforeRewind!.id, 2, NOW);

  const [rewound] = await listTracks(db, 'currently');
  expect(rewound!.nextEntryTitle).toBe('Volume 2');
  expect(rewound!.nextEntryStatus).toBe('in_progress');
  // Volumes 3 and 4 already existed before the rewind — moving backward must
  // not delete or duplicate them.
  expect(await db.all('SELECT id FROM entry')).toHaveLength(4);
});

test('advancing forward again after a rewind reuses the existing entries before growing past them', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'One Piece', category: 'manga', count: 0, ongoing: true }, NOW);
  await advanceTimes(db, 4); // volumes 1-3 done, volume 4 in progress
  await setTrackPosition(db, (await listTracks(db, 'currently'))[0]!.id, 2, NOW);

  // Finishing volume 2 (not the highest ordinal) must reuse the already-
  // existing volume 3 rather than appending a duplicate.
  await advanceTimes(db, 1);
  let rows = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(rows.map((r) => r.title)).toEqual(['Volume 1', 'Volume 2', 'Volume 3', 'Volume 4']);

  // Finishing volume 3, still not the highest, reuses volume 4 the same way.
  await advanceTimes(db, 1);
  rows = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(rows).toHaveLength(4);

  // Only finishing the true last entry (volume 4) grows the series again.
  await advanceTimes(db, 1);
  rows = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(rows.map((r) => r.title)).toEqual(['Volume 1', 'Volume 2', 'Volume 3', 'Volume 4', 'Volume 5']);
});
