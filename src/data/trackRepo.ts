import type { SqlDriver } from '@/db/driver';
import { advance } from '@/domain/advance';
import { nextEntry, progressFor, shelfForEntry, shelfForSeries } from '@/domain/shelf';
import type { Category, Entry, Series, Shelf } from '@/domain/types';
import type { SeriesDraft } from '@/providers/types';

export type TrackSummary = {
  kind: 'series' | 'entry';
  id: string;
  title: string;
  category: Category;
  shelf: Shelf;
  createdAt: string;
  progress: { done: number; total: number } | null;
  nextEntryId: string | null;
  nextEntryTitle: string | null;
  /** When this track last moved forward. Derived at read time (D3), never stored. */
  lastAdvancedAt: string | null;
};

type SeriesRow = {
  id: string;
  title: string;
  media_type: Series['mediaType'];
  unit_label: Series['unitLabel'];
  created_at: string;
  external_source: string | null;
  external_id: string | null;
};

type EntryRow = {
  id: string;
  series_id: string | null;
  title: string;
  ordinal: number | null;
  media_type: Entry['mediaType'];
  status: Entry['status'];
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    seriesId: row.series_id,
    title: row.title,
    ordinal: row.ordinal,
    mediaType: row.media_type,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSeriesTrack(
  db: SqlDriver,
  draft: SeriesDraft,
  now: string,
): Promise<string> {
  const seriesId = newId();

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO series (id, title, media_type, unit_label, created_at, external_source, external_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        seriesId,
        draft.title,
        draft.mediaType,
        draft.unitLabel,
        now,
        draft.externalSource ?? null,
        draft.externalId ?? null,
      ],
    );

    for (const entry of draft.entries) {
      await db.run(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'unstarted', ?)`,
        [newId(), seriesId, entry.title, entry.ordinal, draft.unitLabel, now],
      );
    }
  });

  return seriesId;
}

export async function createStandaloneTrack(
  db: SqlDriver,
  input: { title: string; category: 'book' | 'movie' },
  now: string,
): Promise<string> {
  const id = newId();
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
     VALUES (?, NULL, ?, NULL, ?, 'unstarted', ?)`,
    [id, input.title, input.category, now],
  );
  return id;
}

/**
 * The later of an entry's two timestamps, or null if it has never been touched.
 * Read mode sets startedAt on the first tap and finishedAt on the second, so
 * neither column alone is enough. ISO-8601 sorts lexicographically in
 * chronological order, which is what the createdAt sort already relies on.
 */
function lastAdvanceOf(entry: Entry): string | null {
  const { startedAt, finishedAt } = entry;
  if (startedAt === null) return finishedAt;
  if (finishedAt === null) return startedAt;
  return finishedAt.localeCompare(startedAt) >= 0 ? finishedAt : startedAt;
}

/** The most recent advance across a series' children — the maximum, not the last one written. */
function lastAdvanceAcross(children: readonly Entry[]): string | null {
  let latest: string | null = null;
  for (const child of children) {
    const stamp = lastAdvanceOf(child);
    if (stamp === null) continue;
    if (latest === null || stamp.localeCompare(latest) > 0) latest = stamp;
  }
  return latest;
}

/** D9: the backlog and Done shelves are ordered by date added. */
function byDateAdded(a: TrackSummary, b: TrackSummary): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * D12: Currently is ordered by most recently advanced, so the thing you touched
 * last session sits at the top next session. Tracks with no advance timestamp at
 * all sort last, and ties fall back to date added.
 */
function byMostRecentlyAdvanced(a: TrackSummary, b: TrackSummary): number {
  if (a.lastAdvancedAt === null && b.lastAdvancedAt !== null) return 1;
  if (a.lastAdvancedAt !== null && b.lastAdvancedAt === null) return -1;
  if (a.lastAdvancedAt !== null && b.lastAdvancedAt !== null) {
    const cmp = b.lastAdvancedAt.localeCompare(a.lastAdvancedAt);
    if (cmp !== 0) return cmp;
  }
  return byDateAdded(a, b);
}

/** Shelf is computed in domain/, never queried for directly (D3). */
export async function listTracks(
  db: SqlDriver,
  shelf: Shelf,
  category?: Category,
): Promise<TrackSummary[]> {
  const seriesRows = await db.all<SeriesRow>('SELECT * FROM series');
  const entryRows = await db.all<EntryRow>('SELECT * FROM entry');
  const entries = entryRows.map(toEntry);

  const summaries: TrackSummary[] = [];

  for (const row of seriesRows) {
    const children = entries.filter((e) => e.seriesId === row.id);
    const next = nextEntry(children);
    summaries.push({
      kind: 'series',
      id: row.id,
      title: row.title,
      category: row.media_type,
      shelf: shelfForSeries(children),
      createdAt: row.created_at,
      progress: progressFor(children),
      nextEntryId: next?.id ?? null,
      nextEntryTitle: next?.title ?? null,
      lastAdvancedAt: lastAdvanceAcross(children),
    });
  }

  for (const entry of entries) {
    if (entry.seriesId !== null) continue;
    summaries.push({
      kind: 'entry',
      id: entry.id,
      title: entry.title,
      category: entry.mediaType as Category,
      shelf: shelfForEntry(entry),
      createdAt: entry.createdAt,
      progress: null,
      // Non-null means advanceable. A finished standalone track yields null,
      // matching what nextEntry() already does for a fully-done series —
      // otherwise the Done filter would render a working advance button on a
      // finished book, and tapping it would throw "already done".
      nextEntryId: entry.status === 'done' ? null : entry.id,
      nextEntryTitle: entry.status === 'done' ? null : entry.title,
      lastAdvancedAt: lastAdvanceOf(entry),
    });
  }

  return summaries
    .filter((t) => t.shelf === shelf)
    .filter((t) => category === undefined || t.category === category)
    .sort(shelf === 'currently' ? byMostRecentlyAdvanced : byDateAdded);
}

/** Transition rules live in domain/advance; this only persists the result (D8). */
export async function advanceEntry(db: SqlDriver, entryId: string, now: string): Promise<void> {
  const rows = await db.all<EntryRow>('SELECT * FROM entry WHERE id = ?', [entryId]);
  const row = rows[0];
  if (!row) throw new Error(`Entry ${entryId} not found`);

  const updated = advance(toEntry(row), now);

  await db.run('UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?', [
    updated.status,
    updated.startedAt,
    updated.finishedAt,
    updated.id,
  ]);
}
