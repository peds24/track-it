import IrisCore
import XCTest
@testable import Iris

@MainActor
final class DetailViewsLogicTests: XCTestCase {
    private let show = TrackSummary(kind: .series, id: "s1", title: "Severance", category: .show, shelf: .currently,
                                    createdAt: "2026-08-12T10:00:00.000Z", progress: IrisCore.Progress(done: 13, total: 19),
                                    seasons: [SeasonBoundary(number: 1, episodeCount: 9), SeasonBoundary(number: 2, episodeCount: 10)],
                                    nextEntryStatus: .unstarted, nextEntryId: "e14", nextEntryTitle: "Episode 14")

    func testSaveIsEnabledExactlyWhenTheSharedRuleHasATarget() {
        XCTAssertEqual(PositionEditorSheet.target(show, season: "2", unit: "5"), 14)
        XCTAssertNil(PositionEditorSheet.target(show, season: "3", unit: "1"))
        XCTAssertNil(PositionEditorSheet.target(show, season: "", unit: ""))
        XCTAssertEqual(PositionEditorSheet.target(show, season: "", unit: "1"), 10, "an empty season means the current one")
    }

    func testShowMoreAppearsOnlyWhenTheTextIsLongerThanTheClamp() {
        XCTAssertTrue(ExpandableText.overflows(fullHeight: 300, clampedHeight: 120))
        XCTAssertFalse(ExpandableText.overflows(fullHeight: 120, clampedHeight: 120))
        XCTAssertFalse(ExpandableText.overflows(fullHeight: 120.4, clampedHeight: 120), "sub-point rounding is not overflow")
    }
}
