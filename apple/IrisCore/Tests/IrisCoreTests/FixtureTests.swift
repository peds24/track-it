import Foundation
import XCTest

/// spec §3: every vector recorded from the TS domain must pass in Swift.
final class FixtureTests: XCTestCase {
    /// Fixture modules not ported yet. Each task moves its modules out; I3 is
    /// done when this is empty (Task 7).
    static let pending: Set<String> = ["shelf", "advance", "validate", "seriesTitle", "genres", "seasons", "formatters", "rating"]
    static let ported: Set<String> = ["whatsNew", "mode"]

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

    func testWhatsNew() throws { try check("whatsNew", whatsNewFixtures) }
    func testMode() throws { try check("mode", modeFixtures) }
}
