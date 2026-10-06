import XCTest
@testable import IrisCore

final class IrisCoreTests: XCTestCase {
    /// The Swift side targets the same SQLite schema as the TS app
    /// (spec §3). src/db/schema.ts has 10 migrations as of v1.4.0.
    func testTargetsTheTSSchemaVersion() {
        XCTAssertEqual(IrisSchema.version, 10)
    }

    /// A type named like its module shadows the module name, so the app
    /// could no longer write `IrisCore.Status` to disambiguate (review, I0).
    func testModuleNameIsNotShadowedByAType() {
        XCTAssertEqual(IrisCore.IrisSchema.version, IrisSchema.version)
    }
}
