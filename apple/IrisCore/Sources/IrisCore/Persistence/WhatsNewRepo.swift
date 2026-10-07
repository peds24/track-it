import GRDB

/// Port of src/data/whatsNew.ts (A27).
private let lastAnnounced = "last_announced_version"

/// Record that `version` has been announced (or needs no announcing).
public func markAnnounced(_ db: Database, version: String) throws {
    try db.execute(
        sql: "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        arguments: [lastAnnounced, version]
    )
}

/// The note to show on this launch, if any; a launch with nothing to show
/// records the version straight away.
public func pendingAnnouncement(_ db: Database, version: String, notes: [ReleaseNote]) throws -> ReleaseNote? {
    let lastSeen = try String.fetchOne(db, sql: "SELECT value FROM app_meta WHERE key = ?", arguments: [lastAnnounced])
    let count = try Int.fetchOne(
        db, sql: "SELECT (SELECT COUNT(*) FROM series) + (SELECT COUNT(*) FROM entry WHERE series_id IS NULL) AS n"
    ) ?? 0
    let note = announcementFor(current: version, lastSeen: lastSeen, hasLibrary: count > 0, notes: notes)
    if note == nil && lastSeen != version { try markAnnounced(db, version: version) }
    return note
}
