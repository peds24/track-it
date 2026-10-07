import IrisCore
import XCTest

/// Iris I5: project.yml carries the Secrets.xcconfig keys into Info.plist,
/// where ProviderKeys.fromBundle reads them (empty without the file).
final class ProviderKeysWiringTests: XCTestCase {
    func testInfoPlistCarriesEveryProviderKey() {
        for key in ["TMDB_API_KEY", "GOOGLE_BOOKS_API_KEY", "METRON_USERNAME", "METRON_PASSWORD"] {
            XCTAssertNotNil(Bundle.main.object(forInfoDictionaryKey: key) as? String, "\(key) missing from Info.plist")
        }
    }
}
