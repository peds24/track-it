import IrisCore
import XCTest
@testable import Iris

final class ShelfRowMappingTests: XCTestCase {
    private func track(
        kind: TrackKind = .series, title: String = "Severance", category: IrisCore.Category = .show, shelf: Shelf = .currently,
        progress: IrisCore.Progress? = IrisCore.Progress(done: 3, total: 10), ongoing: Bool = false, paused: Bool = false,
        seasons: [SeasonBoundary]? = nil, next: String? = "Episode 4", nextId: String? = "e4"
    ) -> TrackSummary {
        TrackSummary(kind: kind, id: "t1", title: title, category: category, shelf: shelf, createdAt: "2026-08-12T10:00:00.000Z",
                     progress: progress, ongoing: ongoing, paused: paused, seasons: seasons, nextEntryStatus: .unstarted,
                     nextEntryId: nextId, nextEntryTitle: next)
    }

    func testASeasonShowOnCurrentlyGetsSegmentsAndTheSeasonLabel() {
        let seasons = [SeasonBoundary(number: 1, episodeCount: 9), SeasonBoundary(number: 2, episodeCount: 10)]
        let m = IrisShelfRow.Model(track(progress: IrisCore.Progress(done: 13, total: 19), seasons: seasons, next: "Episode 14"), rating: nil)
        XCTAssertEqual(m.detail, "S2 Ep 5 of 10 · 13 of 19")
        XCTAssertEqual(m.progress, .seasons(seasonSegments(seasons, doneCount: 13)))
        XCTAssertEqual(m.accessory, .action(title: "Done", symbol: .advance, accessibilityName: "Mark Episode 14 watched"))
        XCTAssertEqual(m.category, .show)
        XCTAssertNil(m.coverURL)
    }

    func testAnOngoingComicSaysOngoingAndDrawsNoBar() {
        let m = IrisShelfRow.Model(track(title: "Saga", category: .comic, progress: nil, ongoing: true, next: "Issue 4"), rating: nil)
        XCTAssertEqual(m.detail, "Next Issue 4 · Ongoing")
        XCTAssertNil(m.progress)
    }

    func testABacklogMovieOffersWatched() {
        let m = IrisShelfRow.Model(track(kind: .entry, title: "Arrival", category: .movie, shelf: .backlog, progress: nil, next: "Arrival", nextId: "m1"), rating: nil)
        XCTAssertEqual(m.detail, "Not started")
        XCTAssertEqual(m.accessory, .action(title: "Watched", symbol: .start, accessibilityName: "Watched Arrival"))
        XCTAssertNil(m.progress)
    }

    func testAPausedMangaOffersResumeAndKeepsItsBar() {
        let m = IrisShelfRow.Model(track(title: "One Piece", category: .manga, shelf: .backlog, progress: IrisCore.Progress(done: 30, total: 108), paused: true, next: "Volume 31"), rating: nil)
        XCTAssertEqual(m.detail, "Paused · Volume 31 · 30 of 108")
        XCTAssertEqual(m.progress, .flat(done: 30, total: 108))
        XCTAssertEqual(m.accessory, .action(title: "Resume", symbol: .start, accessibilityName: "Resume One Piece"))
    }

    func testAnUnstartedBacklogSeriesKeepsAnEmptyFlatBar() {
        let m = IrisShelfRow.Model(track(shelf: .backlog, progress: IrisCore.Progress(done: 0, total: 10), next: "Episode 1"), rating: nil)
        XCTAssertEqual(m.progress, .flat(done: 0, total: 10))
    }

    func testARatedDoneSeriesShowsItsScoreAndKeepsItsCount() {
        let m = IrisShelfRow.Model(track(shelf: .done, progress: IrisCore.Progress(done: 10, total: 10), next: nil, nextId: nil),
                                   rating: RowRating(score: 8.7, sentiment: .liked))
        XCTAssertEqual(m.detail, "Finished · 10 of 10")
        XCTAssertNil(m.progress)
        XCTAssertEqual(m.accessory, .rating(score: 8.7, sentiment: .liked))
    }

    func testAnUnratedDoneMovieHasNoAccessoryUntilI10() {
        let m = IrisShelfRow.Model(track(kind: .entry, title: "Interstellar", category: .movie, shelf: .done, progress: nil, next: nil, nextId: nil), rating: nil)
        XCTAssertEqual(m.detail, "Watched")
        XCTAssertEqual(m.accessory, IrisShelfRow.Accessory.none)
    }

    func testASeriesWithNoTotalDrawsNoBar() {
        XCTAssertNil(IrisShelfRow.Model(track(progress: IrisCore.Progress(done: 0, total: 0)), rating: nil).progress)
    }
}
