import IrisCore
import XCTest
@testable import Iris

/// I12: the DEBUG seeds open through the same door as the real library.
final class AppLibraryTests: XCTestCase {
    func testThePerfSeedIsAThousandTracks() async throws {
        let library = try await AppLibrary.make(seed: "perf").get()
        var count = 0
        for shelf in [Shelf.currently, .backlog, .done] {
            for await result in library.tracks(shelf: shelf, category: nil) { count += try result.get().count; break }
        }
        XCTAssertEqual(count, 1000)
    }

    func testTheEmptySeedIsEmpty() async throws {
        let library = try await AppLibrary.make(seed: "empty").get()
        for await result in library.tracks(shelf: .backlog, category: nil) { XCTAssertEqual(try result.get().count, 0); break }
    }
}
