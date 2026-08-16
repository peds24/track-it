import { addTrack } from '@/data/addTrack';
import { listTracks } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

function mockFetchSequence(...responses: { body: unknown; ok?: boolean }[]): jest.Mock {
  const fn = jest.fn();
  for (const { body, ok = true } of responses) {
    fn.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
});

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('adding a manga generates one entry per volume', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 3 }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.progress).toEqual({ done: 0, total: 3 });
  expect(track!.nextEntryTitle).toBe('Volume 1');
});

test('adding a book ignores the count and creates one standalone entry', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 5 }, NOW);

  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  // The count must be ignored outright, not looped over: five standalone entries
  // would each look like a valid single track, so cardinality is the only assertion
  // that tells "ignored the count" apart from "obeyed it".
  expect(await db.all('SELECT id FROM entry')).toHaveLength(1);
  const tracks = await listTracks(db, 'backlog');
  expect(tracks).toHaveLength(1);
  const [track] = tracks;
  expect(track!.kind).toBe('entry');
  expect(track!.progress).toBeNull();
});

test('adding a track with a blank title is rejected', async () => {
  const db = await freshDb();
  await expect(
    addTrack(db, { title: '   ', category: 'book', count: 1 }, NOW),
  ).rejects.toThrow(/title/i);
});

// The title guard must sit ahead of the standalone/series fork, not inside one arm of it.
test('a blank title is rejected for a series category too, and writes nothing', async () => {
  const db = await freshDb();
  await expect(
    addTrack(db, { title: '   ', category: 'manga', count: 3 }, NOW),
  ).rejects.toThrow(/title/i);

  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  expect(await db.all('SELECT id FROM entry')).toHaveLength(0);
});

test('adding a show generates episode-labelled entries', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Severance', category: 'show', count: 2 }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.progress).toEqual({ done: 0, total: 2 });
  expect(track!.nextEntryTitle).toBe('Episode 1');
});

test('adding a comic generates issue-labelled entries', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Saga', category: 'comic', count: 4 }, NOW);

  const [track] = await listTracks(db, 'backlog');
  expect(track!.progress).toEqual({ done: 0, total: 4 });
  expect(track!.nextEntryTitle).toBe('Issue 1');
});

// A9: a confirmed search/scan result records where a standalone track came
// from — no fake series wrapper, straight through createStandaloneTrack.
test('a book added from a confirmed search result records its external source and id', async () => {
  const db = await freshDb();
  await addTrack(
    db,
    {
      title: 'Dune',
      category: 'book',
      count: 1,
      match: { id: 'abc123', title: 'Dune', category: 'book', count: 1 },
    },
    NOW,
  );

  const rows = await db.all<{ external_source: string | null; external_id: string | null }>(
    'SELECT external_source, external_id FROM entry',
  );
  expect(rows).toEqual([{ external_source: 'google-books', external_id: 'abc123' }]);
});

test('a book with no picked search result records no external source', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  const rows = await db.all<{ external_source: string | null; external_id: string | null }>(
    'SELECT external_source, external_id FROM entry',
  );
  expect(rows).toEqual([{ external_source: null, external_id: null }]);
});

test('a series track hydrated from a confirmed match records the series-level external source and id', async () => {
  // A11: manga now uses AniList instead of Google Books
  mockFetchSequence({
    body: { data: { Media: { volumes: 41, chapters: 362, status: 'RELEASING' } } },
  });

  const db = await freshDb();
  await addTrack(
    db,
    {
      title: 'Berserk',
      category: 'manga',
      count: 3,
      match: { id: '1', title: 'Berserk', category: 'manga', count: 1 },
    },
    NOW,
  );

  const rows = await db.all<{ external_source: string | null; external_id: string | null }>(
    'SELECT external_source, external_id FROM series',
  );
  expect(rows).toEqual([{ external_source: 'anilist', external_id: '1' }]);
});
