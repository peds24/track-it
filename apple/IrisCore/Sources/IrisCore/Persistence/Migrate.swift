import GRDB

/// Port of src/db/schema.ts `migrate`: pending migrations in one transaction,
/// tracked in the TS app's own `schema_version` table (not GRDB's migrator,
/// whose bookkeeping table would make the schema differ from the TS one).
public func migrate(_ db: Database) throws {
    try db.execute(sql: "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
    let current = try Int.fetchOne(db, sql: "SELECT version FROM schema_version LIMIT 1") ?? 0
    if current >= migrations.count { return }
    try db.inSavepoint {
        for sql in migrations[current...] { try db.execute(sql: sql) }
        try db.execute(sql: "DELETE FROM schema_version")
        try db.execute(sql: "INSERT INTO schema_version (version) VALUES (?)", arguments: [migrations.count])
        return .commit
    }
}

/// The library database at `path`, migrated. GRDB enables foreign keys by
/// default, which `ON DELETE CASCADE` (deleting a series) relies on.
public func openLibrary(at path: String) throws -> DatabaseQueue {
    let queue = try DatabaseQueue(path: path)
    try queue.write { try migrate($0) }
    return queue
}
