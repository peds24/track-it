import Foundation
import GRDB

/// Port of src/data/trackRepo.ts. Callers wrap a call in `writer.write { db in … }`;
/// every multi-statement write is also `atomically`, as TS opens its own transaction.

public enum TrackKind: String, Codable, Sendable { case series, entry }

public struct TrackRef: Codable, Hashable, Sendable {
    public var kind: TrackKind
    public var id: String
    public init(kind: TrackKind, id: String) { self.kind = kind; self.id = id }
}

public struct TrackSummary: Codable, Equatable, Sendable {
    public var kind: TrackKind
    public var id: String
    public var title: String
    public var category: Category
    public var shelf: Shelf
    public var createdAt: String
    public var progress: Progress?
    /// A4: still being published — no total, no bar, never reaches Done.
    public var ongoing: Bool
    /// A6: in Backlog with progress intact.
    public var paused: Bool
    /// A11: TMDB only.
    public var seasons: [SeasonBoundary]?
    public var nextEntryStatus: Status?
    public var nextEntryId: String?
    public var nextEntryTitle: String?
    /// When this track last moved forward (D3: derived, never stored).
    public var lastAdvancedAt: String?
    /// A23: the unit completing this track would remove, if any.
    public var completionDrops: String?
}

public struct TrackDetail: Codable, Equatable, Sendable {
    public var summary: TrackSummary
    public var metadata: TrackMetadata
    public var timeline: Timeline
    /// nil for a standalone track.
    public var unitLabel: UnitLabel?
}

public struct FirstEntry: Codable, Equatable, Sendable {
    public var id: String
    public var status: Status
}

public struct StandaloneInput: Codable, Equatable, Sendable {
    public var title: String
    public var category: Category
    public var externalSource: String?
    public var externalId: String?
    public var metadata: TrackMetadata?
    public init(title: String, category: Category, externalSource: String? = nil, externalId: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.category = category; self.externalSource = externalSource
        self.externalId = externalId; self.metadata = metadata
    }
}

/// Matches the titles generateEntries produces, so both paths read alike.
public func unitTitle(_ label: UnitLabel) -> String {
    switch label {
    case .episode: "Episode"
    case .issue: "Issue"
    case .volume: "Volume"
    }
}

/// Same shape as the TS ids: base-36 milliseconds, a dash, 8 random base-36 digits.
func newId() -> String {
    let digits = Array("0123456789abcdefghijklmnopqrstuvwxyz")
    let millis = Int64(Date().timeIntervalSince1970 * 1000)
    return String(millis, radix: 36) + "-" + String((0..<8).map { _ in digits.randomElement()! })
}

// MARK: Rows

/// CHECK constraints guarantee the enum columns, so the force-unwraps can't fire.
func toEntry(_ row: Row) -> Entry {
    Entry(
        id: row["id"], seriesId: row["series_id"], title: row["title"], ordinal: row["ordinal"],
        mediaType: EntryMediaType(rawValue: row["media_type"])!, status: Status(rawValue: row["status"])!,
        startedAt: row["started_at"], finishedAt: row["finished_at"], createdAt: row["created_at"],
        paused: (row["paused"] as Int? ?? 0) == 1, externalSource: row["external_source"], externalId: row["external_id"]
    )
}

private func metadataOf(_ row: Row) -> TrackMetadata {
    TrackMetadata(
        coverUrl: sharpCoverUrl(row["cover_url"]), creator: row["creator"],
        description: row["description"], releaseYear: row["release_year"]
    )
}

/// '[]' once a catalogue answered, NULL while it never has (A26).
private func genresColumn(_ metadata: TrackMetadata?) -> String? {
    metadata.map { jsonText($0.genres ?? []) }
}

private func metadataColumns(_ metadata: TrackMetadata?, now: String) -> [(any DatabaseValueConvertible)?] {
    [metadata?.coverUrl, metadata?.creator, metadata?.description, metadata?.releaseYear,
     metadata == nil ? nil : now, genresColumn(metadata)]
}

private func seasonsOf(_ row: Row) -> [SeasonBoundary]? {
    guard let json: String = row["seasons_json"], let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode([SeasonBoundary].self, from: data)
}

// MARK: Create

