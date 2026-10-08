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

    // MARK: IrisRatingBadge
    func testRatingBadgeStyleAndLabel() {
        XCTAssertEqual(IrisRatingBadge.style(for: .liked), .init(fill: .accent, ink: .onAccent))
        XCTAssertEqual(IrisRatingBadge.style(for: .fine), .init(fill: .fill, ink: .label))
        XCTAssertEqual(IrisRatingBadge.style(for: .disliked), .init(fill: .destructiveTint, ink: .destructive))
        XCTAssertEqual(IrisRatingBadge.accessibilityLabel(score: 8.45), "Rated \(formatScore(8.45)) out of 10")
        XCTAssertEqual(IrisRatingBadge.accessibilityLabel(score: 10), "Rated 10.0 out of 10")
    }

    // MARK: IrisShelfRow
    func testShelfRowAccessibility() {
        var m = IrisShelfRow.Model(title: "Severance", category: .show, detail: "S2 Ep 4 of 10",
                                   progress: .flat(done: 13, total: 19), coverURL: nil,
                                   accessory: .action(title: "Done", symbol: .advance, accessibilityName: "Mark Episode 14 watched"))
        XCTAssertEqual(m.accessibilityLabel, "Severance, Show, S2 Ep 4 of 10")
        XCTAssertEqual(m.accessoryActionName, "Mark Episode 14 watched")
        m.accessory = .rate
        XCTAssertEqual(m.accessoryActionName, "Rate Severance")
        m.accessory = .rating(score: 8, sentiment: .liked)
        XCTAssertNil(m.accessoryActionName)
        m.accessory = .none
        XCTAssertNil(m.accessoryActionName)
    }

    func testShelfRowTitleNeverTruncatesAtAccessibilitySizes() {
        XCTAssertNil(IrisShelfRow.Model.titleLineLimit(isAccessibilitySize: true))
        XCTAssertEqual(IrisShelfRow.Model.titleLineLimit(isAccessibilitySize: false), 2)
    }
}
