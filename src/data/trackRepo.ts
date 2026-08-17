import type { SqlDriver } from '@/db/driver';
import { advance } from '@/domain/advance';
import { nextEntry, progressFor, shelfForEntry, shelfForSeries } from '@/domain/shelf';
import type { Category, Entry, SeasonBoundary, Series, Shelf, Status } from '@/domain/types';
import { assertEntryInvariants, assertIsoTimestamp, isStandaloneMediaType } from '@/domain/validate';
import type { SeriesDraft } from '@/providers/types';

export type TrackSummary = {
  kind: 'series' | 'entry';
  id: string;
  title: string;
  category: Category;
  shelf: Shelf;
  createdAt: string;
  progress: { done: number; total: number } | null;
  /**
   * The status of the entry the advance control would act on. The UI needs it to
   * tell "Reading Volume 5" from "Next Volume 5" — a read-mode entry that is
   * already in progress is not one you are about to start.
   */
  /** A4: still being published — no total, no bar, never reaches Done. */
  ongoing: boolean;
  /** A6: in Backlog with progress intact — the row offers Resume, not Start. */
  paused: boolean;
  /** A11: TMDB only. `null` for every other category and for a show added
   * before this existed. */
  seasons: readonly SeasonBoundary[] | null;
  nextEntryStatus: Status | null;
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
  ongoing: number;
  paused: number;
  created_at: string;
  external_source: string | null;
  external_id: string | null;
  seasons_json: string | null;
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
  paused: number;
  external_source: string | null;
  external_id: string | null;
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
    paused: row.paused === 1,
    externalSource: row.external_source ?? null,
    externalId: row.external_id ?? null,
  };
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSeriesTrack(
  db: SqlDriver,
  draft: SeriesDraft,
  now: string,
  /**
   * A10: a comic/manga title can embed its own volume/issue number ("Saga
   * #12"), parsed off before this is called (see `parseSeriesTitle`). When
   * it names an entry that actually exists in this draft — within the count
   * for a finite series, or just ≥ 1 for an ongoing one — that entry starts
   * `in_progress` instead of every entry starting `unstarted`, set inside
   * this same transaction so the series is never briefly in a state where
   * some entries exist and the start hasn't been applied. An out-of-range
   * ordinal (e.g. "#99" on a 12-issue series) is silently ignored — not an
   * error, not clamped — exactly as if no ordinal had been parsed.
   */
  startAtOrdinal?: number,
): Promise<string> {
  const seriesId = newId();

  const validStartOrdinal =
    startAtOrdinal !== undefined &&
    startAtOrdinal >= 1 &&
    (draft.ongoing === true || startAtOrdinal <= draft.entries.length)
      ? startAtOrdinal
      : null;

  // An ongoing series (A4) always generates exactly one bootstrap entry,
  // numbered 1 — there is no bulk run to index a parsed ordinal into. Rather
  // than create "Volume 1" and silently ignore a title that said "Volume 8",
  // renumber that lone entry to the parsed ordinal; appendNextOngoingEntry
  // already continues from the highest existing ordinal, so growth from 8
  // onward costs it nothing.
  const entries =
    draft.ongoing === true && validStartOrdinal !== null
      ? [{ ordinal: validStartOrdinal, title: `${UNIT_TITLE[draft.unitLabel]} ${validStartOrdinal}` }]
      : draft.entries;

  // Enforce the invariants before opening the transaction: a rejected draft
  // should never have touched the database at all.
  assertIsoTimestamp(now, 'series createdAt');
  for (const entry of entries) {
    assertEntryInvariants({
      label: `Entry "${entry.title}"`,
      mediaType: draft.unitLabel,
      parentUnitLabel: draft.unitLabel,
      ordinal: entry.ordinal,
      createdAt: now,
    });
  }

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, external_source, external_id, seasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seriesId,
        draft.title,
        draft.mediaType,
        draft.unitLabel,
        now,
        draft.ongoing === true ? 1 : 0,
        draft.externalSource ?? null,
        draft.externalId ?? null,
        draft.seasons ? JSON.stringify(draft.seasons) : null,
      ],
    );

    for (const entry of entries) {
      // A11 fix: starting at ordinal N means N-1 units already happened —
      // scanning volume 29 of a 34-volume series is "I've read up through
      // 28," not "I own volume 29 and nothing else." Backfilling 1..N-1 as
      // done (not left unstarted) is what makes both progress ("28 of 34")
      // and nextEntry() (which resumes at the lowest unstarted ordinal)
      // correct — leaving them unstarted made finishing the started entry
      // fall back to ordinal 1 instead of continuing to N+1.
      const isBeforeStart = validStartOrdinal !== null && entry.ordinal < validStartOrdinal;
      const startsHere = validStartOrdinal !== null && entry.ordinal === validStartOrdinal;
      const status = isBeforeStart ? 'done' : startsHere ? 'in_progress' : 'unstarted';
      await db.run(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          seriesId,
          entry.title,
          entry.ordinal,
          draft.unitLabel,
          status,
          status !== 'unstarted' ? now : null,
          status === 'done' ? now : null,
          now,
        ],
      );
    }
  });

  return seriesId;
}