public func createSeriesTrack(_ db: Database, _ draft: SeriesDraft, now: String, startAtOrdinal: Int? = nil) throws -> String {
    let seriesId = newId()
    let validStart: Double? = startAtOrdinal.flatMap {
        $0 >= 1 && (draft.ongoing == true || $0 <= draft.entries.count) ? Double($0) : nil
    }
    // A4/A10: an ongoing series' lone bootstrap entry is renumbered to the parsed ordinal.
    let entries = draft.ongoing == true && validStart != nil
        ? [EntryDraft(ordinal: Int(validStart!), title: "\(unitTitle(draft.unitLabel)) \(Int(validStart!))")]
        : draft.entries

    // Invariants first: a rejected draft never touches the database.
    try assertIsoTimestamp(now, field: "series createdAt")
    for entry in entries {
        try assertEntryInvariants(EntryInvariants(
            label: "Entry \"\(entry.title)\"", mediaType: EntryMediaType(rawValue: draft.unitLabel.rawValue)!,
            parentUnitLabel: draft.unitLabel, ordinal: entry.ordinal, createdAt: now
        ))
    }

    try atomically(db) {
    try db.execute(
        sql: """
        INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, external_source, external_id, seasons_json,
                            cover_url, creator, description, release_year, metadata_checked_at, genres_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        arguments: StatementArguments([
            seriesId, draft.title, draft.mediaType.rawValue, draft.unitLabel.rawValue, now,
            draft.ongoing == true ? 1 : 0, draft.externalSource, draft.externalId, draft.seasons.map(jsonText),
        ] + metadataColumns(draft.metadata, now: now))
    )
    for entry in entries {
        // A11: starting at N means 1…N-1 already happened.
        let status: Status = validStart.map { entry.ordinal < $0 ? .done : entry.ordinal == $0 ? .inProgress : .unstarted } ?? .unstarted
        try db.execute(
            sql: """
            INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: [newId(), seriesId, entry.title, Int(entry.ordinal), draft.unitLabel.rawValue, status.rawValue,
                        status != .unstarted ? now : nil, status == .done ? now : nil, now]
        )
    }
    }
    return seriesId
}

