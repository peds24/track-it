import Foundation
import GRDB

/// A finished track's score and the sentiment bucket it sits in (A26).
public struct RowRating: Equatable, Sendable {
    public let score: Double
    public let sentiment: Sentiment
    public init(score: Double, sentiment: Sentiment) { self.score = score; self.sentiment = sentiment }
}

/// One track as its detail screen shows it (I8): the detail and, once rated, its rating.
public struct TrackPage: Equatable, Sendable {
    public let detail: TrackDetail
    public let rating: RatingSummary?
    public init(detail: TrackDetail, rating: RatingSummary?) { self.detail = detail; self.rating = rating }
}

/// Everything the Rate screen needs to start (I10, A26).
public struct RateContext: Equatable, Sendable {
    public let detail: TrackDetail
    public let profile: RatingProfile
    /// The category's ranking, best first.
    public let ranking: [RankedTrack]
    public let existing: RatingSummary?

    public init(detail: TrackDetail, profile: RatingProfile, ranking: [RankedTrack], existing: RatingSummary?) {
        self.detail = detail; self.profile = profile; self.ranking = ranking; self.existing = existing
    }
}

/// The app's one door to the library (I7). It wraps the GRDB queue, so the app
/// target never imports GRDB. Every write is one repository call, as in TS.
/// A `DatabaseQueue`, not a pool: one user, one writer, a small library.
public final class Library: Sendable {
    let queue: DatabaseQueue

    init(queue: DatabaseQueue) { self.queue = queue }

    /// The library at `url`, created (with its directory) and migrated if new.
    public static func open(at url: URL) throws -> Library {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        return Library(queue: try openLibrary(at: url.path))
    }

    /// An empty, migrated library in memory: tests, previews, the demo seed.
    public static func inMemory() throws -> Library {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        return Library(queue: queue)
    }

    /// The shelf now, then again after every change that touches it.
    public func tracks(shelf: Shelf, category: Category?) -> AsyncStream<Result<[TrackSummary], Error>> {
        let observation = ValueObservation.tracking { db in try listTracks(db, shelf: shelf, category: category) }
        return stream(observation)
    }

