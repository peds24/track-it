import { addTrack } from '@/data/addTrack';
import { backfillMetadata } from '@/data/backfillMetadata';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import type { TrackMetadata } from '@/domain/types';
import type { MetadataProvider } from '@/providers/types';
import { createMemoryDriver } from '../../../test/memoryDriver';

const T0 = '2026-09-01T12:00:00.000Z';
const LATER = '2026-09-22T12:00:00.000Z';
const META: TrackMetadata = { coverUrl: 'https://c/1.jpg', creator: 'Author', description: 'Text.', releaseYear: '2001' };

async function dbWithMatchedBook(externalSource = 'google-books'): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  // A pre-A22 row: matched, but no metadata and never checked.
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id)
     VALUES ('e1', NULL, 'Dune', NULL, 'book', 'unstarted', ?, ?, 'gb1')`,
    [T0, externalSource],
  );
  return db;
}

function fakeProvider(details: MetadataProvider['details']): MetadataProvider {
  return { id: 'fake', search: jest.fn(), hydrate: jest.fn(), details };
}

test('fills and stamps a matched row', async () => {
  const db = await dbWithMatchedBook();
  const details = jest.fn().mockResolvedValue(META);

  const result = await backfillMetadata(db, () => fakeProvider(details), () => LATER);

  expect(details).toHaveBeenCalledWith('gb1');
  expect(result).toEqual({ filled: 1, skipped: 0, failed: 0 });
  const [row] = await db.all<Record<string, unknown>>('SELECT * FROM entry');
  expect(row).toMatchObject({ cover_url: 'https://c/1.jpg', creator: 'Author', release_year: '2001', metadata_checked_at: LATER });
});

test('a failed lookup leaves the row unstamped so it retries next launch', async () => {
  const db = await dbWithMatchedBook();
  const result = await backfillMetadata(db, () => fakeProvider(jest.fn().mockResolvedValue(null)), () => LATER);

  expect(result.failed).toBe(1);
  const [row] = await db.all<{ metadata_checked_at: string | null }>('SELECT metadata_checked_at FROM entry');
  expect(row?.metadata_checked_at).toBeNull();
});

test('a provider that throws anyway is treated as a failed lookup, not a crash', async () => {
  const db = await dbWithMatchedBook();
  const result = await backfillMetadata(db, () => fakeProvider(jest.fn().mockRejectedValue(new Error('offline'))), () => LATER);
  expect(result.failed).toBe(1);
});

test('an unknown source is stamped and skipped', async () => {
  const db = await dbWithMatchedBook('retired-provider');
  const result = await backfillMetadata(db, () => null, () => LATER);

  expect(result.skipped).toBe(1);
  const [row] = await db.all<{ metadata_checked_at: string | null }>('SELECT metadata_checked_at FROM entry');
  expect(row?.metadata_checked_at).toBe(LATER);
});

test('hand-typed tracks, series children, and already-checked rows are never queried', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await addTrack(db, { title: 'Notes', category: 'book', count: 1 }, T0); // hand-typed
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 2 }, T0); // hand-typed series
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id, metadata_checked_at)
     VALUES ('done1', NULL, 'Known', NULL, 'book', 'unstarted', ?, 'google-books', 'gb2', ?)`,
    [T0, T0],
  );
  const details = jest.fn().mockResolvedValue(META);

  await backfillMetadata(db, () => fakeProvider(details), () => LATER);

  expect(details).not.toHaveBeenCalled();
});

test('a matched series is filled on its series row', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await db.run(
    `INSERT INTO series (id, title, media_type, unit_label, created_at, external_source, external_id)
     VALUES ('s1', 'Severance', 'show', 'episode', ?, 'tmdb', '95396')`,
    [T0],
  );
  const resolve = jest.fn().mockReturnValue(fakeProvider(jest.fn().mockResolvedValue(META)));

  await backfillMetadata(db, resolve, () => LATER);

  expect(resolve).toHaveBeenCalledWith('tmdb', 'show');
  const [row] = await db.all<Record<string, unknown>>('SELECT * FROM series');
  expect(row).toMatchObject({ creator: 'Author', metadata_checked_at: LATER });
});

test('existing values are never overwritten by the backfill', async () => {
  const db = await dbWithMatchedBook();
  await db.run(`UPDATE entry SET creator = 'Kept'`);
  await backfillMetadata(db, () => fakeProvider(jest.fn().mockResolvedValue(META)), () => LATER);
  const [row] = await db.all<{ creator: string }>('SELECT creator FROM entry');
  expect(row?.creator).toBe('Kept');
});

describe('per-source pacing', () => {
  async function dbWith(rows: [id: string, source: string][]): Promise<SqlDriver> {
    const db = createMemoryDriver();
    await migrate(db);
    for (const [id, source] of rows) {
      await db.run(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id)
         VALUES (?, NULL, ?, NULL, 'book', 'unstarted', ?, ?, ?)`,
        [id, id, T0, source, `x-${id}`],
      );
    }
    return db;
  }

  function recordingSleep() {
    const gaps: number[] = [];
    return { gaps, sleep: async (ms: number) => void gaps.push(ms) };
  }

  const answering = () => fakeProvider(jest.fn().mockResolvedValue(META));

  test('two metron rows wait once, 3500 ms, between the lookups', async () => {
    const db = await dbWith([['a', 'metron'], ['b', 'metron']]);
    const { gaps, sleep } = recordingSleep();
    await backfillMetadata(db, answering, () => LATER, sleep);
    expect(gaps).toEqual([3500]);
  });

  test('anilist rows are spaced 2000 ms apart', async () => {
    const db = await dbWith([['a', 'anilist'], ['b', 'anilist'], ['c', 'anilist']]);
    const { gaps, sleep } = recordingSleep();
    await backfillMetadata(db, answering, () => LATER, sleep);
    expect(gaps).toEqual([2000, 2000]);
  });

  test('google-books and tmdb are not paced, and a lone row never waits', async () => {
    const db = await dbWith([['a', 'google-books'], ['b', 'google-books'], ['c', 'tmdb'], ['d', 'tmdb'], ['e', 'metron']]);
    const { gaps, sleep } = recordingSleep();
    await backfillMetadata(db, answering, () => LATER, sleep);
    expect(gaps).toEqual([]);
  });

  test('the gap is per source: interleaved sources each pace only against themselves', async () => {
    const db = await dbWith([['a', 'metron'], ['b', 'anilist'], ['c', 'metron'], ['d', 'anilist']]);
    const { gaps, sleep } = recordingSleep();
    await backfillMetadata(db, answering, () => LATER, sleep);
    expect(gaps.sort()).toEqual([2000, 3500]);
  });

  test('skipped rows (no provider) never sleep', async () => {
    const db = await dbWith([['a', 'metron'], ['b', 'metron']]);
    const { gaps, sleep } = recordingSleep();
    await backfillMetadata(db, () => null, () => LATER, sleep);
    expect(gaps).toEqual([]);
  });
});
