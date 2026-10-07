import Foundation
import GRDB

/// Port of src/data/ratingRepo.ts (A26).

public struct RatableTrack: Codable, Hashable, Sendable {
    public var kind: TrackKind
    public var id: String
    public var category: Category
    public init(kind: TrackKind, id: String, category: Category) { self.kind = kind; self.id = id; self.category = category }
    public var ref: TrackRef { TrackRef(kind: kind, id: id) }
}

/// One row of a category's ranking, joined to what the screens show.
public struct RankedTrack: Codable, Equatable, Sendable {
    public var key: String
    public var kind: TrackKind
    public var id: String
    public var title: String
    public var coverUrl: String?
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?
    public var sentiment: Sentiment
    public var score: Double
    /// 1-based.
    public var rank: Int
}

/// `kind:id` — the key the domain layer ranks by.
public func ratingKey(_ track: TrackRef) -> String { "\(track.kind.rawValue):\(track.id)" }

private func parseGenres(_ json: String?) -> [String] {
    guard let json, let data = json.data(using: .utf8),
          case let .array(items)? = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
    return items.compactMap(\.string)
}

/// A category's ranking, best first, with each track's derived score; a row
/// whose track no longer exists is left out.
public func listRanking(_ db: Database, category: Category) throws -> [RankedTrack] {
    let rows = try Row.fetchAll(db, sql: """
        SELECT r.track_kind, r.track_id, r.sentiment,
               COALESCE(s.title, e.title) AS title,
               COALESCE(s.cover_url, e.cover_url) AS cover_url,
               COALESCE(s.creator, e.creator) AS creator,
               COALESCE(s.genres_json, e.genres_json) AS genres_json,
               COALESCE(s.release_year, e.release_year) AS release_year
        FROM rating r
        LEFT JOIN series s ON r.track_kind = 'series' AND s.id = r.track_id
        LEFT JOIN entry e ON r.track_kind = 'entry' AND e.id = r.track_id
        WHERE r.category = ?
        ORDER BY r.position ASC, r.rated_at ASC
        """, arguments: [category.rawValue]).filter { ($0["title"] as String?) != nil }
    let items = rows.map {
        KeyedSentiment(key: ratingKey(TrackRef(kind: TrackKind(rawValue: $0["track_kind"])!, id: $0["track_id"])),
                       sentiment: Sentiment(rawValue: $0["sentiment"])!)
    }
    let scores = Dictionary(scoresFor(items).map { ($0.key, $0.score) }, uniquingKeysWith: { _, last in last })
    return rows.enumerated().map { i, row in
        RankedTrack(
            key: items[i].key, kind: TrackKind(rawValue: row["track_kind"])!, id: row["track_id"], title: row["title"],
            coverUrl: sharpCoverUrl(row["cover_url"]), creator: row["creator"], genres: parseGenres(row["genres_json"]),
            releaseYear: row["release_year"], sentiment: items[i].sentiment, score: scores[items[i].key]!, rank: i + 1
        )
    }
}

public func ratingProfileOf(_ db: Database, _ track: TrackRef) throws -> RatingProfile? {
    let table = track.kind == .series ? "series" : "entry"
    guard let row = try Row.fetchOne(db, sql: "SELECT creator, genres_json, release_year FROM \(table) WHERE id = ?", arguments: [track.id]) else {
        return nil
    }
    return RatingProfile(key: ratingKey(track), creator: row["creator"], genres: parseGenres(row["genres_json"]), releaseYear: row["release_year"])
}

public func getRating(_ db: Database, _ track: TrackRef) throws -> RatingSummary? {
    guard let raw = try String.fetchOne(db, sql: "SELECT category FROM rating WHERE track_kind = ? AND track_id = ?",
                                        arguments: [track.kind.rawValue, track.id]),
          let category = Category(rawValue: raw) else { return nil }
    let ranking = try listRanking(db, category: category)
    guard let mine = ranking.first(where: { $0.key == ratingKey(track) }) else { return nil }
    return RatingSummary(sentiment: mine.sentiment, score: mine.score, rank: mine.rank, outOf: ranking.count, category: category)
}

/// Every rated track's score keyed by `kind:id`, in category-then-rank order (a Map in TS).
public func allScores(_ db: Database) throws -> [(key: String, score: Double)] {
    var order: [String] = []
    var scores: [String: Double] = [:]
    for raw in try String.fetchAll(db, sql: "SELECT DISTINCT category FROM rating") {
        guard let category = Category(rawValue: raw) else { continue }
        for ranked in try listRanking(db, category: category) {
            if scores[ranked.key] == nil { order.append(ranked.key) }
            scores[ranked.key] = ranked.score
        }
    }
    return order.map { ($0, scores[$0]!) }
}

/// Place `track` at `indexInBucket` within its sentiment and rewrite the
/// category's order (the caller's write makes it one transaction).
public func saveRating(_ db: Database, _ track: RatableTrack, sentiment: Sentiment, indexInBucket: Int, now: String) throws {
    try assertIsoTimestamp(now, field: "rating ratedAt")
    let key = ratingKey(track.ref)
    let current = try listRanking(db, category: track.category).filter { $0.key != key }
    let order = placeInRanking(current.map { KeyedSentiment(key: $0.key, sentiment: $0.sentiment) }, key: key, sentiment: sentiment, indexInBucket: indexInBucket)
    var refs: [String: TrackRef] = [key: track.ref]
    for r in current { refs[r.key] = TrackRef(kind: r.kind, id: r.id) }

    try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
    try db.execute(
        sql: "INSERT INTO rating (track_kind, track_id, category, sentiment, position, rated_at) VALUES (?, ?, ?, ?, 0, ?)",
        arguments: [track.kind.rawValue, track.id, track.category.rawValue, sentiment.rawValue, now]
    )
    for (position, item) in order.enumerated() {
        let ref = refs[item.key]!
        try db.execute(sql: "UPDATE rating SET position = ? WHERE track_kind = ? AND track_id = ?",
                       arguments: [position, ref.kind.rawValue, ref.id])
    }
}

public func removeRating(_ db: Database, _ track: TrackRef) throws {
    try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
}
