import { addTrack } from '@/data/addTrack';
import {
  advanceEntry,
  deleteTrack,
  listTracks,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary,
} from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-13T10:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

/** Advance a track until it is on the Currently shelf. */
async function startTrack(db: SqlDriver, title: string): Promise<TrackSummary> {
  const [backlogged] = await listTracks(db, 'backlog');
  if (!backlogged) throw new Error(`${title} is not in the backlog`);
  await advanceEntry(db, backlogged.nextEntryId!, NOW);
  const [current] = await listTracks(db, 'currently');
  if (!current) throw new Error(`${title} did not reach Currently`);
  return current;
}

describe('deleteTrack', () => {
  test('deleting a series removes its entries too', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Berserk', category: 'manga', count: 3 }, NOW);
    const [track] = await listTracks(db, 'backlog');

    await deleteTrack(db, { kind: 'series', id: track!.id });

    expect(await db.all('SELECT id FROM series')).toHaveLength(0);
    // The schema's ON DELETE CASCADE is what makes this true; without foreign
    // keys enabled the children would be orphaned rather than removed.
    expect(await db.all('SELECT id FROM entry')).toHaveLength(0);
    expect(await listTracks(db, 'backlog')).toHaveLength(0);
  });

  test('deleting a standalone track removes only that entry', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
    await addTrack(db, { title: 'Solaris', category: 'book', count: 1 }, NOW);
    const before = await listTracks(db, 'backlog');
    const dune = before.find((t) => t.title === 'Dune');

    await deleteTrack(db, { kind: 'entry', id: dune!.id });

    const after = await listTracks(db, 'backlog');
    expect(after.map((t) => t.title)).toEqual(['Solaris']);
  });

  test('deleting one track leaves its neighbours alone', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
    await addTrack(db, { title: 'Vagabond', category: 'manga', count: 2 }, NOW);
    const berserk = (await listTracks(db, 'backlog')).find((t) => t.title === 'Berserk');

    await deleteTrack(db, { kind: 'series', id: berserk!.id });

    const remaining = await listTracks(db, 'backlog');
    expect(remaining.map((t) => t.title)).toEqual(['Vagabond']);
    expect(remaining[0]!.progress).toEqual({ done: 0, total: 2 });
  });
});

describe('returnTrackToBacklog', () => {
  test('A6: a part-way series is paused, not reset — its progress survives', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Severance', category: 'show', count: 4 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    await advanceEntry(db, backlogged!.nextEntryId!, NOW); // watches episode 1
    const [current] = await listTracks(db, 'currently');
    expect(current!.progress).toEqual({ done: 1, total: 4 });

    await returnTrackToBacklog(db, { kind: 'series', id: current!.id });

    expect(await listTracks(db, 'currently')).toHaveLength(0);
    const [paused] = await listTracks(db, 'backlog');
    expect(paused!.title).toBe('Severance');
    expect(paused!.paused).toBe(true);
    // The whole point of A6: what was already watched is not lost by leaving
    // Currently, unlike the pre-A6 reset this replaces.
    expect(paused!.progress).toEqual({ done: 1, total: 4 });
  });

  test('A6: timestamps survive the pause, unlike the old reset', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Severance', category: 'show', count: 2 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    await advanceEntry(db, backlogged!.nextEntryId!, NOW);
    const [current] = await listTracks(db, 'currently');

    await returnTrackToBacklog(db, { kind: 'series', id: current!.id });

    const rows = await db.all<{
      status: string;
      started_at: string | null;
      finished_at: string | null;
    }>('SELECT status, started_at, finished_at FROM entry WHERE ordinal = 1');
    expect(rows[0]!.status).toBe('done');
    expect(rows[0]!.started_at).not.toBeNull();
    expect(rows[0]!.finished_at).not.toBeNull();
  });

  test('A6: a fully finished series is reset, not paused — nothing is left to resume', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Chainsaw Man', category: 'manga', count: 1 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    // A5: a series child goes straight to done in one tap, unlike a standalone
    // read-mode entry, which still takes two.
    await advanceEntry(db, backlogged!.nextEntryId!, NOW);
    const [done] = await listTracks(db, 'done');
    expect(done!.title).toBe('Chainsaw Man');

    await returnTrackToBacklog(db, { kind: 'series', id: done!.id });

    expect(await listTracks(db, 'done')).toHaveLength(0);
    const [reset] = await listTracks(db, 'backlog');
    expect(reset!.title).toBe('Chainsaw Man');
    expect(reset!.paused).toBe(false);
    expect(reset!.progress).toEqual({ done: 0, total: 1 });
  });

  test('a finished standalone track can still be sent back to the backlog and reset', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Arrival', category: 'movie', count: 1 }, NOW);
    const [movie] = await listTracks(db, 'backlog');
    await advanceEntry(db, movie!.nextEntryId!, NOW);
    expect(await listTracks(db, 'done')).toHaveLength(1);

    await returnTrackToBacklog(db, { kind: 'entry', id: movie!.id });

    expect(await listTracks(db, 'done')).toHaveLength(0);
    const [reset] = await listTracks(db, 'backlog');
    expect(reset!.paused).toBe(false);
  });

  test('a standalone track still reading is paused, keeping its status', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    await advanceEntry(db, backlogged!.nextEntryId!, NOW); // starts reading
    const [reading] = await listTracks(db, 'currently');

    await returnTrackToBacklog(db, { kind: 'entry', id: reading!.id });

    const [paused] = await listTracks(db, 'backlog');
    expect(paused!.paused).toBe(true);
    const [row] = await db.all<{ status: string }>('SELECT status FROM entry WHERE id = ?', [
      reading!.id,
    ]);
    expect(row!.status).toBe('in_progress');
  });

  test('returning one track does not disturb another', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
    const berserk = await startTrack(db, 'Berserk');
    await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
    const dune = (await listTracks(db, 'backlog')).find((t) => t.title === 'Dune');
    await advanceEntry(db, dune!.nextEntryId!, NOW);

    await returnTrackToBacklog(db, { kind: 'series', id: berserk.id });

    const current = await listTracks(db, 'currently');
    expect(current.map((t) => t.title)).toEqual(['Dune']);
  });
});

describe('resumeTrack', () => {
  test('A6: resuming a paused series restores Currently without touching progress', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Severance', category: 'show', count: 4 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    await advanceEntry(db, backlogged!.nextEntryId!, NOW);
    const [current] = await listTracks(db, 'currently');
    await returnTrackToBacklog(db, { kind: 'series', id: current!.id });
    expect(await listTracks(db, 'currently')).toHaveLength(0);

    await resumeTrack(db, { kind: 'series', id: current!.id });

    const resumed = await listTracks(db, 'currently');
    expect(resumed.map((t) => t.title)).toEqual(['Severance']);
    expect(resumed[0]!.progress).toEqual({ done: 1, total: 4 });
    expect(resumed[0]!.paused).toBe(false);
  });

  test('A6: resuming a paused standalone entry restores Currently', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
    const [backlogged] = await listTracks(db, 'backlog');
    await advanceEntry(db, backlogged!.nextEntryId!, NOW);
    const [reading] = await listTracks(db, 'currently');
    await returnTrackToBacklog(db, { kind: 'entry', id: reading!.id });

    await resumeTrack(db, { kind: 'entry', id: reading!.id });

    expect((await listTracks(db, 'currently')).map((t) => t.title)).toEqual(['Dune']);
  });
});