public func createStandaloneTrack(_ db: Database, _ input: StandaloneInput, now: String) throws -> String {
    let id = newId()
    // TS casts the category; a non-standalone one fails the same invariant with the same message.
    guard isStandaloneMediaType(input.category.rawValue), let mediaType = EntryMediaType(rawValue: input.category.rawValue) else {
        throw DomainError("Entry \"\(input.title)\" has no parent series, so its media type must be book or movie, got: \(input.category.rawValue)")
    }
    try assertEntryInvariants(EntryInvariants(label: "Entry \"\(input.title)\"", mediaType: mediaType, parentUnitLabel: nil, createdAt: now))
    try db.execute(
        sql: """
        INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id,
                           cover_url, creator, description, release_year, metadata_checked_at, genres_json)
        VALUES (?, NULL, ?, NULL, ?, 'unstarted', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        arguments: StatementArguments([id, input.title, mediaType.rawValue, now, input.externalSource, input.externalId]
            + metadataColumns(input.metadata, now: now))
    )
    return id
}

public func firstEntryOf(_ db: Database, _ track: TrackRef) throws -> FirstEntry {
    if track.kind == .entry {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [track.id]) else {
            throw DomainError("Entry \(track.id) not found")
        }
        return FirstEntry(id: row["id"], status: Status(rawValue: row["status"])!)
    }
    let rows = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ? ORDER BY ordinal ASC", arguments: [track.id])
    if rows.isEmpty { throw DomainError("Series \(track.id) has no entries") }
    let target = rows.first { $0["status"] == "in_progress" } ?? rows[0]
    return FirstEntry(id: target["id"], status: Status(rawValue: target["status"])!)
}

// MARK: Read

/// The later of an entry's two timestamps (ISO strings sort chronologically).
private func lastAdvanceOf(_ e: Entry) -> String? {
    guard let started = e.startedAt else { return e.finishedAt }
    guard let finished = e.finishedAt else { return started }
    return finished >= started ? finished : started
}

private func lastAdvanceAcross(_ children: [Entry]) -> String? {
    children.compactMap(lastAdvanceOf).max()
}

private func buildSummaries(_ seriesRows: [Row], _ entries: [Entry]) -> [TrackSummary] {
    var summaries: [TrackSummary] = []
    for row in seriesRows {
        let id: String = row["id"]
        let children = entries.filter { $0.seriesId == id }
        let next = nextEntry(children)
        let ongoing = (row["ongoing"] as Int? ?? 0) == 1
        let paused = (row["paused"] as Int? ?? 0) == 1
        summaries.append(TrackSummary(
            kind: .series, id: id, title: row["title"], category: Category(rawValue: row["media_type"])!,
            shelf: shelfForSeries(children, paused: paused), createdAt: row["created_at"],
            progress: ongoing ? nil : progressFor(children), ongoing: ongoing, paused: paused, seasons: seasonsOf(row),
            nextEntryStatus: next?.status, nextEntryId: next?.id, nextEntryTitle: next?.title,
            lastAdvancedAt: lastAdvanceAcross(children),
            completionDrops: ongoingPlaceholder(children, ongoing: ongoing)?.title
        ))
    }
    for entry in entries where entry.seriesId == nil {
        // An older build's row outside the standalone union is left out, not mis-filed.
        guard isStandaloneMediaType(entry.mediaType.rawValue), let category = Category(rawValue: entry.mediaType.rawValue) else { continue }
        let advanceable = entry.status != .done
        summaries.append(TrackSummary(
            kind: .entry, id: entry.id, title: entry.title, category: category, shelf: shelfForEntry(entry),
            createdAt: entry.createdAt, progress: nil, ongoing: false, paused: entry.paused, seasons: nil,
            nextEntryStatus: advanceable ? entry.status : nil, nextEntryId: advanceable ? entry.id : nil,
            nextEntryTitle: advanceable ? entry.title : nil, lastAdvancedAt: lastAdvanceOf(entry), completionDrops: nil
        ))
    }
    return summaries
}

/// D9 (newest first) or D12 (most recently advanced first); ties keep input
/// order, as JS's stable sort does (Review Focus 4).
private func sortedForShelf(_ tracks: [TrackSummary], _ shelf: Shelf) -> [TrackSummary] {
    func byDateAdded(_ a: TrackSummary, _ b: TrackSummary) -> Int { a.createdAt == b.createdAt ? 0 : (b.createdAt < a.createdAt ? -1 : 1) }
    func byMostRecentlyAdvanced(_ a: TrackSummary, _ b: TrackSummary) -> Int {
        switch (a.lastAdvancedAt, b.lastAdvancedAt) {
        case (nil, .some): return 1
        case (.some, nil): return -1
        case let (.some(x), .some(y)) where x != y: return y < x ? -1 : 1
        default: return byDateAdded(a, b)
        }
    }
    let compare = shelf == .currently ? byMostRecentlyAdvanced : byDateAdded
    return tracks.enumerated()
        .sorted { let c = compare($0.element, $1.element); return c != 0 ? c < 0 : $0.offset < $1.offset }
        .map(\.element)
}

/// Shelf is computed in the domain, never queried for (D3).
public func listTracks(_ db: Database, shelf: Shelf, category: Category? = nil) throws -> [TrackSummary] {
    let seriesRows = try Row.fetchAll(db, sql: "SELECT * FROM series")
    let entries = try Row.fetchAll(db, sql: "SELECT * FROM entry").map(toEntry)
    let matching = buildSummaries(seriesRows, entries).filter { $0.shelf == shelf && (category == nil || $0.category == category) }
    return sortedForShelf(matching, shelf)
}

public func getTrackDetail(_ db: Database, kind: TrackKind, id: String) throws -> TrackDetail? {
    if kind == .series {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [id]) else { return nil }
        let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [id]).map(toEntry)
        return TrackDetail(
            summary: buildSummaries([row], children)[0], metadata: metadataOf(row),
            timeline: timelineOf(addedAt: row["created_at"], units: children.map(\.times)), unitLabel: UnitLabel(rawValue: row["unit_label"])
        )
    }
    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ? AND series_id IS NULL", arguments: [id]) else { return nil }
    let entry = toEntry(row)
    guard let summary = buildSummaries([], [entry]).first else { return nil }
    return TrackDetail(summary: summary, metadata: metadataOf(row), timeline: timelineOf(addedAt: entry.createdAt, units: [entry.times]), unitLabel: nil)
}

// MARK: Advance

/// Transition rules live in the domain; this persists them (D8), then A4/A5.
public func advanceEntry(_ db: Database, entryId: String, now: String) throws {
    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [entryId]) else {
        throw DomainError("Entry \(entryId) not found")
    }
    let updated = try advance(toEntry(row), now: now)
    try atomically(db) {
        try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                       arguments: [updated.status.rawValue, updated.startedAt, updated.finishedAt, updated.id])
        if updated.status == .done {
            try appendNextOngoingEntry(db, finished: updated, now: now)
            try startNextInSeries(db, finished: updated, now: now)
        }
    }
}

/// A4: finishing an ongoing series' last entry appends the next one.
private func appendNextOngoingEntry(_ db: Database, finished: Entry, now: String) throws {
    guard let seriesId = finished.seriesId,
          let series = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]),
          (series["ongoing"] as Int? ?? 0) == 1 else { return }
    let ordinals = try Int?.fetchAll(db, sql: "SELECT ordinal FROM entry WHERE series_id = ?", arguments: [seriesId])
    let highest = ordinals.reduce(0) { max($0, $1 ?? 0) }
    if (finished.ordinal ?? 0) < highest { return }
    let ordinal = highest + 1
    let unitLabel: String = series["unit_label"]
    try db.execute(
        sql: "INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES (?, ?, ?, ?, ?, 'unstarted', ?)",
        arguments: [newId(), seriesId, "\(unitTitle(UnitLabel(rawValue: unitLabel)!)) \(ordinal)", ordinal, unitLabel, now]
    )
}

/// A5/A10: the next unit starts the moment the previous one is finished.
private func startNextInSeries(_ db: Database, finished: Entry, now: String) throws {
    guard let seriesId = finished.seriesId else { return }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
    guard let next = nextEntry(children), next.status == .unstarted else { return }
    try db.execute(sql: "UPDATE entry SET status = 'in_progress', started_at = ? WHERE id = ?", arguments: [now, next.id])
}

// MARK: Track actions

private func table(_ kind: TrackKind) -> String { kind == .series ? "series" : "entry" }

public func deleteTrack(_ db: Database, _ track: TrackRef) throws {
    try atomically(db) {
        try db.execute(sql: "DELETE FROM \(table(track.kind)) WHERE id = ?", arguments: [track.id])
        // A26: a rating points at a series or an entry, so no cascade reaches it.
        try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
    }
}

public func renameTrack(_ db: Database, _ track: TrackRef, title: String) throws {
    let trimmed = jsTrim(title)
    if trimmed.isEmpty { throw DomainError("A track needs a title") }
    try db.execute(sql: "UPDATE \(table(track.kind)) SET title = ? WHERE id = ?", arguments: [trimmed, track.id])
}

/// A6: pause a track with something left; reset one that is fully finished (D4).
public func returnTrackToBacklog(_ db: Database, _ track: TrackRef) throws {
    if track.kind == .series {
        let statuses = try String.fetchAll(db, sql: "SELECT status FROM entry WHERE series_id = ?", arguments: [track.id])
        if !statuses.isEmpty && statuses.allSatisfy({ $0 == "done" }) {
            try atomically(db) {
                try db.execute(sql: "UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL WHERE series_id = ?", arguments: [track.id])
                try db.execute(sql: "UPDATE series SET paused = 0 WHERE id = ?", arguments: [track.id])
            }
        } else {
            try db.execute(sql: "UPDATE series SET paused = 1 WHERE id = ?", arguments: [track.id])
        }
        return
    }
    guard let status = try String.fetchOne(db, sql: "SELECT status FROM entry WHERE id = ?", arguments: [track.id]) else { return }
    if status == "done" {
        try db.execute(sql: "UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL, paused = 0 WHERE id = ?", arguments: [track.id])
    } else {
        try db.execute(sql: "UPDATE entry SET paused = 1 WHERE id = ?", arguments: [track.id])
    }
}

public func resumeTrack(_ db: Database, _ track: TrackRef) throws {
    try db.execute(sql: "UPDATE \(table(track.kind)) SET paused = 0 WHERE id = ?", arguments: [track.id])
}

/// A12: put a series at a position directly; naming where you are resumes it.
public func setTrackPosition(_ db: Database, seriesId: String, targetOrdinal: Int, now: String) throws {
    guard try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]) != nil else {
        throw DomainError("Series \(seriesId) not found")
    }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
    let changed = try setPosition(children, targetOrdinal: targetOrdinal, now: now)
    try atomically(db) {
        for e in changed {
            try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                           arguments: [e.status.rawValue, e.startedAt, e.finishedAt, e.id])
        }
        try db.execute(sql: "UPDATE series SET paused = 0 WHERE id = ?", arguments: [seriesId])
    }
}

/// A23: finish a track by hand — the only way an ongoing series reaches Done.
public func completeTrack(_ db: Database, _ track: TrackRef, now: String) throws {
    func write(_ e: Entry) throws {
        try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                       arguments: [e.status.rawValue, e.startedAt, e.finishedAt, e.id])
    }
    if track.kind == .entry {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [track.id]) else {
            throw DomainError("Entry \(track.id) not found")
        }
        try atomically(db) {
            for e in completeUnits([toEntry(row)], ongoing: false, now: now).updated { try write(e) }
            try db.execute(sql: "UPDATE entry SET paused = 0 WHERE id = ?", arguments: [track.id])
        }
        return
    }
    guard let series = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [track.id]) else {
        throw DomainError("Series \(track.id) not found")
    }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [track.id]).map(toEntry)
    let result = completeUnits(children, ongoing: (series["ongoing"] as Int? ?? 0) == 1, now: now)
    try atomically(db) {
        for e in result.updated { try write(e) }
        for id in result.removedIds { try db.execute(sql: "DELETE FROM entry WHERE id = ?", arguments: [id]) }
        try db.execute(sql: "UPDATE series SET ongoing = 0, paused = 0 WHERE id = ?", arguments: [track.id])
    }
}
