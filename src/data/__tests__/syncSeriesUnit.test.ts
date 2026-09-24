import { syncSeriesUnit, syncUnitForEntry } from '@/data/syncSeriesUnit';
import { advanceEntry, createSeriesTrack, getTrackDetail } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import type { MetadataProvider, UnitRecord } from '@/providers/types';
import { createMemoryDriver } from '../../../test/memoryDriver';

const T0 = '2026-09-01T12:00:00.000Z';
const T1 = '2026-09-02T12:00:00.000Z';

async function comicSeries(source: string | null = 'metron'): Promise<{ db: SqlDriver; id: string }> {
  const db = createMemoryDriver();
  await migrate(db);
  const id = await createSeriesTrack(
    db,
    {
      title: 'Saga',
      mediaType: 'comic',
      unitLabel: 'issue',
      entries: [1, 2, 3].map((n) => ({ ordinal: n, title: `Issue ${n}` })),
      externalSource: source ?? undefined,
      externalId: source ? '101' : undefined,
      metadata: { coverUrl: 'https://static.metron.cloud/1.jpg', creator: 'BKV', description: null, releaseYear: '2012' },
    },
    T0,
    1,
  );
  return { db, id };
}

function provider(unitAt: (id: string, ordinal: number) => Promise<UnitRecord | null>): MetadataProvider {
  return { id: 'metron', search: jest.fn(), hydrate: jest.fn(), unitAt: jest.fn(unitAt) };
}

async function entryId(db: SqlDriver, ordinal: number): Promise<string> {
  const [row] = await db.all<{ id: string }>('SELECT id FROM entry WHERE ordinal = ?', [ordinal]);
  return row!.id;
}

test('after an advance, the series shows the issue now being read', async () => {
  const { db, id } = await comicSeries();
  await advanceEntry(db, await entryId(db, 1), T1); // issue 1 done, issue 2 in progress
  const p = provider(async () => ({ externalId: '102', number: '2', coverUrl: 'https://static.metron.cloud/2.jpg' }));

  const changed = await syncSeriesUnit(db, id, () => p);

  expect(changed).toBe(true);
  expect(p.unitAt).toHaveBeenCalledWith('101', 2);
  const detail = await getTrackDetail(db, 'series', id);
  expect(detail?.metadata.coverUrl).toBe('https://static.metron.cloud/2.jpg');
  expect(detail?.metadata.creator).toBe('BKV');
  const [series] = await db.all<{ external_id: string }>('SELECT external_id FROM series');
  expect(series?.external_id).toBe('102');
});

test("uses the catalogue's own issue number in the unit title", async () => {
  const { db, id } = await comicSeries();
  await advanceEntry(db, await entryId(db, 1), T1);

  await syncSeriesUnit(db, id, () => provider(async () => ({ externalId: '150', number: '1.1', coverUrl: null })));

  const detail = await getTrackDetail(db, 'series', id);
  expect(detail?.summary.nextEntryTitle).toBe('Issue 1.1');
  // no cover on the record: the previous one stays rather than going blank
  expect(detail?.metadata.coverUrl).toBe('https://static.metron.cloud/1.jpg');
});

test('a finished series settles on its last issue', async () => {
  const { db, id } = await comicSeries();
  await db.run("UPDATE entry SET status = 'done', finished_at = ?", [T1]);
  const p = provider(async () => null);

  await syncSeriesUnit(db, id, () => p);

  expect(p.unitAt).toHaveBeenCalledWith('101', 3);
});

test('nothing changes when the catalogue has no such issue, or the lookup failed', async () => {
  const { db, id } = await comicSeries();
  expect(await syncSeriesUnit(db, id, () => provider(async () => null))).toBe(false);
  const [series] = await db.all<{ external_id: string; cover_url: string }>('SELECT external_id, cover_url FROM series');
  expect(series).toEqual({ external_id: '101', cover_url: 'https://static.metron.cloud/1.jpg' });
});

test('a hand-typed series is never looked up', async () => {
  const { db, id } = await comicSeries(null);
  const resolve = jest.fn();
  expect(await syncSeriesUnit(db, id, resolve)).toBe(false);
  expect(resolve).not.toHaveBeenCalled();
});

test('a source without per-unit records (TMDB, AniList) is skipped', async () => {
  const { db, id } = await comicSeries('anilist');
  const noUnits: MetadataProvider = { id: 'anilist', search: jest.fn(), hydrate: jest.fn() };
  expect(await syncSeriesUnit(db, id, () => noUnits)).toBe(false);
});

test('syncUnitForEntry finds the series from one of its units, and ignores a standalone entry', async () => {
  const { db } = await comicSeries();
  const p = provider(async () => ({ externalId: '101', number: '1', coverUrl: 'https://static.metron.cloud/1.jpg' }));
  expect(await syncUnitForEntry(db, await entryId(db, 1), () => p)).toBe(false); // already current
  expect(p.unitAt).toHaveBeenCalledWith('101', 1);

  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES ('b', NULL, 'Dune', NULL, 'book', 'unstarted', ?)`,
    [T0],
  );
  const resolve = jest.fn();
  expect(await syncUnitForEntry(db, 'b', resolve)).toBe(false);
  expect(resolve).not.toHaveBeenCalled();
});
