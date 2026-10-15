import XCTest
@testable import Iris

/// I12: what App Store Connect checks on upload, held by tests so a build
/// can't lose it quietly.
final class ReleaseReadinessTests: XCTestCase {
    /// Iris tracks nothing, collects nothing and, in Release, calls none of
    /// Apple's required-reason APIs (launch flags are DEBUG only; GRDB ships
    /// its own manifest).
    func testThePrivacyManifestShipsAndSaysNothingIsCollected() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"), "PrivacyInfo.xcprivacy is not in the app")
        let plist = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        XCTAssertEqual(plist["NSPrivacyTracking"] as? Bool, false)
        XCTAssertEqual((plist["NSPrivacyTrackingDomains"] as? [String])?.count, 0)
        XCTAssertEqual((plist["NSPrivacyCollectedDataTypes"] as? [Any])?.count, 0)
        XCTAssertEqual((plist["NSPrivacyAccessedAPITypes"] as? [Any])?.count, 0)
    }

    /// HTTPS only, so the encryption is exempt; saying so skips the
    /// export-compliance question on every upload.
    func testExportComplianceIsDeclared() {
        XCTAssertEqual(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool, false)
    }
}
