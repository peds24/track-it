import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { advanceEntry, createSeriesTrack, createStandaloneTrack, listTracks } from '@/data/trackRepo';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';
const LATER = '2027-01-31T23:45:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

// A10: an episode is a series child, so — like a manga volume — the first
// tap starts it rather than finishing it.
test('advancing the first episode moves a show from backlog to currently, and starts it', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
    },
    NOW,
  );

  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW);

  expect(await listTracks(db, 'backlog')).toHaveLength(0);
  const [current] = await listTracks(db, 'currently');
  expect(current!.progress).toEqual({ done: 0, total: 2 });
  expect(current!.nextEntryTitle).toBe('Episode 1');
  expect(current!.nextEntryStatus).toBe('in_progress');
});

test('finishing the in-progress episode marks it done and starts the next one', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
    },
    NOW,
  );

  const [backlogged] = await listTracks(db, 'backlog');
  await advanceEntry(db, backlogged!.nextEntryId!, NOW); // starts episode 1
  const [watching] = await listTracks(db, 'currently');
  await advanceEntry(db, watching!.nextEntryId!, NOW); // finishes episode 1

  const [current] = await listTracks(db, 'currently');
  expect(current!.progress).toEqual({ done: 1, total: 2 });
  expect(current!.nextEntryTitle).toBe('Episode 2');
  expect(current!.nextEntryStatus).toBe('in_progress');
});

test('advancing a book once makes it currently, not done', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'currently')).toHaveLength(1);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing a movie once completes it', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);

  await advanceEntry(db, id, NOW);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing a finished entry throws and leaves the row unchanged', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);
  await advanceEntry(db, id, NOW);

  await expect(advanceEntry(db, id, NOW)).rejects.toThrow(/already done/);
  expect(await listTracks(db, 'done')).toHaveLength(1);
});

test('advancing an unknown entry throws', async () => {
  const db = await freshDb();
  await expect(advanceEntry(db, 'nope', NOW)).rejects.toThrow(/not found/);
});

// listTracks only surfaces fields derived from `status`, so the timestamp
// columns need to be read back with SQL directly to be covered at all.
type TimeRow = { status: string; started_at: string | null; finished_at: string | null };

async function readTimes(db: SqlDriver, id: string): Promise<TimeRow> {
  const rows = await db.all<TimeRow>(
    'SELECT status, started_at, finished_at FROM entry WHERE id = ?',
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error(`Entry ${id} not found in test`);
  return row;
}

test('advancing a movie persists both started_at and finished_at', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);

  await advanceEntry(db, id, NOW);

  const row = await readTimes(db, id);
  expect(row.status).toBe('done');
  expect(row.started_at).toBe(NOW);
  expect(row.finished_at).toBe(NOW);
});

test('starting a book persists started_at and leaves finished_at null', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  await advanceEntry(db, id, NOW);

  const row = await readTimes(db, id);
  expect(row.status).toBe('in_progress');
  expect(row.started_at).toBe(NOW);
  expect(row.finished_at).toBeNull();
});

test('finishing a book persists finished_at without clobbering started_at', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  await advanceEntry(db, id, NOW);
  await advanceEntry(db, id, LATER);

  const row = await readTimes(db, id);
  expect(row.status).toBe('done');
  expect(row.started_at).toBe(NOW);
  expect(row.finished_at).toBe(LATER);
});

test('a rejected advance leaves the stored timestamps byte-identical', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);
  await advanceEntry(db, id, NOW);
  const before = await readTimes(db, id);

  await expect(advanceEntry(db, id, LATER)).rejects.toThrow(/already done/);

  expect(await readTimes(db, id)).toEqual(before);
});
