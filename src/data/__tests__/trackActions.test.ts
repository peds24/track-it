import { addTrack } from '@/data/addTrack';
import {
  advanceEntry,
  deleteTrack,
  listTracks,
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
  test('a started series goes back to the backlog with its progress cleared', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Berserk', category: 'manga', count: 4 }, NOW);
    const started = await startTrack(db, 'Berserk');
    expect(started.shelf).toBe('currently');

    await returnTrackToBacklog(db, { kind: 'series', id: started.id });

    expect(await listTracks(db, 'currently')).toHaveLength(0);
    const [backlogged] = await listTracks(db, 'backlog');
    expect(backlogged!.title).toBe('Berserk');
    // Backlog is *defined* as no child done and none in progress, so the
    // progress cannot survive the move — there is nowhere to keep it.
    expect(backlogged!.progress).toEqual({ done: 0, total: 4 });
  });

  test('timestamps are cleared, not just the status', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
    const started = await startTrack(db, 'Berserk');

    await returnTrackToBacklog(db, { kind: 'series', id: started.id });

    const rows = await db.all<{ started_at: string | null; finished_at: string | null }>(
      'SELECT started_at, finished_at FROM entry',
    );
    expect(rows.every((r) => r.started_at === null && r.finished_at === null)).toBe(true);
    // lastAdvancedAt derives from those timestamps, so a stale one would keep
    // sorting the track as if it had been touched recently.
    const [backlogged] = await listTracks(db, 'backlog');
    expect(backlogged!.lastAdvancedAt).toBeNull();
  });

  test('a finished series can be sent back to the backlog', async () => {
    const db = await freshDb();
    await addTrack(db, { title: 'Arrival', category: 'movie', count: 1 }, NOW);
    const [movie] = await listTracks(db, 'backlog');
    await advanceEntry(db, movie!.nextEntryId!, NOW);
    expect(await listTracks(db, 'done')).toHaveLength(1);

    await returnTrackToBacklog(db, { kind: 'entry', id: movie!.id });

    expect(await listTracks(db, 'done')).toHaveLength(0);
    expect(await listTracks(db, 'backlog')).toHaveLength(1);
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
