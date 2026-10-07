import Foundation
import GRDB

/// Port of src/data/backup.ts — the cross-platform backup (spec §3). Version 1.
private let backupVersion = 1.0

// MARK: Export

private func exportMetadata(_ row: Row, into out: inout [String: JSONValue]) {
    for (column, key) in [("cover_url", "coverUrl"), ("creator", "creator"), ("description", "description"),
                          ("release_year", "releaseYear"), ("metadata_checked_at", "metadataCheckedAt")] {
        if let value: String = row[column], !value.isEmpty { out[key] = .string(value) }
    }
    if let genres: String = row["genres_json"], let parsed = try? JSONDecoder().decode(JSONValue.self, from: Data(genres.utf8)) {
        out["genres"] = parsed
    }
}

private func text(_ row: Row, _ column: String) -> JSONValue { (row[column] as String?).map(JSONValue.string) ?? .null }

public func exportLibrary(_ db: Database) throws -> String {
    let series: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM series").map { r in
        var o: [String: JSONValue] = [
            "id": text(r, "id"), "title": text(r, "title"), "mediaType": text(r, "media_type"), "unitLabel": text(r, "unit_label"),
            "createdAt": text(r, "created_at"), "ongoing": .bool((r["ongoing"] as Int? ?? 0) == 1),
            "paused": .bool((r["paused"] as Int? ?? 0) == 1), "externalSource": text(r, "external_source"), "externalId": text(r, "external_id"),
        ]
        if let seasons: String = r["seasons_json"], !seasons.isEmpty,
           let parsed = try? JSONDecoder().decode(JSONValue.self, from: Data(seasons.utf8)) { o["seasons"] = parsed }
        exportMetadata(r, into: &o)
        return .object(o)
    }
    let entries: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM entry").map { r in
        var o: [String: JSONValue] = [
            "id": text(r, "id"), "seriesId": text(r, "series_id"), "title": text(r, "title"),
            "ordinal": (r["ordinal"] as Int?).map { .number(Double($0)) } ?? .null,
            "mediaType": text(r, "media_type"), "status": text(r, "status"), "startedAt": text(r, "started_at"),
            "finishedAt": text(r, "finished_at"), "createdAt": text(r, "created_at"), "paused": .bool((r["paused"] as Int? ?? 0) == 1),
            "externalSource": text(r, "external_source"), "externalId": text(r, "external_id"),
        ]
        exportMetadata(r, into: &o)
        return .object(o)
    }
    let ratings: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM rating ORDER BY category, position").map { r in
        .object([
            "trackKind": text(r, "track_kind"), "trackId": text(r, "track_id"), "category": text(r, "category"),
            "sentiment": text(r, "sentiment"), "position": .number(Double(r["position"] as Int? ?? 0)), "ratedAt": text(r, "rated_at"),
        ])
    }
    let payload = JSONValue.object(["version": .number(backupVersion), "series": .array(series), "entries": .array(entries), "ratings": .array(ratings)])
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes, .sortedKeys]
    return String(decoding: try encoder.encode(payload), as: UTF8.self)
}

// MARK: Import — validate everything first (a half-imported library reads as corruption)

private struct SeriesRecord {
    var id, title: String
    var mediaType: SeriesMediaType
    var unitLabel: UnitLabel
    var createdAt: String
    var ongoing, paused: Bool
    var externalSource, externalId: String?
    var seasons: [SeasonBoundary]?
    var metadata: MetadataRecord
}

private struct EntryRecord {
    var id: String
    var seriesId: String?
    var title: String
    var ordinal: Double?
    var mediaType: EntryMediaType
    var status: Status
    var startedAt, finishedAt: String?
    var createdAt: String
    var paused: Bool
    var externalSource, externalId: String?
    var metadata: MetadataRecord
}

private struct MetadataRecord {
    var coverUrl, creator, description, releaseYear, metadataCheckedAt: String?
    var genres: [String]?
    var params: [(any DatabaseValueConvertible)?] { [coverUrl, creator, description, releaseYear, metadataCheckedAt, genres.map(jsonText)] }
}

private struct RatingRecord {
    var trackKind: TrackKind
    var trackId: String
    var category: Category
    var sentiment: Sentiment
    var position: Int
    var ratedAt: String
}

private func requireString(_ v: JSONValue?, _ field: String) throws -> String {
    guard case let .string(s)? = v else { throw DomainError("Backup field \(field) must be text") }
    return s
}

private func requireNullableString(_ v: JSONValue?, _ field: String) throws -> String? {
    switch v {
    case nil, .null?: return nil
    case let .string(s)?: return s
    default: throw DomainError("Backup field \(field) must be text or null")
    }
}

