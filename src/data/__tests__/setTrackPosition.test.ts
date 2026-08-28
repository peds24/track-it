import { createSeriesTrack, listTracks, setTrackPosition } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';
const LATER = '2027-01-31T23:45:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

/** A 24-episode show sitting untouched in the backlog. */
async function show(db: Awaited<ReturnType<typeof freshDb>>) {
  return createSeriesTrack(
    db,
    {
      title: 'House',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: Array.from({ length: 24 }, (_, i) => ({ ordinal: i + 1, title: `Episode ${i + 1}` })),
    },
    NOW,
  );
}

test('setting a position moves the track to currently with the progress it implies', async () => {
  const db = await freshDb();
  const id = await show(db);

  await setTrackPosition(db, id, 12, LATER);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 11, total: 24 });
  expect(track!.nextEntryTitle).toBe('Episode 12');
  expect(track!.nextEntryStatus).toBe('in_progress');
});

test('setting a position backwards un-finishes the units it drops below', async () => {
  const db = await freshDb();
  const id = await show(db);
  await setTrackPosition(db, id, 20, NOW);

  await setTrackPosition(db, id, 4, LATER);

  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 3, total: 24 });
  expect(track!.nextEntryTitle).toBe('Episode 4');
});

test('setting a position sorts the track to the front of currently', async () => {
  const db = await freshDb();
  const house = await show(db);
  const severance = await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [{ ordinal: 1, title: 'Episode 1' }, { ordinal: 2, title: 'Episode 2' }],
    },
    NOW,
  );
  await setTrackPosition(db, severance, 2, NOW);

  await setTrackPosition(db, house, 5, LATER);

  const titles = (await listTracks(db, 'currently')).map((t) => t.title);
  expect(titles).toEqual(['House', 'Severance']);
});

test('setting a position rejects a unit the series does not have', async () => {
  const db = await freshDb();
  const id = await show(db);

  await expect(setTrackPosition(db, id, 25, LATER)).rejects.toThrow(/out of range/i);
  const [untouched] = await listTracks(db, 'backlog');
  expect(untouched!.title).toBe('House');
});

test('setting a position on a paused track brings it back to currently', async () => {
  const db = await freshDb();
  const id = await show(db);
  await db.run('UPDATE series SET paused = 1 WHERE id = ?', [id]);

  await setTrackPosition(db, id, 7, LATER);

  expect(await listTracks(db, 'backlog')).toHaveLength(0);
  const [track] = await listTracks(db, 'currently');
  expect(track!.progress).toEqual({ done: 6, total: 24 });
});

test('setting a position on a series that does not exist fails loudly', async () => {
  const db = await freshDb();
  await expect(setTrackPosition(db, 'nope', 1, LATER)).rejects.toThrow(/not found/i);
});
