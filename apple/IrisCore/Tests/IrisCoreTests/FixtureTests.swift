import Foundation
import XCTest

/// spec §3: every vector recorded from the TS domain must pass in Swift.
final class FixtureTests: XCTestCase {
    /// Fixture modules not ported yet. Each task moves its modules out; I3 is
    /// done when this is empty (Task 7).
    static let pending: Set<String> = []
    static let ported: Set<String> = ["whatsNew", "mode", "shelf", "advance", "validate", "seriesTitle", "genres", "seasons", "rating", "formatters"]

    private func check(_ module: String, _ registry: [String: FixtureFn]) throws {
        let failures = try runFixtures(module, registry)
        XCTAssert(failures.isEmpty, "\(module): \(failures.count) failing case(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryFixtureModuleIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: fixturesDirectory.path)
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
        XCTAssert(Self.ported.isDisjoint(with: Self.pending))
    }

    func testEveryFixtureModuleIsPorted() {
        XCTAssertEqual(Self.pending, [], "I3 is complete only when every shared/fixtures module runs in Swift")
    }

    func testWhatsNew() throws { try check("whatsNew", whatsNewFixtures) }
    func testMode() throws { try check("mode", modeFixtures) }
    func testShelf() throws { try check("shelf", shelfFixtures) }
    func testAdvance() throws { try check("advance", advanceFixtures) }
    func testValidate() throws { try check("validate", validateFixtures) }
    func testSeriesTitle() throws { try check("seriesTitle", seriesTitleFixtures) }
    func testGenres() throws { try check("genres", genresFixtures) }
    func testSeasons() throws { try check("seasons", seasonsFixtures) }
    func testRating() throws { try check("rating", ratingFixtures) }
    func testFormatters() throws { try check("formatters", formattersFixtures) }
}