private func requireOptionalSeasons(_ v: JSONValue?, _ field: String) throws -> [SeasonBoundary]? {
    switch v {
    case nil, .null?: return nil
    case let .array(items)?:
        return try items.enumerated().map { i, item in
            guard let o = item.object else { throw DomainError("Backup field \(field)[\(i)] is not an object") }
            // Iris I4: whole and safe, as backup.ts now requires.
            guard case let .number(n)? = o["number"], isSafeInteger(n) else { throw DomainError("Backup field \(field)[\(i)].number must be a whole number") }
            guard case let .number(c)? = o["episodeCount"], isSafeInteger(c) else { throw DomainError("Backup field \(field)[\(i)].episodeCount must be a whole number") }
            return SeasonBoundary(number: Int(n), episodeCount: Int(c))
        }
    default: throw DomainError("Backup field \(field) must be a list")
    }
}

private func requireOptionalStrings(_ v: JSONValue?, _ field: String) throws -> [String]? {
    switch v {
    case nil, .null?: return nil
    case let .array(items)? where items.allSatisfy({ $0.string != nil }): return items.compactMap(\.string)
    default: throw DomainError("Backup field \(field) must be a list of text")
    }
}

private func parseMetadata(_ o: [String: JSONValue], _ kind: String) throws -> MetadataRecord {
    MetadataRecord(
        coverUrl: try requireNullableString(o["coverUrl"], "\(kind).coverUrl"),
        creator: try requireNullableString(o["creator"], "\(kind).creator"),
        description: try requireNullableString(o["description"], "\(kind).description"),
        releaseYear: try requireNullableString(o["releaseYear"], "\(kind).releaseYear"),
        metadataCheckedAt: try requireNullableString(o["metadataCheckedAt"], "\(kind).metadataCheckedAt"),
        genres: try requireOptionalStrings(o["genres"], "\(kind).genres")
    )
}

/// Field order matches backup.ts's object literal, so the *first* error is the same one.
private func parseSeries(_ value: JSONValue) throws -> SeriesRecord {
    guard let o = value.object else { throw DomainError("A series in the backup is not an object") }
    let mediaTypeRaw = try requireString(o["mediaType"], "series.mediaType")
    guard let mediaType = SeriesMediaType(rawValue: mediaTypeRaw) else { throw DomainError("Unknown series media type: \(mediaTypeRaw)") }
    let unitLabelRaw = try requireString(o["unitLabel"], "series.unitLabel")
    guard let unitLabel = UnitLabel(rawValue: unitLabelRaw) else { throw DomainError("Unknown unit label: \(unitLabelRaw)") }
    let createdAt = try requireString(o["createdAt"], "series.createdAt")
    try assertIsoTimestamp(createdAt, field: "series.createdAt")
    let id = try requireString(o["id"], "series.id")
    let title = try requireString(o["title"], "series.title")
    return SeriesRecord(
        id: id, title: title, mediaType: mediaType, unitLabel: unitLabel, createdAt: createdAt,
        ongoing: o["ongoing"] == .bool(true), paused: o["paused"] == .bool(true),
        externalSource: try requireNullableString(o["externalSource"], "series.externalSource"),
        externalId: try requireNullableString(o["externalId"], "series.externalId"),
        seasons: try requireOptionalSeasons(o["seasons"], "series.seasons"),
        metadata: try parseMetadata(o, "series")
    )
}

private func parseEntry(_ value: JSONValue, _ unitLabels: [String: UnitLabel]) throws -> EntryRecord {
    guard let o = value.object else { throw DomainError("An entry in the backup is not an object") }
    let id = try requireString(o["id"], "entry.id")
    let mediaTypeRaw = try requireString(o["mediaType"], "entry.mediaType")
    guard let mediaType = EntryMediaType(rawValue: mediaTypeRaw) else { throw DomainError("Unknown media type: \(mediaTypeRaw)") }
    let statusRaw = try requireString(o["status"], "entry.status")
    guard let status = Status(rawValue: statusRaw) else { throw DomainError("Unknown status: \(statusRaw)") }
    let seriesId = try requireNullableString(o["seriesId"], "entry.seriesId")
    if let seriesId, unitLabels[seriesId] == nil { throw DomainError("Entry \(id) refers to a missing series") }
    if !isStatusValid(mediaType, status: status, isSeriesChild: seriesId != nil) {
        throw DomainError("Status \(statusRaw) is not valid for a \(mediaTypeRaw)")
    }
    let ordinal: Double?
    switch o["ordinal"] {
    case nil, .null?: ordinal = nil
    case let .number(n)?: ordinal = n
    default: throw DomainError("Entry \(id) has a non-numeric ordinal")
    }
    let startedAt = try requireNullableString(o["startedAt"], "entry.startedAt")
    let finishedAt = try requireNullableString(o["finishedAt"], "entry.finishedAt")
    let createdAt = try requireString(o["createdAt"], "entry.createdAt")
    try assertEntryInvariants(EntryInvariants(
        label: "Entry \(id)", mediaType: mediaType, parentUnitLabel: seriesId.flatMap { unitLabels[$0] },
        ordinal: ordinal, createdAt: createdAt, startedAt: startedAt, finishedAt: finishedAt
    ))
    let title = try requireString(o["title"], "entry.title")
    return EntryRecord(
        id: id, seriesId: seriesId, title: title, ordinal: ordinal, mediaType: mediaType, status: status,
        startedAt: startedAt, finishedAt: finishedAt, createdAt: createdAt, paused: o["paused"] == .bool(true),
        externalSource: try requireNullableString(o["externalSource"], "entry.externalSource"),
        externalId: try requireNullableString(o["externalId"], "entry.externalId"),
        metadata: try parseMetadata(o, "entry")
    )
}

