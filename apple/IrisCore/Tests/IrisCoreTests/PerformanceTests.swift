import GRDB
import XCTest
@testable import IrisCore

/// I12: a 1,000-track library shaped like long-term use — 8-season shows,
/// 400-issue comics — read through the Library's own streams. Budgets are
/// loose for a debug `swift test`: they catch an O(n²) or a lost index, not
/// a regression of a few milliseconds.
final class PerformanceTests: XCTestCase {
    nonisolated(unsafe) private static var shared: Library?

    private func library() throws -> Library {
        if let library = Self.shared { return library }
        let library = try Library.inMemory()
        try seedLargeLibrary(library)
        Self.shared = library
        return library
    }

    func testTheSeedIsAThousandTracksShapedLikeRealUse() async throws {
        let library = try library()
        var all: [TrackSummary] = []
        for shelf in [Shelf.currently, .backlog, .done] { all += try await first(library.tracks(shelf: shelf, category: nil)) }
        XCTAssertEqual(all.count, 1000)
        let byCategory = Dictionary(grouping: all, by: \.category).mapValues(\.count)
        XCTAssertEqual(byCategory, [.show: 300, .book: 250, .movie: 200, .comic: 150, .manga: 100])
        let byShelf = Dictionary(grouping: all, by: \.shelf).mapValues(\.count)
        XCTAssertEqual(Double(byShelf[.currently] ?? 0), 150, accuracy: 30)
        XCTAssertEqual(Double(byShelf[.backlog] ?? 0), 500, accuracy: 50)
        XCTAssertEqual(Double(byShelf[.done] ?? 0), 350, accuracy: 50)
        let units = try await library.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT MAX(n) FROM (SELECT COUNT(*) AS n FROM entry WHERE series_id IS NOT NULL GROUP BY series_id)")
        }
        XCTAssertEqual(units, 400, "the longest comic")
        let rated = try await library.queue.read { db in try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM rating") }
        XCTAssertEqual(rated, 300)
    }

    func testEveryShelfStreamsItsFirstValueWithinBudget() async throws {
        let library = try library()
        for shelf in [Shelf.currently, .backlog, .done] {
            for category in [nil] + Category.allCases.map(Optional.some) {
                let ms = try await median { _ = try await self.first(library.tracks(shelf: shelf, category: category)) }
                print("PERF shelf \(shelf) \(category?.rawValue ?? "all"): \(Int(ms)) ms")
                XCTAssertLessThan(ms, 150, "\(shelf) \(category?.rawValue ?? "all"): \(ms) ms")
            }
        }
    }

    func testRankingsAndTheLongestDetailAreWithinBudget() async throws {
        let library = try library()
        for category in Category.allCases {
            let ms = try await median { _ = try await self.first(library.rankings(category: category)) }
            print("PERF rankings \(category): \(Int(ms)) ms")
            XCTAssertLessThan(ms, 50, "rankings \(category): \(ms) ms")
        }
        let longest = try await library.queue.read { db in
            try String.fetchOne(db, sql: "SELECT series_id FROM entry WHERE series_id IS NOT NULL GROUP BY series_id ORDER BY COUNT(*) DESC LIMIT 1")
        }
        let ref = TrackRef(kind: .series, id: try XCTUnwrap(longest))
        let ms = try await median { _ = try await self.first(library.detail(ref)) }
        print("PERF detail 400-issue comic: \(Int(ms)) ms")
        XCTAssertLessThan(ms, 50, "detail of the 400-issue comic: \(ms) ms")
    }

    /// The lookups that should be indexed are. (Shelves read whole tables by
    /// design, as the TS repo does; their cost is the budget above.)
    func testTheKeyedLookupsUseIndexes() async throws {
        let library = try library()
        let plans = try await library.queue.read { db -> [String: String] in
            func plan(_ sql: String, _ args: StatementArguments) throws -> String {
                try Row.fetchAll(db, sql: "EXPLAIN QUERY PLAN " + sql, arguments: args).map { $0["detail"] as String }.joined(separator: "; ")
            }
            return [
                "ranking": try plan(rankingSQL, ["movie"]),
                "series units": try plan("SELECT * FROM entry WHERE series_id = ?", ["x"]),
                "rating": try plan("SELECT category FROM rating WHERE track_kind = ? AND track_id = ?", ["entry", "x"]),
            ]
        }
        for (name, plan) in plans {
            XCTAssertFalse(plan.range(of: #"SCAN (entry|rating|series)(?! USING)"#, options: .regularExpression) != nil, "\(name): \(plan)")
        }
    }

    // MARK: Helpers

    private func first<T>(_ stream: AsyncStream<Result<T, Error>>) async throws -> T {
        for await value in stream { return try value.get() }
        throw DomainError("stream ended without a value")
    }

    /// Median of five runs after one warm-up, in milliseconds.
    private func median(_ body: () async throws -> Void) async throws -> Double {
        try await body()
        var runs: [Double] = []
        for _ in 0..<5 {
            let start = ContinuousClock.now
            try await body()
            let d = ContinuousClock.now - start
            runs.append(Double(d.components.seconds) * 1000 + Double(d.components.attoseconds) / 1e15)
        }
        return runs.sorted()[2]
    }
}
