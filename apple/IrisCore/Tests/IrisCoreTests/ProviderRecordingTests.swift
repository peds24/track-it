import XCTest

/// Iris I5: every recorded provider call replays with identical requests and results.
final class ProviderRecordingTests: XCTestCase {
    static let pending: Set<String> = ["pure", "metron", "anilist"]
    static let ported: Set<String> = ["tmdb", "googleBooks"]

    private func check(_ area: String) async throws {
        let failures = try await runRecordings(area, providerCalls)
        XCTAssert(failures.isEmpty, "\(area): \(failures.count) divergence(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryAreaIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: providersDirectory.path)
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
    }

    func testTMDB() async throws { try await check("tmdb") }
    func testGoogleBooks() async throws { try await check("googleBooks") }
}