private func parseRating(_ value: JSONValue, exists: (TrackKind, String) -> Bool) throws -> RatingRecord {
    guard let o = value.object else { throw DomainError("A rating in the backup is not an object") }
    let kindRaw = try requireString(o["trackKind"], "rating.trackKind")
    guard let kind = TrackKind(rawValue: kindRaw) else { throw DomainError("Unknown rating track kind: \(kindRaw)") }
    let trackId = try requireString(o["trackId"], "rating.trackId")
    if !exists(kind, trackId) { throw DomainError("Rating for missing \(kindRaw) \(trackId)") }
    let categoryRaw = try requireString(o["category"], "rating.category")
    guard let category = Category(rawValue: categoryRaw) else { throw DomainError("Unknown rating category: \(categoryRaw)") }
    let sentimentRaw = try requireString(o["sentiment"], "rating.sentiment")
    guard let sentiment = Sentiment(rawValue: sentimentRaw) else { throw DomainError("Unknown rating sentiment: \(sentimentRaw)") }
    guard case let .number(position)? = o["position"], isSafeInteger(position) else {
        throw DomainError("Backup field rating.position must be a whole number")
    }
    let ratedAt = try requireString(o["ratedAt"], "rating.ratedAt")
    try assertIsoTimestamp(ratedAt, field: "rating.ratedAt")
    return RatingRecord(trackKind: kind, trackId: trackId, category: category, sentiment: sentiment, position: Int(position), ratedAt: ratedAt)
}

/// Replace the whole library with `json` — validated in full first, then
/// written atomically (a half-imported library reads as corruption).
public func importLibrary(_ db: Database, json: String) throws {
    guard let raw = try? JSONDecoder().decode(JSONValue.self, from: Data(json.utf8)) else {
        throw DomainError("Backup is not valid JSON")
    }
    guard let root = raw.object else { throw DomainError("Backup is not an object") }
    if root["version"] != .number(backupVersion) {
        throw DomainError("Unsupported backup version: \(root["version"]?.jsDescription ?? "undefined")")
    }
    guard case let .array(seriesValues)? = root["series"], case let .array(entryValues)? = root["entries"] else {
        throw DomainError("Backup is missing its series or entries list")
    }
    let series = try seriesValues.map(parseSeries)
    var unitLabels: [String: UnitLabel] = [:]
    for s in series { unitLabels[s.id] = s.unitLabel }
    if unitLabels.count != series.count { throw DomainError("Backup contains duplicate series ids") }
    let entries = try entryValues.map { try parseEntry($0, unitLabels) }
    let entryIds = Set(entries.map(\.id))
    if entryIds.count != entries.count { throw DomainError("Backup contains duplicate entry ids") }
    let ratingValues: [JSONValue]
    switch root["ratings"] {
    case nil: ratingValues = []
    case let .array(items)?: ratingValues = items
    default: throw DomainError("Backup ratings must be a list")
    }
    let ratings = try ratingValues.map { try parseRating($0) { kind, id in kind == .series ? unitLabels[id] != nil : entryIds.contains(id) } }
    if Set(ratings.map { "\($0.trackKind.rawValue):\($0.trackId)" }).count != ratings.count {
        throw DomainError("Backup rates the same track twice")
    }

    try atomically(db) {
    try db.execute(sql: "DELETE FROM rating")
    try db.execute(sql: "DELETE FROM entry")
    try db.execute(sql: "DELETE FROM series")
    for s in series {
        try db.execute(
            sql: """
            INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, paused, external_source, external_id, seasons_json, cover_url, creator, description, release_year, metadata_checked_at, genres_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: StatementArguments([s.id, s.title, s.mediaType.rawValue, s.unitLabel.rawValue, s.createdAt, s.ongoing ? 1 : 0,
                                           s.paused ? 1 : 0, s.externalSource, s.externalId, s.seasons.map(jsonText)] + s.metadata.params)
        )
    }
    for e in entries {
        try db.execute(
            sql: """
            INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at, paused, external_source, external_id, cover_url, creator, description, release_year, metadata_checked_at, genres_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: StatementArguments([e.id, e.seriesId, e.title, e.ordinal.map { Int($0) }, e.mediaType.rawValue, e.status.rawValue,
                                           e.startedAt, e.finishedAt, e.createdAt, e.paused ? 1 : 0, e.externalSource, e.externalId]
                                          + e.metadata.params)
        )
    }
    for r in ratings {
        try db.execute(
            sql: "INSERT INTO rating (track_kind, track_id, category, sentiment, position, rated_at) VALUES (?, ?, ?, ?, ?, ?)",
            arguments: [r.trackKind.rawValue, r.trackId, r.category.rawValue, r.sentiment.rawValue, r.position, r.ratedAt]
        )
    }
    }
}
