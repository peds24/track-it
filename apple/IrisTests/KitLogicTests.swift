import IrisCore
import XCTest
@testable import Iris

final class KitLogicTests: XCTestCase {
    // MARK: IrisCover
    func testCoverURLResolution() {
        XCTAssertNil(IrisCover.resolvedURL(nil))
        XCTAssertNil(IrisCover.resolvedURL(""))
        XCTAssertEqual(IrisCover.resolvedURL("http://img.example/a.jpg")?.absoluteString, "https://img.example/a.jpg")
        XCTAssertEqual(IrisCover.resolvedURL("https://img.example/a.jpg")?.absoluteString, "https://img.example/a.jpg")
        XCTAssertNil(IrisCover.resolvedURL("not a url with spaces"))
    }

    func testFallbackTextForAwkwardTitles() {
        XCTAssertEqual(IrisCover.fallbackText(""), "?")
        XCTAssertEqual(IrisCover.fallbackText("   "), "?")
        XCTAssertEqual(IrisCover.fallbackText("🎬 Night"), "🎬N")
        XCTAssertEqual(IrisCover.fallbackText("進撃の巨人"), "進")
        XCTAssertEqual(IrisCover.fallbackText("the expanse"), "TE")
    }

    // MARK: IrisProgress
    func testFlatProgressClamps() {
        XCTAssertEqual(IrisProgress.Value.flat(done: 3, total: 10).fraction, 0.3, accuracy: 1e-9)
        XCTAssertEqual(IrisProgress.Value.flat(done: 12, total: 10).fraction, 1)
        XCTAssertEqual(IrisProgress.Value.flat(done: -1, total: 10).fraction, 0)
        XCTAssertEqual(IrisProgress.Value.flat(done: 0, total: 0).fraction, 0)
        XCTAssertEqual(IrisProgress.Value.flat(done: 3, total: 10).accessibilityValue, "3 of 10")
    }

    func testSeasonProgress() {
        let v = IrisProgress.Value.seasons([
            SeasonSegment(number: 1, episodeCount: 10, done: 10),
            SeasonSegment(number: 2, episodeCount: 8, done: 3),
            SeasonSegment(number: 3, episodeCount: 0, done: 0),
        ])
        XCTAssertEqual(v.fraction, 13.0 / 18, accuracy: 1e-9)
        XCTAssertEqual(v.segmentFractions.map(\.weight), [10, 8, 1])
        XCTAssertEqual(v.segmentFractions.map(\.fill), [1, 0.375, 0])
        XCTAssertEqual(v.accessibilityValue, "Season 2, 13 of 18 episodes")
        XCTAssertEqual(IrisProgress.Value.seasons([]).fraction, 0)
        XCTAssertEqual(IrisProgress.Value.seasons([]).accessibilityValue, "0 of 0")
        XCTAssertEqual(IrisProgress.Value.seasons([]).segmentFractions.count, 0)
    }
}
