/**
 * JSON export and import.
 *
 * NOT SURFACED IN v1. The Settings screen that drove this was removed before
 * release; nothing in `app/` imports this module today. It is kept, with its
 * tests, because the logic is complete and validated — including the
 * all-or-nothing restore, which is the hard part and the part worth not
 * rewriting from scratch. Re-enabling it means adding a screen, not rebuilding
 * the feature.
 *
 * Consequence to keep in view: with this unsurfaced, the app has no backup path
 * at all. A lost phone is a lost library.
 */
import type { SqlDriver } from '@/db/driver';
import { isStatusValid } from '@/domain/mode';
import type { Entry, EntryMediaType, SeasonBoundary, Series, Status } from '@/domain/types';
import { assertEntryInvariants, assertIsoTimestamp } from '@/domain/validate';

const VERSION = 1;

type Backup = { version: number; series: Series[]; entries: Entry[] };

const ENTRY_MEDIA_TYPES: readonly EntryMediaType[] = ['episode', 'issue', 'volume', 'book', 'movie'];
const STATUSES: readonly Status[] = ['unstarted', 'in_progress', 'done'];
const SERIES_MEDIA_TYPES: readonly Series['mediaType'][] = ['show', 'comic', 'manga'];
const UNIT_LABELS: readonly Series['unitLabel'][] = ['episode', 'issue', 'volume'];

