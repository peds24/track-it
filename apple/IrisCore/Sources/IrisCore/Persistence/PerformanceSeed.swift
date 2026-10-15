#if DEBUG
import Foundation
import GRDB

/// A 1,000-track library shaped like years of use (I12): the performance
/// tests and DEBUG `-IrisSeed perf` run on it. Deterministic — no randomness.
/// Tracks are created through the repositories; their progress is then set
/// in bulk SQL (thousands of single advances would make launch the bottleneck),
/// which keeps every entry valid: done units carry both timestamps, the rest
/// are unstarted. Never compiled into Release.
///
/// | Category | Tracks | Shape |
/// | --- | --- | --- |
/// | Shows | 300 | 20 with 8 seasons × 22 episodes; the rest 1–3 seasons of 10 |
/// | Books | 250 | |
/// | Movies | 200 | |
/// | Comics | 150 | 10 with 400 issues; the rest 12–51 |
/// | Manga | 100 | 10–60 volumes |
///
/// Shelves: 15% Currently, 50% Backlog, 35% Done (a movie can't be part-way,
/// so Currently movies go to Backlog). The first 300 Done tracks are rated.
public func seedLargeLibrary(_ library: Library) throws {
    let base = 1_760_000_000.0
    var minute = 0
    func now() -> String {
        minute += 1
        return toISOString(Date(timeIntervalSince1970: base + Double(minute) * 60))
    }
    func units(_ label: String, _ count: Int) -> [EntryDraft] { (1...count).map { EntryDraft(ordinal: $0, title: "\(label) \($0)") } }

    try library.write { db in
        var index = 0
        var rated = 0
        let sentiments: [Sentiment] = [.liked, .fine, .disliked]

        /// Where the k-th track lands: 3 of every 20 Currently, 10 Backlog, 7 Done.
        func shelf(_ k: Int) -> Shelf { k % 20 < 3 ? .currently : k % 20 < 13 ? .backlog : .done }

        func rate(_ ref: TrackRef, _ category: Category) throws {
            guard rated < 300 else { return }
            try saveRating(db, RatableTrack(kind: ref.kind, id: ref.id, category: category),
                           sentiment: sentiments[rated % 3], indexInBucket: 0, now: now())
            rated += 1
        }

        func series(_ title: String, _ type: SeriesMediaType, _ label: UnitLabel, _ count: Int, seasons: [SeasonBoundary]? = nil) throws {
            let unitName = label == .episode ? "Episode" : label == .issue ? "Issue" : "Volume"
            let id = try createSeriesTrack(db, SeriesDraft(title: title, mediaType: type, unitLabel: label,
                                                           entries: units(unitName, count), seasons: seasons), now: now())
            let target = shelf(index)
            let finished = target == .done ? count : target == .currently ? count / 2 : 0
            if finished > 0 {
                let at = now()
                try db.execute(sql: """
                    UPDATE entry SET status = 'done', started_at = ?, finished_at = ?
                    WHERE series_id = ? AND ordinal <= ?
                    """, arguments: [at, at, id, finished])
            }
            if target == .done {
                let category: Category = type == .show ? .show : type == .comic ? .comic : .manga
                try rate(TrackRef(kind: .series, id: id), category)
            }
            index += 1
        }

        func standalone(_ title: String, _ category: Category) throws {
            let id = try createStandaloneTrack(db, StandaloneInput(title: title, category: category), now: now())
            let at = now()
            switch shelf(index) {
            case .done:
                try db.execute(sql: "UPDATE entry SET status = 'done', started_at = ?, finished_at = ? WHERE id = ?", arguments: [at, at, id])
                try rate(TrackRef(kind: .entry, id: id), category)
            case .currently where category == .book:
                try db.execute(sql: "UPDATE entry SET status = 'in_progress', started_at = ? WHERE id = ?", arguments: [at, id])
            default: break
            }
            index += 1
        }

        for i in 0..<300 {
            let seasonCount = i < 20 ? 8 : 1 + i % 3, perSeason = i < 20 ? 22 : 10
            try series("Show \(i + 1)", .show, .episode, seasonCount * perSeason,
                       seasons: (1...seasonCount).map { SeasonBoundary(number: $0, episodeCount: perSeason) })
        }
        for i in 0..<250 { try standalone("Book \(i + 1)", .book) }
        for i in 0..<200 { try standalone("Movie \(i + 1)", .movie) }
        for i in 0..<150 { try series("Comic \(i + 1)", .comic, .issue, i < 10 ? 400 : 12 + i % 40) }
        for i in 0..<100 { try series("Manga \(i + 1)", .manga, .volume, 10 + i % 51) }
    }
}
#endif
