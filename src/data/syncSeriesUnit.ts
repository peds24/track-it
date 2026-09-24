import type { SqlDriver } from '@/db/driver';
import { nextEntry } from '@/domain/shelf';
import type { Category } from '@/domain/types';
import { toEntry, UNIT_TITLE } from '@/data/trackRepo';
import { providerForSource } from '@/providers/registry';
import type { MetadataProvider } from '@/providers/types';

type Resolve = (source: string, category: Category) => MetadataProvider | null;

type SeriesRow = {
  id: string;
  media_type: Category;
  unit_label: keyof typeof UNIT_TITLE;
  external_source: string | null;
  external_id: string | null;
  cover_url: string | null;
};

/**
 * A25: Longbox's advance, for a catalogued comic. After the position moves,
 * look up the issue now being read and show its cover and real issue number
 * ("Issue 1.1"). The stored `external_id` follows along, so the backfill
 * (A22) and the next sync start from the current issue. Kept out of
 * `advanceEntry` so an advance never waits on, or fails with, the network:
 * callers run this afterwards and reload when it reports a change.
 */
export async function syncSeriesUnit(
  db: SqlDriver,
  seriesId: string,
  resolve: Resolve = providerForSource,
): Promise<boolean> {
  const [series] = await db.all<SeriesRow>('SELECT * FROM series WHERE id = ?', [seriesId]);
  if (!series?.external_source || !series.external_id) return false; // hand-typed: never guessed at (A22)

  const provider = resolve(series.external_source, series.media_type);
  if (!provider?.unitAt) return false;

  const children = (await db.all<Parameters<typeof toEntry>[0]>('SELECT * FROM entry WHERE series_id = ?', [seriesId])).map(toEntry);
  const ordered = [...children].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const current = nextEntry(ordered) ?? ordered[ordered.length - 1];
  if (!current || current.ordinal === null) return false;

  const unit = await provider.unitAt(series.external_id, current.ordinal);
  if (!unit) return false;

  const title = `${UNIT_TITLE[series.unit_label]} ${unit.number}`;
  const coverUrl = unit.coverUrl ?? series.cover_url;
  if (unit.externalId === series.external_id && coverUrl === series.cover_url && title === current.title) return false;

  await db.transaction(async () => {
    await db.run('UPDATE series SET external_id = ?, cover_url = ? WHERE id = ?', [unit.externalId, coverUrl, seriesId]);
    await db.run('UPDATE entry SET title = ? WHERE id = ?', [title, current.id]);
  });
  return true;
}

/** A25: `syncSeriesUnit` for the series an entry belongs to — what a row's advance knows. */
export async function syncUnitForEntry(db: SqlDriver, entryId: string, resolve: Resolve = providerForSource): Promise<boolean> {
  const [row] = await db.all<{ series_id: string | null }>('SELECT series_id FROM entry WHERE id = ?', [entryId]);
  return row?.series_id ? syncSeriesUnit(db, row.series_id, resolve) : false;
}
