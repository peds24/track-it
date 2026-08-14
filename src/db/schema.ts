import type { SqlDriver } from '@/db/driver';

/**
 * There is no `mode` column: mode is derived from media_type.
 * There is no shelf or status column on `series`: shelf is derived from children.
 */
const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE IF NOT EXISTS series (
    id              TEXT PRIMARY KEY NOT NULL,
    title           TEXT NOT NULL,
    media_type      TEXT NOT NULL CHECK (media_type IN ('show','comic','manga')),
    unit_label      TEXT NOT NULL CHECK (unit_label IN ('episode','issue','volume')),
    created_at      TEXT NOT NULL,
    external_source TEXT,
    external_id     TEXT
  );

  CREATE TABLE IF NOT EXISTS entry (
    id          TEXT PRIMARY KEY NOT NULL,
    series_id   TEXT REFERENCES series(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    ordinal     INTEGER,
    media_type  TEXT NOT NULL CHECK (media_type IN ('episode','issue','volume','book','movie')),
    status      TEXT NOT NULL CHECK (status IN ('unstarted','in_progress','done')),
    started_at  TEXT,
    finished_at TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entry_series ON entry(series_id);
  CREATE INDEX IF NOT EXISTS idx_entry_status ON entry(status);
  `,
  // A4: a series that is still being published has no final count. Existing
  // rows default to 0, so every series already in a library stays finite.
  `
  ALTER TABLE series ADD COLUMN ongoing INTEGER NOT NULL DEFAULT 0;
  `,
  // A6: paused is a separate bit from status, not a fourth status value —
  // pausing must not disturb what advance()/D2 already enforce about which
  // statuses a given mode can hold. A paused track is pulled into Backlog by
  // shelfForSeries/shelfForEntry while its children's statuses (and thus its
  // progress) sit untouched, so resuming needs only clear the flag.
  `
  ALTER TABLE series ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE entry ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
  `,
  // A9: a standalone book or movie added through a real provider (Google
  // Books, TMDB) needs somewhere to record where it came from, same as
  // `series` already could (D5) but never used until now. NULL for every
  // entry that is a series child (the series row records it instead) or was
  // typed by hand with no catalogue match.
  `
  ALTER TABLE entry ADD COLUMN external_source TEXT;
  ALTER TABLE entry ADD COLUMN external_id TEXT;
  `,
];

/**
 * Runs pending migrations in one transaction. A partial migration is the only
 * unrecoverable state in an app with no server-side backup, so failure must
 * leave the previous schema untouched.
 */
export async function migrate(db: SqlDriver): Promise<void> {
  await db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const rows = await db.all<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
  const current = rows[0]?.version ?? 0;

  if (current >= MIGRATIONS.length) return;

  await db.transaction(async () => {
    for (let i = current; i < MIGRATIONS.length; i += 1) {
      await db.exec(MIGRATIONS[i]!);
    }
    await db.run('DELETE FROM schema_version');
    await db.run('INSERT INTO schema_version (version) VALUES (?)', [MIGRATIONS.length]);
  });
}
