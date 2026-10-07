import Foundation
import XCTest
@testable import IrisCore

/// Iris I5: keys come from Info.plist; a missing Secrets.xcconfig must read as "no key".
final class ProviderKeysTests: XCTestCase {
    private func bundle(_ info: [String: String]) throws -> Bundle {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("keys-\(UUID().uuidString).bundle")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let plist = try PropertyListSerialization.data(fromPropertyList: info, format: .xml, options: 0)
        try plist.write(to: dir.appendingPathComponent("Info.plist"))
        return try XCTUnwrap(Bundle(url: dir))
    }

    func testEmptyAndUnexpandedValuesAreMissing() throws {
        let keys = ProviderKeys.fromBundle(try bundle([
            "TMDB_API_KEY": "", "GOOGLE_BOOKS_API_KEY": "$(GOOGLE_BOOKS_API_KEY)", "METRON_USERNAME": "",
        ]))
        XCTAssertEqual(keys, ProviderKeys())
    }

    func testRealValuesAreRead() throws {
        let keys = ProviderKeys.fromBundle(try bundle([
            "TMDB_API_KEY": "t", "GOOGLE_BOOKS_API_KEY": "g", "METRON_USERNAME": "u", "METRON_PASSWORD": "p",
        ]))
        XCTAssertEqual(keys, ProviderKeys(tmdb: "t", googleBooks: "g", metronUsername: "u", metronPassword: "p"))
    }
}
