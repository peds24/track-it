import GRDB

private struct Snapshot: Sendable {
    let source: String, externalId: String, category: Category, unitLabel: UnitLabel, coverUrl: String?, children: [Entry]
}

/// Port of src/data/syncSeriesUnit.ts (A25): after an advance, show the issue
/// now being read — its cover and the catalogue's own number ("Issue 1.1").
/// Kept out of advanceEntry so an advance never waits on the network; a
/// failed lookup is simply "no change".
public func syncSeriesUnit(
    _ writer: some DatabaseWriter, seriesId: String,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?
) async -> Bool {
    let found: Snapshot?? = try? await writer.read { db -> Snapshot? in
        guard let s = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]),
              let source: String = s["external_source"], !source.isEmpty,
              let externalId: String = s["external_id"], !externalId.isEmpty,
              let category = Category(rawValue: s["media_type"] ?? ""), let label = UnitLabel(rawValue: s["unit_label"] ?? "")
        else { return nil }
        let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
        return Snapshot(source: source, externalId: externalId, category: category, unitLabel: label, coverUrl: s["cover_url"], children: children)
    }
    guard let snap = found ?? nil else { return false } // hand-typed: never guessed at (A22)

    guard let provider = resolve(snap.source, snap.category) as? any UnitProvider else { return false }
    let ordered = byOrdinal(snap.children)
    guard let current = nextEntry(ordered) ?? ordered.last, let ordinal = current.ordinal else { return false }
    guard let unit = await provider.unitAt(snap.externalId, ordinal: ordinal) else { return false }

    let title = "\(unitTitle(snap.unitLabel)) \(unit.number)"
    let coverUrl = unit.coverUrl ?? snap.coverUrl
    if unit.externalId == snap.externalId && coverUrl == snap.coverUrl && title == current.title { return false }
    return (try? await writer.write { db -> Bool in
        try atomically(db) {
            try db.execute(sql: "UPDATE series SET external_id = ?, cover_url = ? WHERE id = ?", arguments: [unit.externalId, coverUrl, seriesId])
            try db.execute(sql: "UPDATE entry SET title = ? WHERE id = ?", arguments: [title, current.id])
        }
        return true
    }) ?? false
}

/// A25: `syncSeriesUnit` for the series an entry belongs to — what a row's advance knows.
public func syncUnitForEntry(
    _ writer: some DatabaseWriter, entryId: String,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?
) async -> Bool {
    let seriesId: String?? = try? await writer.read { db in
        try String.fetchOne(db, sql: "SELECT series_id FROM entry WHERE id = ?", arguments: [entryId])
    }
    guard let id = seriesId ?? nil, !id.isEmpty else { return false }
    return await syncSeriesUnit(writer, seriesId: id, resolve: resolve)
}