export async function createStandaloneTrack(
  db: SqlDriver,
  input: {
    title: string;
    category: 'book' | 'movie';
    /** A9: set when the title came from a confirmed catalogue match rather
     * than being typed by hand — a search hit or a barcode scan. */
    externalSource?: string;
    externalId?: string;
  },
  now: string,
): Promise<string> {
  const id = newId();
  assertEntryInvariants({
    label: `Entry "${input.title}"`,
    mediaType: input.category,
    parentUnitLabel: null,
    createdAt: now,
  });
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id)
     VALUES (?, NULL, ?, NULL, ?, 'unstarted', ?, ?, ?)`,
    [id, input.title, input.category, now, input.externalSource ?? null, input.externalId ?? null],
  );
  return id;
}

/**
 * The entry a freshly added track would advance first: its own row for a
 * standalone track, or (usually) ordinal 1 for a series. Lets a caller (the
 * Add screen) start a track it just created without a second trip through
 * listTracks to rediscover what nextEntry() would already say.
 *
 * A10: a comic/manga title's embedded volume/issue number can already have
 * started an entry other than ordinal 1 at creation (`createSeriesTrack`'s
 * `startAtOrdinal`) — the status comes back alongside the id so a caller can
 * tell "already started by A10" from "needs its first tap" and not advance
 * an in_progress entry straight to done.
 */
export async function firstEntryOf(
  db: SqlDriver,
  track: { kind: 'series' | 'entry'; id: string },
): Promise<{ id: string; status: Status }> {
  if (track.kind === 'entry') {
    const rows = await db.all<EntryRow>('SELECT * FROM entry WHERE id = ?', [track.id]);
    const entry = rows[0];
    if (!entry) throw new Error(`Entry ${track.id} not found`);
    return { id: entry.id, status: entry.status };
  }

  const rows = await db.all<EntryRow>(
    'SELECT * FROM entry WHERE series_id = ? ORDER BY ordinal ASC',
    [track.id],
  );
  if (rows.length === 0) throw new Error(`Series ${track.id} has no entries`);
  const target = rows.find((r) => r.status === 'in_progress') ?? rows[0]!;
  return { id: target.id, status: target.status };
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
      shelf: shelfForSeries(children, row.paused === 1),
      createdAt: row.created_at,
      // An ongoing series has no denominator, so it reports no progress at all
      // rather than a total that is really "however many I have added so far".
      progress: row.ongoing === 1 ? null : progressFor(children),
      ongoing: row.ongoing === 1,
      paused: row.paused === 1,
      seasons: row.seasons_json ? (JSON.parse(row.seasons_json) as SeasonBoundary[]) : null,
      nextEntryStatus: next?.status ?? null,
      nextEntryId: next?.id ?? null,
      nextEntryTitle: next?.title ?? null,
      lastAdvancedAt: lastAdvanceAcross(children),
    });
  }

  for (const entry of entries) {
    if (entry.seriesId !== null) continue;
    // A parentless entry is a book or a movie (the invariant every write path
    // now enforces). Checking instead of asserting keeps a row written by an
    // older build out of the list rather than giving it a category outside the
    // union, which would render under no filter chip at all.
    if (!isStandaloneMediaType(entry.mediaType)) continue;
    summaries.push({
      kind: 'entry',
      id: entry.id,
      title: entry.title,
      category: entry.mediaType,
      shelf: shelfForEntry(entry),
      createdAt: entry.createdAt,
      progress: null,
      ongoing: false,
      paused: entry.paused,
      seasons: null,
      // Non-null means advanceable. A finished standalone track yields null,
      // matching what nextEntry() already does for a fully-done series —
      // otherwise the Done filter would render a working advance button on a
      // finished book, and tapping it would throw "already done".
      nextEntryStatus: entry.status === 'done' ? null : entry.status,
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

  const entry = toEntry(row);
  // A7/A10: advance() already gives every entry the one status transition its
  // mode and kind allow — unstarted -> in_progress -> done for read mode and
  // for a watch-mode series child (an episode), unstarted -> done in one call
  // only for a standalone watch-mode entry (a movie, D2). A5's "one act"
  // auto-start is layered on below, only once an entry actually reaches done;
  // it must not also swallow the first tap on an untouched volume or episode,
  // or starting it would immediately report it finished.
  const updated = advance(entry, now);

  await db.run('UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?', [
    updated.status,
    updated.startedAt,
    updated.finishedAt,
    updated.id,
  ]);

  if (updated.status === 'done') {
    await appendNextOngoingEntry(db, updated, now);
    await startNextInSeries(db, updated, now);
  }
}

/**
 * A4: an ongoing series has no pre-generated list, so finishing its last entry
 * appends the next one. That is what keeps it out of Done — an unfinished
 * series is not something you have finished — and it falls out of the derived
 * shelves rather than needing a rule of its own.
 */
async function appendNextOngoingEntry(db: SqlDriver, finished: Entry, now: string): Promise<void> {
  if (finished.seriesId === null) return;

  const seriesRows = await db.all<SeriesRow>('SELECT * FROM series WHERE id = ?', [
    finished.seriesId,
  ]);
  const series = seriesRows[0];
  if (!series || series.ongoing !== 1) return;

  const siblings = await db.all<EntryRow>('SELECT * FROM entry WHERE series_id = ?', [
    finished.seriesId,
  ]);
  // Only extend from the end. Finishing an earlier entry out of order must not
  // append a duplicate.
  const highest = siblings.reduce((max, r) => Math.max(max, r.ordinal ?? 0), 0);
  if ((finished.ordinal ?? 0) < highest) return;

  const ordinal = highest + 1;
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'unstarted', ?)`,
    [newId(), series.id, `${UNIT_TITLE[series.unit_label]} ${ordinal}`, ordinal, series.unit_label, now],
  );
}

