import IrisCore
import UIKit
import XCTest
@testable import Iris

@MainActor
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
        // Label ink for every sentiment: white on the iOS 26 accent is ~3.6:1 (I7 audit).
        XCTAssertEqual(IrisRatingBadge.style(for: .liked), .init(fill: .accentTint, ink: .label))
        XCTAssertEqual(IrisRatingBadge.style(for: .fine), .init(fill: .fill, ink: .label))
        XCTAssertEqual(IrisRatingBadge.style(for: .disliked), .init(fill: .destructiveTint, ink: .label))
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

    // MARK: Glass & motion
    func testGlassFallsBackUnderReduceTransparency() {
        XCTAssertEqual(IrisGlassStyle.regular.resolved(reduceTransparency: false), .glass(.regular))
        XCTAssertEqual(IrisGlassStyle.clear.resolved(reduceTransparency: true), .fallback(.clear))
    }

    func testMotionFadesUnderReduceMotion() {
        XCTAssertEqual(IrisMotion.animation(IrisTokens.Motion.bouncy, reduceMotion: false), IrisTokens.Motion.bouncy)
        XCTAssertEqual(IrisMotion.animation(IrisTokens.Motion.bouncy, reduceMotion: true), .easeInOut(duration: 0.2))
    }

    // MARK: Review fixes
    func testProgressAccessibilityValueIsClamped() {
        XCTAssertEqual(IrisProgress.Value.flat(done: 12, total: 10).accessibilityValue, "10 of 10")
        XCTAssertEqual(IrisProgress.Value.flat(done: -1, total: 10).accessibilityValue, "0 of 10")
        XCTAssertEqual(IrisProgress.Value.flat(done: 3, total: 0).accessibilityValue, "0 of 0")
        let over = IrisProgress.Value.seasons([.init(number: 1, episodeCount: 10, done: 10), .init(number: 2, episodeCount: 8, done: 15)])
        XCTAssertEqual(over.accessibilityValue, "Season 2, 18 of 18 episodes")
    }

    func testRatedRowVoicesTheScore() {
        var m = IrisShelfRow.Model(title: "Saga", category: .comic, detail: "Finished", progress: nil, coverURL: nil,
                                   accessory: .rating(score: 8.7, sentiment: .liked))
        XCTAssertEqual(m.accessibilityValue, IrisRatingBadge.accessibilityLabel(score: 8.7))
        m.accessory = .none
        m.progress = .flat(done: 3, total: 10)
        XCTAssertEqual(m.accessibilityValue, "3 of 10")
        m.progress = nil
        XCTAssertEqual(m.accessibilityValue, "")
    }

    func testCoverWidthIsCappedAtLargeTextSizes() {
        XCTAssertEqual(IrisCover.Size.card.width(scale: 1), 120)
        XCTAssertEqual(IrisCover.Size.row.width(scale: 2.67), 72)
        XCTAssertEqual(IrisCover.Size.card.width(scale: 2.67), 160)
        XCTAssertEqual(IrisCover.Size.hero.width(scale: 2.67), 240)
    }

    func testGlassFallbackIsOpaqueInBothAppearances() {
        for style in [IrisGlassStyle.regular, .clear] {
            for ui in [UIUserInterfaceStyle.light, .dark] {
                var a: CGFloat = 0
                UIColor(style.solidFallback).resolvedColor(with: UITraitCollection(userInterfaceStyle: ui)).getRed(nil, green: nil, blue: nil, alpha: &a)
                XCTAssertEqual(a, 1, accuracy: 0.001, "\(style) \(ui.rawValue)")
            }
        }
    }
}
