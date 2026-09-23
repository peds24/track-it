import { addTrack } from '@/data/addTrack';
import { advanceEntry, completeTrack, listTracks } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import { createMemoryDriver } from '../../../test/memoryDriver';

const T0 = '2026-09-01T12:00:00.000Z';
const NOW = '2026-09-22T12:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('a backlog book completes straight to Done with start and finish at now', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, T0);

  await completeTrack(db, created, NOW);

  const [done] = await listTracks(db, 'done');
  expect(done?.title).toBe('Dune');
  const [row] = await db.all<{ started_at: string; finished_at: string }>('SELECT * FROM entry');
  expect(row).toMatchObject({ started_at: NOW, finished_at: NOW });
});

test('a paused, half-read series completes and keeps earlier finish stamps', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Berserk', category: 'manga', count: 3 }, T0);
  const [first] = await db.all<{ id: string }>('SELECT id FROM entry ORDER BY ordinal LIMIT 1');
  await advanceEntry(db, first!.id, T0); // start vol 1
  await advanceEntry(db, first!.id, T0); // finish vol 1 (vol 2 auto-starts)
  await db.run('UPDATE series SET paused = 1');

  await completeTrack(db, created, NOW);

  const [done] = await listTracks(db, 'done');
  expect(done?.progress).toEqual({ done: 3, total: 3 });
  const rows = await db.all<{ ordinal: number; finished_at: string }>(
    'SELECT ordinal, finished_at FROM entry ORDER BY ordinal',
  );
  expect(rows.map((r) => r.finished_at)).toEqual([T0, NOW, NOW]);
  const [series] = await db.all<{ paused: number }>('SELECT paused FROM series');
  expect(series?.paused).toBe(0);
});

test('an ongoing series drops the auto-appended next unit and stops being ongoing', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Saga', category: 'comic', count: 0, ongoing: true }, T0);
  const next = async () => (await listTracks(db, 'currently'))[0] ?? (await listTracks(db, 'backlog'))[0]!;

  await advanceEntry(db, (await next()).nextEntryId!, '2026-09-02T12:00:00.000Z'); // start #1
  await advanceEntry(db, (await next()).nextEntryId!, '2026-09-03T12:00:00.000Z'); // finish #1 -> #2 appended
  await advanceEntry(db, (await next()).nextEntryId!, '2026-09-04T12:00:00.000Z'); // finish #2 -> #3 appended

  await completeTrack(db, created, NOW);

  const [done] = await listTracks(db, 'done');
  expect(done?.title).toBe('Saga');
  expect(done?.ongoing).toBe(false);
  expect(done?.progress).toEqual({ done: 2, total: 2 });
});

test('completing an already-finished track is a harmless no-op', async () => {
  const db = await freshDb();
  const created = await addTrack(db, { title: 'Arrival', category: 'movie', count: 1 }, T0);
  await completeTrack(db, created, T0);

  await expect(completeTrack(db, created, NOW)).resolves.toBeUndefined();
  const [row] = await db.all<{ finished_at: string }>('SELECT finished_at FROM entry');
  expect(row?.finished_at).toBe(T0);
});

test('an unknown track id is an error', async () => {
  const db = await freshDb();
  await expect(completeTrack(db, { kind: 'series', id: 'nope' }, NOW)).rejects.toThrow('not found');
});
