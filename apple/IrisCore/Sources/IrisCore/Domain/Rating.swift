import Foundation

/// Port of src/domain/rating.ts (A26): Beli-style ratings, per category.

/// Best first — the order the buckets sit in within a ranking.
public enum Sentiment: String, Codable, Sendable, CaseIterable { case liked, fine, disliked }

/// Each sentiment owns a third of the 1–10 scale.
func scoreBand(_ s: Sentiment) -> (lo: Double, hi: Double) {
    switch s {
    case .liked: (7, 10)
    case .fine: (4, 7)
    case .disliked: (1, 4)
    }
}

/// What the matchup picker knows about a track.
public struct RatingProfile: Codable, Equatable, Sendable {
    public var key: String
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?

    public init(key: String, creator: String? = nil, genres: [String] = [], releaseYear: String? = nil) {
        self.key = key; self.creator = creator; self.genres = genres; self.releaseYear = releaseYear
    }
}

/// One rated track, in a category's best-first order.
public struct RankedItem: Codable, Equatable, Sendable {
    public var key: String
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?
    public var sentiment: Sentiment

    public init(key: String, creator: String? = nil, genres: [String] = [], releaseYear: String? = nil, sentiment: Sentiment) {
        self.key = key; self.creator = creator; self.genres = genres; self.releaseYear = releaseYear
        self.sentiment = sentiment
    }

    public var profile: RatingProfile { RatingProfile(key: key, creator: creator, genres: genres, releaseYear: releaseYear) }
}

/// A ranking position, as stored: only the order is persisted (D3).
public struct KeyedSentiment: Codable, Equatable, Sendable {
    public var key: String
    public var sentiment: Sentiment

    public init(key: String, sentiment: Sentiment) { self.key = key; self.sentiment = sentiment }
}

public func scoreAt(_ sentiment: Sentiment, index: Int, size: Int) -> Double {
    let (lo, hi) = scoreBand(sentiment)
    let raw = hi - ((hi - lo) * (Double(index) + 0.5)) / Double(size)
    return jsRound(raw * 10) / 10
}

/// Scores for a whole category ranking, in ranking order (a Map in TS).
public func scoresFor(_ ranking: [KeyedSentiment]) -> [(key: String, score: Double)] {
    var sizes: [Sentiment: Int] = [:]
    for item in ranking { sizes[item.sentiment, default: 0] += 1 }
    var seen: [Sentiment: Int] = [:]
    var order: [String] = []
    var scores: [String: Double] = [:]
    for item in ranking {
        let index = seen[item.sentiment] ?? 0
        seen[item.sentiment] = index + 1
        if scores[item.key] == nil { order.append(item.key) } // a Map keeps a key's first position
        scores[item.key] = scoreAt(item.sentiment, index: index, size: sizes[item.sentiment]!)
    }
    return order.map { ($0, scores[$0]!) }
}

