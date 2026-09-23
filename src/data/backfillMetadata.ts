import type { SqlDriver } from '@/db/driver';
import type { Category, TrackMetadata } from '@/domain/types';
import { providerForSource } from '@/providers/registry';
import type { MetadataProvider } from '@/providers/types';

type PendingRow = { id: string; media_type: Category; external_source: string; external_id: string };

/**
 * Minimum gap between two lookups against the same source. Metron allows
 * ~20 requests/min per account and each Metron row costs two (issue, then
 * series), so 3.5 s keeps a first launch with many comics under it; AniList's
 * limit is per minute too. TMDB and Google Books need no pacing at this scale.
 */
const SOURCE_GAP_MS: Record<string, number> = { metron: 3500, anilist: 2000, tmdb: 0, 'google-books': 0 };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A22: tracks matched before metadata was stored get it once, on launch.
 * Only rows with a catalogue id are touched — a hand-typed track is never
 * guessed at (settled with the user, 2026-09-22). Lookups run one at a time,
 * paced per source (`SOURCE_GAP_MS`) so a first launch with many matched rows
 * can't burst Metron's or AniList's rate limits. A row is stamped
 * `metadata_checked_at` whenever the lookup *answered* (even with nothing),
 * and left unstamped when it failed, so an offline launch retries next time.
 * COALESCE keeps anything already stored — the backfill only fills gaps.
 */
export async function backfillMetadata(
  db: SqlDriver,
  resolve: (source: string, category: Category) => MetadataProvider | null = providerForSource,
  now: () => string = () => new Date().toISOString(),
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<{ filled: number; skipped: number; failed: number }> {
  const series = await db.all<PendingRow>(
    `SELECT id, media_type, external_source, external_id FROM series
     WHERE external_source IS NOT NULL AND external_id IS NOT NULL AND metadata_checked_at IS NULL`,
  );
  const entries = await db.all<PendingRow>(
    `SELECT id, media_type, external_source, external_id FROM entry
     WHERE series_id IS NULL AND external_source IS NOT NULL AND external_id IS NOT NULL AND metadata_checked_at IS NULL`,
  );

  const result = { filled: 0, skipped: 0, failed: 0 };
  const pending = [
    ...series.map((row) => ({ table: 'series' as const, row })),
    ...entries.map((row) => ({ table: 'entry' as const, row })),
  ];

  const queried = new Set<string>();
  for (const { table, row } of pending) {
    const provider = resolve(row.external_source, row.media_type);
    if (!provider?.details) {
      await db.run(`UPDATE ${table} SET metadata_checked_at = ? WHERE id = ?`, [now(), row.id]);
      result.skipped += 1;
      continue;
    }

    const gap = SOURCE_GAP_MS[row.external_source] ?? 0;
    if (gap > 0 && queried.has(row.external_source)) await sleep(gap);
    queried.add(row.external_source);

    let metadata: TrackMetadata | null;
    try {
      metadata = await provider.details(row.external_id);
    } catch {
      metadata = null;
    }
    if (metadata === null) {
      result.failed += 1;
      continue;
    }

    await db.run(
      `UPDATE ${table} SET
         cover_url = COALESCE(cover_url, ?),
         creator = COALESCE(creator, ?),
         description = COALESCE(description, ?),
         release_year = COALESCE(release_year, ?),
         metadata_checked_at = ?
       WHERE id = ?`,
      [metadata.coverUrl, metadata.creator, metadata.description, metadata.releaseYear, now(), row.id],
    );
    result.filled += 1;
  }

  return result;
}