/**
 * A5/A10: mark the following unit as in progress, so the row reads "Reading
 * Volume 8" (or "Watching Episode 4") the moment the previous unit is
 * finished. Standalone tracks (seriesId null) are the only ones this skips —
 * a movie has no next unit to mark, whatever its mode.
 */
async function startNextInSeries(db: SqlDriver, finished: Entry, now: string): Promise<void> {
  if (finished.seriesId === null) return;

  const rows = await db.all<EntryRow>('SELECT * FROM entry WHERE series_id = ?', [
    finished.seriesId,
  ]);
  const next = nextEntry(rows.map(toEntry));
  if (!next || next.status !== 'unstarted') return;

  await db.run("UPDATE entry SET status = 'in_progress', started_at = ? WHERE id = ?", [
    now,
    next.id,
  ]);
}

/** Matches the titles ManualProvider generates, so both paths read alike. */
const UNIT_TITLE: Record<Series['unitLabel'], string> = {
  episode: 'Episode',
  issue: 'Issue',
  volume: 'Volume',
};

/**
 * Remove a track and everything under it.
 *
 * v1 had no delete at all, which is what made several small mistakes
 * unrecoverable — a mistyped volume count or a track added to the wrong
 * category was permanent. Deleting a series relies on the schema's
 * `ON DELETE CASCADE` to take its entries with it.
 */
export async function deleteTrack(
  db: SqlDriver,
  track: { kind: 'series' | 'entry'; id: string },
): Promise<void> {
  const table = track.kind === 'series' ? 'series' : 'entry';
  await db.run(`DELETE FROM ${table} WHERE id = ?`, [track.id]);
}

/**
 * Send a track back to the Backlog shelf.
 *
 * A6: a track that still has something left to finish is paused, not reset —
 * the flag pulls it into Backlog while every child's status and timestamps sit
 * untouched, so Resume puts it back exactly as it was. A track that is already
 * fully finished has nothing left to preserve, so this still does the original
 * D4 reset: every child back to unstarted, ready to be watched or read again.
 */
export async function returnTrackToBacklog(
  db: SqlDriver,
  track: { kind: 'series' | 'entry'; id: string },
): Promise<void> {
  if (track.kind === 'series') {
    const children = await db.all<EntryRow>('SELECT * FROM entry WHERE series_id = ?', [track.id]);
    const finished = children.length > 0 && children.every((c) => c.status === 'done');
    if (finished) {
      await db.run(
        `UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL WHERE series_id = ?`,
        [track.id],
      );
      await db.run('UPDATE series SET paused = 0 WHERE id = ?', [track.id]);
    } else {
      await db.run('UPDATE series SET paused = 1 WHERE id = ?', [track.id]);
    }
    return;
  }

  const rows = await db.all<EntryRow>('SELECT * FROM entry WHERE id = ?', [track.id]);
  const entry = rows[0];
  if (!entry) return;
  if (entry.status === 'done') {
    await db.run(
      `UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL, paused = 0 WHERE id = ?`,
      [track.id],
    );
  } else {
    await db.run('UPDATE entry SET paused = 1 WHERE id = ?', [track.id]);
  }
}

/**
 * A6: undo a pause. The child statuses were never touched, so this only clears
 * the flag — the track reappears in Currently wherever its progress left it.
 */
export async function resumeTrack(
  db: SqlDriver,
  track: { kind: 'series' | 'entry'; id: string },
): Promise<void> {
  const table = track.kind === 'series' ? 'series' : 'entry';
  await db.run(`UPDATE ${table} SET paused = 0 WHERE id = ?`, [track.id]);
}