    /// Every rated track's score and sentiment, keyed by `ratingKey`.
    public func scores() -> AsyncStream<[String: RowRating]> {
        let observation = ValueObservation.tracking { db -> [String: RowRating] in
            var sentiments: [String: Sentiment] = [:]
            for row in try Row.fetchAll(db, sql: "SELECT track_kind, track_id, sentiment FROM rating") {
                let kind: String = row["track_kind"], id: String = row["track_id"]
                sentiments["\(kind):\(id)"] = Sentiment(rawValue: row["sentiment"])
            }
            var out: [String: RowRating] = [:]
            for (key, score) in try allScores(db) { out[key] = RowRating(score: score, sentiment: sentiments[key] ?? .fine) }
            return out
        }
        let results = stream(observation)
        return AsyncStream { continuation in
            let task = Task {
                for await result in results { if case let .success(value) = result { continuation.yield(value) } }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// One track now, then again after any change to it; nil once it no longer exists (I8).
    public func detail(_ ref: TrackRef) -> AsyncStream<Result<TrackPage?, Error>> {
        let observation = ValueObservation.tracking { db -> TrackPage? in
            guard let detail = try getTrackDetail(db, kind: ref.kind, id: ref.id) else { return nil }
            return TrackPage(detail: detail, rating: try getRating(db, ref))
        }
        return stream(observation)
    }

    /// nil when the track (or its rating profile) no longer exists.
    public func rateContext(_ ref: TrackRef) async throws -> RateContext? {
        try await queue.read { db in
            guard let detail = try getTrackDetail(db, kind: ref.kind, id: ref.id),
                  let profile = try ratingProfileOf(db, ref) else { return nil }
            return RateContext(detail: detail, profile: profile,
                               ranking: try listRanking(db, category: detail.summary.category),
                               existing: try getRating(db, ref))
        }
    }

    /// A26: place `track` at `indexInBucket` within `sentiment`; returns where it landed.
    public func saveRating(_ track: RatableTrack, sentiment: Sentiment, indexInBucket: Int, now: Date) async throws -> RatingSummary {
        try await queue.write { db in
            try IrisCore.saveRating(db, track, sentiment: sentiment, indexInBucket: indexInBucket, now: toISOString(now))
            guard let summary = try getRating(db, track.ref) else { throw DomainError("Rating for \(track.id) was not saved") }
            return summary
        }
    }

    /// A category's ranking now, then after every change to it.
    public func rankings(category: Category) -> AsyncStream<Result<[RankedTrack], Error>> {
        stream(ValueObservation.tracking { db in try listRanking(db, category: category) })
    }

    /// offerRatingIfFinished's test: Done and not yet rated. Never throws.
    public func finishedUnrated(_ ref: TrackRef) async -> Bool {
        (try? await queue.read { db in
            try getTrackDetail(db, kind: ref.kind, id: ref.id)?.summary.shelf == .done && getRating(db, ref) == nil
        }) ?? false
    }

    /// A12: put a series at `ordinal` (the unit you are on).
    public func setPosition(seriesId: String, ordinal: Int, now: Date) async throws {
        try await queue.write { try setTrackPosition($0, seriesId: seriesId, targetOrdinal: ordinal, now: toISOString(now)) }
    }

    /// A25 after a series moves (advance or set position): never throws, never blocks the move.
    public func syncAfterMove(seriesId: String, registry: ProviderRegistry?) async -> Bool {
        guard let registry else { return false }
        return await syncSeriesUnit(queue, seriesId: seriesId) { source, category in
            registry.provider(forSource: source, category: category)
        }
    }

    /// I9: add a track, then (startNow) advance its first entry unless it is
    /// already in progress — the Add screen's handleSave order. `hydrate` is the
    /// catalogue's, for a series with no confirmed draft.
    public func add(
        _ input: AddTrackInput, startNow: Bool, now: Date,
        hydrate: @Sendable (SearchResult) async throws -> SeriesDraft
    ) async throws -> TrackRef {
        let stamp = toISOString(now)
        let ref = try await addTrack(queue, input, now: stamp, hydrate: hydrate)
        if startNow {
            try await queue.write { db in
                let first = try firstEntryOf(db, ref)
                if first.status != .inProgress { try advanceEntry(db, entryId: first.id, now: stamp) }
            }
        }
        return ref
    }

    public func advance(entryId: String, now: Date) async throws {
        try await queue.write { try advanceEntry($0, entryId: entryId, now: toISOString(now)) }
    }

    public func resume(_ track: TrackRef) async throws { try await queue.write { try resumeTrack($0, track) } }

    public func returnToBacklog(_ track: TrackRef) async throws { try await queue.write { try returnTrackToBacklog($0, track) } }

    public func complete(_ track: TrackRef, now: Date) async throws {
        try await queue.write { try completeTrack($0, track, now: toISOString(now)) }
    }

    public func delete(_ track: TrackRef) async throws { try await queue.write { try deleteTrack($0, track) } }

    /// A15 rename. U+0000 is dropped (GRDB would cut the string there) and a
    /// blank title is ignored, as TrackRow's commitRename does.
    public func rename(_ track: TrackRef, title: String) async throws {
        let clean = title.replacingOccurrences(of: "\u{0}", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        try await queue.write { try renameTrack($0, track, title: clean) }
    }

    /// A25 after an advance: never throws, never holds up the advance.
    public func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool {
        guard let registry else { return false }
        return await syncUnitForEntry(queue, entryId: entryId) { source, category in
            registry.provider(forSource: source, category: category)
        }
    }

    // MARK: Internal (tests, seed)

    func write<T: Sendable>(_ body: (Database) throws -> T) throws -> T { try queue.write(body) }

    func snapshot(shelf: Shelf) throws -> [TrackSummary] { try queue.read { try listTracks($0, shelf: shelf) } }

    func firstEntryId(of track: TrackRef) async throws -> String { try await queue.read { try firstEntryOf($0, track).id } }

    private func stream<T: Sendable>(_ observation: ValueObservation<ValueReducers.Fetch<T>>) -> AsyncStream<Result<T, Error>> {
        let queue = queue
        return AsyncStream { continuation in
            let task = Task {
                do {
                    for try await value in observation.values(in: queue) { continuation.yield(.success(value)) }
                } catch is CancellationError {
                } catch {
                    continuation.yield(.failure(error))
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
