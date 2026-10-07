import XCTest
@testable import IrisCore

/// Review Focus 3: JSON columns Swift writes must be the text JS writes.
final class JSONTextTests: XCTestCase {
    func testStringArraysMatchJSONStringify() {
        // JSON.stringify(['Sci-Fi/Fantasy', 'Rock "n" Roll', 'é', 'a\\b', '\n\u0001'])
        XCTAssertEqual(
            jsonText(["Sci-Fi/Fantasy", "Rock \"n\" Roll", "é", "a\\b", "\n\u{01}"]),
            #"["Sci-Fi/Fantasy","Rock \"n\" Roll","é","a\\b","\n\u0001"]"#
        )
        XCTAssertEqual(jsonText([String]()), "[]")
    }

    func testSeasonsMatchJSONStringify() {
        XCTAssertEqual(jsonText([SeasonBoundary(number: 1, episodeCount: 10)]), #"[{"number":1,"episodeCount":10}]"#)
    }
}
