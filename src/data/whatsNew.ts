import type { SqlDriver } from '@/db/driver';
import { announcementFor, type ReleaseNote } from '@/domain/whatsNew';

const LAST_ANNOUNCED = 'last_announced_version';

async function getMeta(db: SqlDriver, key: string): Promise<string | null> {
  const rows = await db.all<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key]);
  return rows[0]?.value ?? null;
}

/** A27: record that `version` has been announced (or needs no announcing). */
export async function markAnnounced(db: SqlDriver, version: string): Promise<void> {
  await db.run(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [LAST_ANNOUNCED, version],
  );
}

/**
 * A27: the note to show on this launch, if any. A launch that has nothing
 * to show records the current version straight away, so a fresh install
 * starts announcing from its next update rather than never.
 */
export async function pendingAnnouncement(
  db: SqlDriver,
  version: string,
  notes: readonly ReleaseNote[],
): Promise<ReleaseNote | null> {
  const lastSeen = await getMeta(db, LAST_ANNOUNCED);
  const counts = await db.all<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM series) + (SELECT COUNT(*) FROM entry WHERE series_id IS NULL) AS n',
  );
  const note = announcementFor(version, lastSeen, (counts[0]?.n ?? 0) > 0, notes);
  if (!note && lastSeen !== version) await markAnnounced(db, version);
  return note;
}