/// "Frank Herbert, Brian Herbert" / "Lee & Kirby" → individual names, as written.
private func creatorNames(_ creator: String?) -> [String] {
    (creator ?? "")
        .split(separator: jsRegex(#/,|&|\band\b/#).ignoresCase(), omittingEmptySubsequences: false)
        .map { jsTrim(String($0)) }
        .filter { !$0.isEmpty }
}

private func creatorsOf(_ creator: String?) -> Set<String> {
    Set(creatorNames(creator).map { $0.lowercased() })
}

/// How hard a matchup is likely to feel: shared creator ≫ shared genres (≤ 3) ≫ release within 5 years.
public func similarity(_ a: RatingProfile, _ b: RatingProfile) -> Double {
    var score = 0.0
    if !creatorsOf(a.creator).isDisjoint(with: creatorsOf(b.creator)) { score += 4 }
    let genres = Set(b.genres.map { $0.lowercased() })
    score += Double(min(3, a.genres.filter { genres.contains($0.lowercased()) }.count))
    if let ya = a.releaseYear.flatMap(jsParseInt), let yb = b.releaseYear.flatMap(jsParseInt), abs(ya - yb) <= 5 {
        score += 0.5
    }
    return score
}

/// "Both by Frank Herbert" (first track's spelling) / "Both Drama & Crime", or nil.
public func matchupReason(_ a: RatingProfile, _ b: RatingProfile) -> String? {
    let theirs = creatorsOf(b.creator)
    if let shared = creatorNames(a.creator).first(where: { theirs.contains($0.lowercased()) }) {
        return "Both by \(shared)"
    }
    let genres = Set(b.genres.map { $0.lowercased() })
    let common = a.genres.filter { genres.contains($0.lowercased()) }.prefix(2)
    return common.isEmpty ? nil : "Both \(common.joined(separator: " & "))"
}

public enum Answer: String, Codable, Sendable { case candidate, opponent, tie }

/// A binary-insertion search over the tracks sharing the new track's sentiment.
/// Field names are part of the shared fixture contract.
public struct RankingSession: Codable, Equatable, Sendable {
    public var candidate: RatingProfile
    public var sentiment: Sentiment
    /// The bucket's tracks, best first.
    public var bucket: [RankedItem]
    public var lo: Int
    public var hi: Int
    /// Index into `bucket` of the track to compare against; nil once placed.
    public var opponent: Int?
    public var comparisons: Int

    public init(candidate: RatingProfile, sentiment: Sentiment, bucket: [RankedItem], lo: Int, hi: Int, opponent: Int?, comparisons: Int) {
        self.candidate = candidate; self.sentiment = sentiment; self.bucket = bucket
        self.lo = lo; self.hi = hi; self.opponent = opponent; self.comparisons = comparisons
    }
}

/// The most similar track in the middle half of [lo, hi), ties to the midpoint.
public func pickOpponent(_ bucket: [RankedItem], lo: Int, hi: Int, candidate: RatingProfile) -> Int? {
    let size = hi - lo
    if size <= 0 { return nil }
    let mid = lo + size / 2
    let margin = size / 4
    var best = mid
    var bestScore = -1.0
    var i = lo + margin
    while i <= hi - 1 - margin {
        let score = similarity(candidate, bucket[i].profile)
        if score > bestScore || (score == bestScore && abs(i - mid) < abs(best - mid)) {
            best = i
            bestScore = score
        }
        i += 1
    }
    return best
}

/// A re-rank leaves the track's own earlier rating out of the comparison.
public func startRanking(_ candidate: RatingProfile, sentiment: Sentiment, ranking: [RankedItem]) -> RankingSession {
    let bucket = ranking.filter { $0.sentiment == sentiment && $0.key != candidate.key }
    return RankingSession(
        candidate: candidate, sentiment: sentiment, bucket: bucket, lo: 0, hi: bucket.count,
        opponent: pickOpponent(bucket, lo: 0, hi: bucket.count, candidate: candidate), comparisons: 0
    )
}

/// "Too tough to call" settles it just below the opponent.
public func answer(_ session: RankingSession, _ choice: Answer) -> RankingSession {
    guard let at = session.opponent else { return session }
    var s = session
    switch choice {
    case .candidate: s.hi = at
    case .opponent: s.lo = at + 1
    case .tie: s.lo = at + 1; s.hi = at + 1
    }
    s.opponent = pickOpponent(s.bucket, lo: s.lo, hi: s.hi, candidate: s.candidate)
    s.comparisons += 1
    return s
}

public func isPlaced(_ session: RankingSession) -> Bool { session.opponent == nil }

/// The category's new best-first order: other buckets untouched, the candidate
/// inserted at `indexInBucket` (clamped) within its own.
public func placeInRanking(_ ranking: [KeyedSentiment], key: String, sentiment: Sentiment, indexInBucket: Int) -> [KeyedSentiment] {
    let others = ranking.filter { $0.key != key }
    var out: [KeyedSentiment] = []
    for s in Sentiment.allCases {
        var bucket = others.filter { $0.sentiment == s }
        if s == sentiment {
            bucket.insert(KeyedSentiment(key: key, sentiment: sentiment), at: max(0, min(indexInBucket, bucket.count)))
        }
        out += bucket
    }
    return out
}

/// A26: what a rated track shows.
public struct RatingSummary: Codable, Equatable, Sendable {
    public var sentiment: Sentiment
    public var score: Double
    /// 1-based, within its category.
    public var rank: Int
    public var outOf: Int
    public var category: Category

    public init(sentiment: Sentiment, score: Double, rank: Int, outOf: Int, category: Category) {
        self.sentiment = sentiment; self.score = score; self.rank = rank; self.outOf = outOf; self.category = category
    }
}

/// "8.4" — always one decimal, rounded the way JS's toFixed(1) rounds.
public func formatScore(_ score: Double) -> String { jsToFixed1(score) }
