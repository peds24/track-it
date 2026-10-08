import Foundation
import GRDB

/// A library with every row state the shelves draw (I7): UI tests and
/// screenshots launch on it with `-IrisSeed demo`. Fixed timestamps, so it is
/// the same library every time, and only repository calls, so it goes through
/// the app's own code paths.
public func seedDemoLibrary(_ library: Library) throws {
    var minute = 0
    func now() -> String {
        minute += 1
        return toISOString(Date(timeIntervalSince1970: 1_790_000_000 + Double(minute) * 60))
    }
    /// Advance until `done` units are finished (a read-mode unit takes two steps).
    func advanceSeries(_ db: Database, _ id: String, done target: Int) throws {
        // Counted in SQL: an ongoing series has no progress total to read (A4).
        func finished() throws -> Int {
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM entry WHERE series_id = ? AND status = 'done'", arguments: [id]) ?? 0
        }
        var steps = 0
        while try finished() < target {
            steps += 1
            guard steps <= target * 2 + 2 else { throw DomainError("Demo seed: series \(id) stuck below \(target) done") }
            try advanceEntry(db, entryId: try nextEntryToAdvance(db, id), now: now())
        }
    }
    func units(_ label: String, _ count: Int) -> [EntryDraft] { (1...count).map { EntryDraft(ordinal: $0, title: "\(label) \($0)") } }

    try library.write { db in
        // Done
        let hailMary = try createStandaloneTrack(db, StandaloneInput(title: "Project Hail Mary", category: .book), now: now())
        let first = try firstEntryOf(db, TrackRef(kind: .entry, id: hailMary)).id
        try advanceEntry(db, entryId: first, now: now())
        try advanceEntry(db, entryId: first, now: now())
        try saveRating(db, RatableTrack(kind: .entry, id: hailMary, category: .book), sentiment: .liked, indexInBucket: 0, now: now())
        let interstellar = try createStandaloneTrack(db, StandaloneInput(title: "Interstellar", category: .movie), now: now())
        try advanceEntry(db, entryId: try firstEntryOf(db, TrackRef(kind: .entry, id: interstellar)).id, now: now())

        // Backlog
        _ = try createStandaloneTrack(db, StandaloneInput(title: "The Lord of the Rings: The Fellowship of the Ring (Extended Edition)", category: .movie), now: now())
        let onePiece = try createSeriesTrack(db, SeriesDraft(title: "One Piece", mediaType: .manga, unitLabel: .volume, entries: units("Volume", 108)), now: now())
        try advanceSeries(db, onePiece, done: 30)
        try returnTrackToBacklog(db, TrackRef(kind: .series, id: onePiece))
        _ = try createStandaloneTrack(db, StandaloneInput(title: "Arrival", category: .movie), now: now())

        // Currently
        let saga = try createSeriesTrack(db, SeriesDraft(title: "Saga", mediaType: .comic, unitLabel: .issue, entries: units("Issue", 3), ongoing: true), now: now())
        try advanceSeries(db, saga, done: 3)
        let dune = try createStandaloneTrack(db, StandaloneInput(title: "Dune", category: .book), now: now())
        try advanceEntry(db, entryId: try firstEntryOf(db, TrackRef(kind: .entry, id: dune)).id, now: now())
        let severance = try createSeriesTrack(db, SeriesDraft(
            title: "Severance", mediaType: .show, unitLabel: .episode, entries: units("Episode", 19),
            seasons: [SeasonBoundary(number: 1, episodeCount: 9), SeasonBoundary(number: 2, episodeCount: 10)]
        ), now: now())
        try advanceSeries(db, severance, done: 13)
    }
}

/// The series' next entry to advance, or a DomainError.
private func nextEntryToAdvance(_ db: Database, _ seriesId: String) throws -> String {
    guard let id = try getTrackDetail(db, kind: .series, id: seriesId)?.summary.nextEntryId else {
        throw DomainError("Series \(seriesId) has nothing to advance")
    }
    return id
}
