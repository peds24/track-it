import XCTest
@testable import IrisCore

final class IrisCoreTests: XCTestCase {
    /// The Swift side targets the same SQLite schema as the TS app
    /// (spec §3). src/db/schema.ts has 10 migrations as of v1.4.0.
    func testTargetsTheTSSchemaVersion() {
        XCTAssertEqual(IrisCore.schemaVersion, 10)
    }
}
