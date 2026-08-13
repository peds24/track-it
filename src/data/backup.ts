import type { SqlDriver } from '@/db/driver';
import { isStatusValid } from '@/domain/mode';
import type { Entry, EntryMediaType, Series, Status } from '@/domain/types';

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
      externalSource: (r.external_source as string | null) ?? null,
      externalId: (r.external_id as string | null) ?? null,
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

  return {
    id: requireString(value.id, 'series.id'),
    title: requireString(value.title, 'series.title'),
    mediaType: mediaType as Series['mediaType'],
    unitLabel: unitLabel as Series['unitLabel'],
    createdAt: requireString(value.createdAt, 'series.createdAt'),
    externalSource: requireNullableString(value.externalSource, 'series.externalSource'),
    externalId: requireNullableString(value.externalId, 'series.externalId'),
  };
}

function parseEntry(value: unknown, seriesIds: ReadonlySet<string>): Entry {
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
  // Mode is derived from media type, so some statuses are impossible (D2).
  if (!isStatusValid(mediaType as EntryMediaType, status as Status)) {
    throw new Error(`Status ${status} is not valid for a ${mediaType}`);
  }

  const seriesId = requireNullableString(value.seriesId, 'entry.seriesId');
  if (seriesId !== null && !seriesIds.has(seriesId)) {
    throw new Error(`Entry ${id} refers to a missing series`);
  }

  const ordinal = value.ordinal ?? null;
  if (ordinal !== null && typeof ordinal !== 'number') {
    throw new Error(`Entry ${id} has a non-numeric ordinal`);
  }

  return {
    id,
    seriesId,
    title: requireString(value.title, 'entry.title'),
    ordinal,
    mediaType: mediaType as EntryMediaType,
    status: status as Status,
    startedAt: requireNullableString(value.startedAt, 'entry.startedAt'),
    finishedAt: requireNullableString(value.finishedAt, 'entry.finishedAt'),
    createdAt: requireString(value.createdAt, 'entry.createdAt'),
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
  const seriesIds = new Set(series.map((s) => s.id));
  const entries = raw.entries.map((entry) => parseEntry(entry, seriesIds));

  return { version: VERSION, series, entries };
}

export async function importLibrary(db: SqlDriver, json: string): Promise<void> {
  const backup = parseBackup(json);

  await db.transaction(async () => {
    await db.run('DELETE FROM entry');
    await db.run('DELETE FROM series');

    for (const s of backup.series) {
      await db.run(
        `INSERT INTO series (id, title, media_type, unit_label, created_at, external_source, external_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.title, s.mediaType, s.unitLabel, s.createdAt, s.externalSource, s.externalId],
      );
    }

    for (const e of backup.entries) {
      await db.run(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.seriesId, e.title, e.ordinal, e.mediaType, e.status, e.startedAt, e.finishedAt, e.createdAt],
      );
    }
  });
}
