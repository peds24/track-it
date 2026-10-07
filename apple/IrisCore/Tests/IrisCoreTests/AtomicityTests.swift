import GRDB
import XCTest
@testable import IrisCore

/// I4 review: TS opens its own transaction in every multi-statement write,
/// so atomicity can't depend on how a screen calls these. Each function must
/// leave the library untouched when it fails part-way, even when called
/// outside any transaction.
final class AtomicityTests: XCTestCase {
    private func library() throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        return queue
    }

    private func count(_ queue: DatabaseQueue, _ table: String) throws -> Int {
        try queue.read { try Int.fetchOne($0, sql: "SELECT count(*) FROM \(table)") ?? -1 }
    }

    func testCreateSeriesTrackRollsBackOutsideATransaction() throws {
        let queue = try library()
        try queue.writeWithoutTransaction { db in
            try db.execute(sql: "CREATE TRIGGER boom BEFORE INSERT ON entry WHEN NEW.ordinal = 2 BEGIN SELECT RAISE(ABORT, 'boom'); END")
            let draft = SeriesDraft(title: "Severance", mediaType: .show, unitLabel: .episode,
                                    entries: (1...3).map { EntryDraft(ordinal: $0, title: "Episode \($0)") })
            XCTAssertThrowsError(try createSeriesTrack(db, draft, now: "2026-08-12T10:00:00.000Z"))
        }
        XCTAssertEqual(try count(queue, "series"), 0)
        XCTAssertEqual(try count(queue, "entry"), 0)
    }

    func testImportLibraryRollsBackOutsideATransaction() throws {
        let queue = try library()
        try queue.write { db in
            _ = try createStandaloneTrack(db, StandaloneInput(title: "Dune", category: .book), now: "2026-08-12T10:00:00.000Z")
        }
        let backup = #"{"version":1,"series":[],"entries":[{"id":"e1","seriesId":null,"title":"Dracula","ordinal":null,"mediaType":"book","status":"unstarted","startedAt":null,"finishedAt":null,"createdAt":"2026-08-12T10:00:00.000Z"},{"id":"e2","seriesId":null,"title":"Ubik","ordinal":null,"mediaType":"book","status":"unstarted","startedAt":null,"finishedAt":null,"createdAt":"2026-08-12T10:00:00.000Z"}]}"#
        try queue.writeWithoutTransaction { db in
            try db.execute(sql: "CREATE TRIGGER boom BEFORE INSERT ON entry WHEN NEW.title = 'Ubik' BEGIN SELECT RAISE(ABORT, 'boom'); END")
            XCTAssertThrowsError(try importLibrary(db, json: backup))
        }
        // The DELETEs ran before the failing INSERT: without its own savepoint
        // the library would be half wiped.
        XCTAssertEqual(try queue.read { try String.fetchAll($0, sql: "SELECT title FROM entry") }, ["Dune"])
    }

    func testSaveRatingIsSelfContained() throws {
        let queue = try library()
        let ids = try queue.write { db in
            try ["A", "B"].map { try createStandaloneTrack(db, StandaloneInput(title: $0, category: .movie), now: "2026-08-12T10:00:00.000Z") }
        }
        try queue.writeWithoutTransaction { db in
            try saveRating(db, RatableTrack(kind: .entry, id: ids[0], category: .movie), sentiment: .liked, indexInBucket: 0, now: "2026-08-12T10:00:00.000Z")
            try db.execute(sql: "CREATE TRIGGER boom BEFORE UPDATE OF position ON rating WHEN NEW.position = 1 BEGIN SELECT RAISE(ABORT, 'boom'); END")
            XCTAssertThrowsError(try saveRating(db, RatableTrack(kind: .entry, id: ids[1], category: .movie), sentiment: .liked, indexInBucket: 0, now: "2026-08-12T10:00:00.000Z"))
        }
        // B's insert and the renumbering roll back together: A stays the only rating.
        XCTAssertEqual(try queue.read { try String.fetchAll($0, sql: "SELECT track_id FROM rating") }, [ids[0]])
    }
}
