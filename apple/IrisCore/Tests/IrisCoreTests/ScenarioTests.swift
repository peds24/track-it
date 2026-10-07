import Foundation
import XCTest

/// Iris I4 / A29: every recorded data-layer scenario replays identically on GRDB.
final class ScenarioTests: XCTestCase {
    static let pending: Set<String> = ["backfill", "sync"] // Iris I5 Task 7
    static let ported: Set<String> = ["whatsNew", "tracks", "progress", "ratings", "backup"]

    private func check(_ area: String, _ calls: [String: ScenarioCall]) async throws {
        let failures = try await runScenarios(area, calls)
        XCTAssert(failures.isEmpty, "\(area): \(failures.count) divergence(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryScenarioAreaIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: scenariosDirectory.path)
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
    }

    /// Every area gets the full table: a ratings scenario also adds tracks, etc.
    private static let core = trackCalls.merging(ratingCalls) { a, _ in a }.merging(whatsNewCalls) { a, _ in a }.merging(sqlCalls) { a, _ in a }
    func testWhatsNew() async throws { try await check("whatsNew", Self.core) }
    func testTracks() async throws { try await check("tracks", Self.core) }
    func testProgress() async throws { try await check("progress", Self.core) }
    func testRatings() async throws { try await check("ratings", Self.core) }
    func testBackup() async throws { try await check("backup", Self.core) }
    func testEveryScenarioAreaIsPorted() { XCTAssertEqual(Self.pending, []) }
}