export async function exportLibrary(db: SqlDriver): Promise<string> {
  const seriesRows = await db.all<Record<string, unknown>>('SELECT * FROM series');
  const entryRows = await db.all<Record<string, unknown>>('SELECT * FROM entry');

  const payload: Backup = {
    version: VERSION,
    series: seriesRows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      mediaType: r.media_type as Series['mediaType'],
      unitLabel: r.unit_label as Series['unitLabel'],
      createdAt: String(r.created_at),
      ongoing: r.ongoing === 1,
      paused: r.paused === 1,
      externalSource: (r.external_source as string | null) ?? null,
      externalId: (r.external_id as string | null) ?? null,
      // A11: TMDB only. Absent for every other category and for a show
      // added before this existed — JSON.stringify drops the key rather
      // than exporting an explicit null (matches how every other optional
      // field here already round-trips).
      seasons: r.seasons_json ? (JSON.parse(r.seasons_json as string) as SeasonBoundary[]) : undefined,
    })),
    entries: entryRows.map((r) => ({
      id: String(r.id),
      seriesId: (r.series_id as string | null) ?? null,
      title: String(r.title),
      ordinal: (r.ordinal as number | null) ?? null,
      mediaType: r.media_type as EntryMediaType,
      status: r.status as Status,
      startedAt: (r.started_at as string | null) ?? null,
      finishedAt: (r.finished_at as string | null) ?? null,
      createdAt: String(r.created_at),
      paused: r.paused === 1,
      externalSource: (r.external_source as string | null) ?? null,
      externalId: (r.external_id as string | null) ?? null,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Backup field ${field} must be text`);
  return value;
}

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`Backup field ${field} must be text or null`);
  return value;
}

/** A11: TMDB only, and optional — absent in a backup predating this feature,
 * and for every non-show category. */
function requireOptionalSeasons(value: unknown, field: string): readonly SeasonBoundary[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`Backup field ${field} must be a list`);
  return value.map((entry, i) => {
    if (!isRecord(entry)) throw new Error(`Backup field ${field}[${i}] is not an object`);
    if (typeof entry.number !== 'number') throw new Error(`Backup field ${field}[${i}].number must be a number`);
    if (typeof entry.episodeCount !== 'number') {
      throw new Error(`Backup field ${field}[${i}].episodeCount must be a number`);
    }
    return { number: entry.number, episodeCount: entry.episodeCount };
  });
}

function parseSeries(value: unknown): Series {
  if (!isRecord(value)) throw new Error('A series in the backup is not an object');

  const mediaType = requireString(value.mediaType, 'series.mediaType');
  if (!SERIES_MEDIA_TYPES.includes(mediaType as Series['mediaType'])) {
    throw new Error(`Unknown series media type: ${mediaType}`);
  }

  const unitLabel = requireString(value.unitLabel, 'series.unitLabel');
  if (!UNIT_LABELS.includes(unitLabel as Series['unitLabel'])) {
    throw new Error(`Unknown unit label: ${unitLabel}`);
  }

  const createdAt = requireString(value.createdAt, 'series.createdAt');
  assertIsoTimestamp(createdAt, 'series.createdAt');

  return {
    id: requireString(value.id, 'series.id'),
    title: requireString(value.title, 'series.title'),
    mediaType: mediaType as Series['mediaType'],
    unitLabel: unitLabel as Series['unitLabel'],
    createdAt,
    // A4. Absent in v1 backups, which predate ongoing series — those are finite.
    ongoing: value.ongoing === true,
    // A6. Absent in backups older than pausing — nothing to resume, so unpaused.
    paused: value.paused === true,
    externalSource: requireNullableString(value.externalSource, 'series.externalSource'),
    externalId: requireNullableString(value.externalId, 'series.externalId'),
    seasons: requireOptionalSeasons(value.seasons, 'series.seasons'),
  };
}

function parseEntry(value: unknown, unitLabelBySeriesId: ReadonlyMap<string, Series['unitLabel']>): Entry {
  if (!isRecord(value)) throw new Error('An entry in the backup is not an object');

  const id = requireString(value.id, 'entry.id');
  const mediaType = requireString(value.mediaType, 'entry.mediaType');
  if (!ENTRY_MEDIA_TYPES.includes(mediaType as EntryMediaType)) {
    throw new Error(`Unknown media type: ${mediaType}`);
  }

  const status = requireString(value.status, 'entry.status');
  if (!STATUSES.includes(status as Status)) {
    throw new Error(`Unknown status: ${status}`);
  }

  const seriesId = requireNullableString(value.seriesId, 'entry.seriesId');
  if (seriesId !== null && !unitLabelBySeriesId.has(seriesId)) {
    throw new Error(`Entry ${id} refers to a missing series`);
  }

  // Mode is derived from media type, so some statuses are impossible (D2) —
  // except a watch-mode series child (an episode), which does have an
  // in_progress state (A10).
  if (!isStatusValid(mediaType as EntryMediaType, status as Status, seriesId !== null)) {
    throw new Error(`Status ${status} is not valid for a ${mediaType}`);
  }

  const ordinal = value.ordinal ?? null;
  if (ordinal !== null && typeof ordinal !== 'number') {
    throw new Error(`Entry ${id} has a non-numeric ordinal`);
  }

  const startedAt = requireNullableString(value.startedAt, 'entry.startedAt');
  const finishedAt = requireNullableString(value.finishedAt, 'entry.finishedAt');
  const createdAt = requireString(value.createdAt, 'entry.createdAt');

  // The parent/child and timestamp invariants live in domain/, so an imported
  // entry is held to exactly the same rules as a freshly created one.
  assertEntryInvariants({
    label: `Entry ${id}`,
    mediaType: mediaType as EntryMediaType,
    parentUnitLabel: seriesId === null ? null : (unitLabelBySeriesId.get(seriesId) ?? null),
    ordinal,
    createdAt,
    startedAt,
    finishedAt,
  });

  return {
    id,
    seriesId,
    title: requireString(value.title, 'entry.title'),
    ordinal,
    mediaType: mediaType as EntryMediaType,
    status: status as Status,
    startedAt,
    finishedAt,
    createdAt,
    // A6. Absent in older backups — nothing to resume, so unpaused.
    paused: value.paused === true,
    // A9. Absent in backups older than provider-sourced tracks — nothing to record.
    externalSource: requireNullableString(value.externalSource, 'entry.externalSource'),
    externalId: requireNullableString(value.externalId, 'entry.externalId'),
  };
}

/** Validate everything first: a half-imported library reads as corruption. */
function parseBackup(json: string): Backup {
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw)) throw new Error('Backup is not an object');

  if (raw.version !== VERSION) throw new Error(`Unsupported backup version: ${String(raw.version)}`);
  if (!Array.isArray(raw.series) || !Array.isArray(raw.entries)) {
    throw new Error('Backup is missing its series or entries list');
  }

  const series = raw.series.map(parseSeries);
  const unitLabelBySeriesId = new Map(series.map((s) => [s.id, s.unitLabel]));
  if (unitLabelBySeriesId.size !== series.length) {
    throw new Error('Backup contains duplicate series ids');
  }

  const entries = raw.entries.map((entry) => parseEntry(entry, unitLabelBySeriesId));
  const entryIds = new Set(entries.map((e) => e.id));
  if (entryIds.size !== entries.length) throw new Error('Backup contains duplicate entry ids');

  return { version: VERSION, series, entries };
}

export async function importLibrary(db: SqlDriver, json: string): Promise<void> {
  const backup = parseBackup(json);

  await db.transaction(async () => {
    await db.run('DELETE FROM entry');
    await db.run('DELETE FROM series');

    for (const s of backup.series) {
      await db.run(
        `INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, paused, external_source, external_id, seasons_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.title,
          s.mediaType,
          s.unitLabel,
          s.createdAt,
          s.ongoing ? 1 : 0,
          s.paused ? 1 : 0,
          s.externalSource,
          s.externalId,
          s.seasons ? JSON.stringify(s.seasons) : null,
        ],
      );
    }

    for (const e of backup.entries) {
      await db.run(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at, paused, external_source, external_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          e.seriesId,
          e.title,
          e.ordinal,
          e.mediaType,
          e.status,
          e.startedAt,
          e.finishedAt,
          e.createdAt,
          e.paused ? 1 : 0,
          e.externalSource,
          e.externalId,
        ],
      );
    }
  });
}
