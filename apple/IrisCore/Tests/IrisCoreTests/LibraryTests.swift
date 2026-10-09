import Foundation
import XCTest
@testable import IrisCore

final class LibraryTests: XCTestCase {
    private let t0 = "2026-10-01T10:00:00.000Z"

    func testToISOStringMatchesJavaScript() {
        XCTAssertEqual(toISOString(Date(timeIntervalSince1970: 1_760_000_000.123)), "2025-10-09T08:53:20.123Z")
        XCTAssertEqual(toISOString(Date(timeIntervalSince1970: 0)), "1970-01-01T00:00:00.000Z")
    }

    func testOpenCreatesTheFileAndReopensTheSameLibrary() throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString).appendingPathComponent("Iris/library.sqlite")
        let first = try Library.open(at: url)
        try seedDemoLibrary(first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        let second = try Library.open(at: url)
        XCTAssertFalse(try second.snapshot(shelf: .currently).isEmpty)
    }

    func testAFreshLibraryHasEmptyShelves() throws {
        let library = try Library.inMemory()
        for shelf in [Shelf.currently, .backlog, .done] { XCTAssertEqual(try library.snapshot(shelf: shelf), []) }
    }

    func testObservationFollowsATrackFromBacklogToDone() async throws {
        let library = try Library.inMemory()
        let id = try library.write { [t0] db in try createStandaloneTrack(db, StandaloneInput(title: "Arrival", category: .movie), now: t0) }
        let entry = try await library.firstEntryId(of: TrackRef(kind: .entry, id: id))
        var done = library.tracks(shelf: .done, category: nil).makeAsyncIterator()
        guard case .success(let initial)? = await done.next() else { return XCTFail("no initial value") }
        XCTAssertEqual(initial, [])
        try await library.advance(entryId: entry, now: Date())   // a movie: backlog → done in one step
        guard case .success(let after)? = await done.next() else { return XCTFail("no update") }
        XCTAssertEqual(after.map(\.id), [id])
    }

    func testCategoryFilterNarrowsTheObservation() async throws {
        let library = try Library.inMemory()
        _ = try library.write { [t0] db in
            try createStandaloneTrack(db, StandaloneInput(title: "Arrival", category: .movie), now: t0)
            return try createStandaloneTrack(db, StandaloneInput(title: "Dune", category: .book), now: t0)
        }
        var books = library.tracks(shelf: .backlog, category: .book).makeAsyncIterator()
        guard case .success(let value)? = await books.next() else { return XCTFail("no value") }
        XCTAssertEqual(value.map(\.title), ["Dune"])
    }

    func testRenameStripsNULAndIgnoresBlank() async throws {
        let library = try Library.inMemory()
        let id = try library.write { [t0] db in try createStandaloneTrack(db, StandaloneInput(title: "Dune", category: .book), now: t0) }
        let ref = TrackRef(kind: .entry, id: id)
        try await library.rename(ref, title: "Dune\u{0} Messiah ")
        XCTAssertEqual(try library.snapshot(shelf: .backlog).first?.title, "Dune Messiah")
        try await library.rename(ref, title: "  \u{0} ")
        XCTAssertEqual(try library.snapshot(shelf: .backlog).first?.title, "Dune Messiah")
    }

    func testAdvanceOfAMissingEntryThrows() async throws {
        let library = try Library.inMemory()
        do {
            try await library.advance(entryId: "nope", now: Date())
            XCTFail("expected a throw")
        } catch {}
    }

    func testScoresCarrySentiment() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        var scores = library.scores().makeAsyncIterator()
        let value = await scores.next() ?? [:]
        XCTAssertEqual(value.count, 1)
        XCTAssertEqual(value.values.first?.sentiment, .liked)
    }

    func testDemoSeedFillsEveryShelfWithTheGalleryStates() throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        XCTAssertEqual(Set(try library.snapshot(shelf: .currently).map(\.title)), ["Severance", "Dune", "Saga"])
        XCTAssertEqual(Set(try library.snapshot(shelf: .backlog).map(\.title)),
                       ["Arrival", "One Piece", "The Lord of the Rings: The Fellowship of the Ring (Extended Edition)"])
        XCTAssertEqual(Set(try library.snapshot(shelf: .done).map(\.title)), ["Project Hail Mary", "Interstellar"])
        let severance = try XCTUnwrap(library.snapshot(shelf: .currently).first { $0.title == "Severance" })
        XCTAssertEqual(severance.progress, Progress(done: 13, total: 19))
        let onePiece = try XCTUnwrap(library.snapshot(shelf: .backlog).first { $0.title == "One Piece" })
        XCTAssertTrue(onePiece.paused)
        XCTAssertEqual(positionLabel(onePiece), "Paused · Volume 31")
    }

    // MARK: One track (I8)

    private func seededRef(_ library: Library, _ title: String, _ shelf: Shelf) throws -> TrackRef {
        try XCTUnwrap(library.snapshot(shelf: shelf).first { $0.title == title }).ref
    }

    func testDetailFollowsAnAdvance() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        let ref = try seededRef(library, "Severance", .currently)
        var pages = library.detail(ref).makeAsyncIterator()
        guard case .success(let first?)? = await pages.next() else { return XCTFail("no page") }
        XCTAssertEqual(first.detail.summary.progress, Progress(done: 13, total: 19))
        try await library.advance(entryId: XCTUnwrap(first.detail.summary.nextEntryId), now: Date())
        guard case .success(let after?)? = await pages.next() else { return XCTFail("no update") }
        XCTAssertEqual(after.detail.summary.progress, Progress(done: 14, total: 19))
    }

    func testDetailBecomesNilOnceDeleted() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        let ref = try seededRef(library, "Dune", .currently)
        var pages = library.detail(ref).makeAsyncIterator()
        guard case .success(.some)? = await pages.next() else { return XCTFail("no page") }
        try await library.delete(ref)
        guard case .success(let gone)? = await pages.next() else { return XCTFail("no update") }
        XCTAssertNil(gone)
    }

    func testARatedTrackCarriesItsRating() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        var pages = library.detail(try seededRef(library, "Project Hail Mary", .done)).makeAsyncIterator()
        guard case .success(let page?)? = await pages.next() else { return XCTFail("no page") }
        XCTAssertEqual(page.rating?.sentiment, .liked)
        XCTAssertEqual(page.rating?.rank, 1)
        XCTAssertEqual(page.rating?.outOf, 1)
    }

    func testSetPositionMovesASeries() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        let ref = try seededRef(library, "Severance", .currently)
        try await library.setPosition(seriesId: ref.id, ordinal: 3, now: Date())
        let severance = try XCTUnwrap(library.snapshot(shelf: .currently).first { $0.id == ref.id })
        XCTAssertEqual(severance.progress, Progress(done: 2, total: 19))
    }

    func testTheSeedCarriesMetadataForTheDetailScreen() async throws {
        let library = try Library.inMemory()
        try seedDemoLibrary(library)
        var pages = library.detail(try seededRef(library, "Dune", .currently)).makeAsyncIterator()
        guard case .success(let page?)? = await pages.next() else { return XCTFail("no page") }
        XCTAssertEqual(page.detail.metadata.creator, "Frank Herbert")
        XCTAssertEqual(page.detail.metadata.releaseYear, "1965")
        XCTAssertGreaterThan(page.detail.metadata.description?.count ?? 0, 600)
    }
}
