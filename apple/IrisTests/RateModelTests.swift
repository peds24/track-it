import Foundation
import IrisCore
import XCTest
@testable import Iris

final class FakeRateLibrary: RateLibrary, @unchecked Sendable {
    var context: RateContext?
    var failSave = false
    private(set) var saves: [(Sentiment, Int)] = []
    func rateContext(_ ref: TrackRef) async throws -> RateContext? { context }
    func saveRating(_ track: RatableTrack, sentiment: Sentiment, indexInBucket: Int, now: Date) async throws -> RatingSummary {
        if failSave { throw DomainError("disk full") }
        saves.append((sentiment, indexInBucket))
        let size = (context?.ranking.filter { $0.sentiment == sentiment }.count ?? 0) + 1
        return RatingSummary(sentiment: sentiment, score: scoreAt(sentiment, index: indexInBucket, size: size),
                             rank: indexInBucket + 1, outOf: (context?.ranking.count ?? 0) + 1, category: track.category)
    }
}

@MainActor
final class RateModelTests: XCTestCase {
    private let ref = TrackRef(kind: .entry, id: "interstellar")

    private func ranked(_ id: String, _ title: String, _ sentiment: Sentiment = .liked, rank: Int) -> RankedTrack {
        RankedTrack(key: "entry:\(id)", kind: .entry, id: id, title: title, coverUrl: nil, creator: "Denis Villeneuve",
                    genres: [], releaseYear: "2015", sentiment: sentiment, score: 9, rank: rank)
    }

    private func context(ranking: [RankedTrack], existing: RatingSummary? = nil) -> RateContext {
        let summary = TrackSummary(kind: .entry, id: "interstellar", title: "Interstellar", category: .movie, shelf: .done,
                                   createdAt: "2026-08-12T10:00:00.000Z", progress: nil)
        return RateContext(detail: TrackDetail(summary: summary, metadata: TrackMetadata(creator: "Christopher Nolan"),
                                               timeline: Timeline(addedAt: "2026-08-12T10:00:00.000Z"), unitLabel: nil),
                           profile: RatingProfile(key: "entry:interstellar", creator: "Christopher Nolan"),
                           ranking: ranking, existing: existing)
    }

    private let three = [("br", "Blade Runner 2049"), ("sic", "Sicario"), ("pri", "Prisoners")]

    private func model(_ lib: FakeRateLibrary) async -> RateModel {
        let m = RateModel(ref: ref, library: lib)
        await m.start()
        return m
    }

    func testTheThreeTrackWalkThroughPlacesItAtTheTop() async {
        let lib = FakeRateLibrary()
        lib.context = context(ranking: three.enumerated().map { ranked($1.0, $1.1, rank: $0 + 1) })
        let m = await model(lib)
        XCTAssertEqual(m.step, .sentiment)
        await m.choose(.liked)
        XCTAssertEqual(m.step, .comparing)
        var questions = 0
        while m.step == .comparing {
            XCTAssertNotNil(m.opponent)
            questions += 1
            await m.answer(.candidate)
        }
        XCTAssertLessThanOrEqual(questions, 2)
        XCTAssertEqual(lib.saves.map(\.1), [0])
        guard case let .result(summary) = m.step else { return XCTFail("not placed: \(m.step)") }
        XCTAssertEqual(summary.rank, 1)
        XCTAssertEqual(summary.outOf, 4)
        XCTAssertEqual(summary.score, scoreAt(.liked, index: 0, size: 4), accuracy: 1e-9)
    }

    func testTheFirstInACategoryIsPlacedWithNoQuestions() async {
        let lib = FakeRateLibrary()
        lib.context = context(ranking: [])
        let m = await model(lib)
        await m.choose(.fine)
        XCTAssertEqual(lib.saves.map(\.1), [0])
        guard case let .result(summary) = m.step else { return XCTFail("\(m.step)") }
        XCTAssertEqual(summary.outOf, 1)
    }

    func testATieSettlesJustBelowTheOpponent() async {
        let lib = FakeRateLibrary()
        lib.context = context(ranking: [ranked("br", "Blade Runner 2049", rank: 1)])
        let m = await model(lib)
        await m.choose(.liked)
        await m.answer(.tie)
        XCTAssertEqual(lib.saves.map(\.1), [1], "answer(.tie) puts lo just past the opponent")
    }

    func testUndoReturnsToThePreviousQuestionThenToHowYouFelt() async {
        let lib = FakeRateLibrary()
        lib.context = context(ranking: (0..<7).map { ranked("t\($0)", "Track \($0)", rank: $0 + 1) })
        let m = await model(lib)
        await m.choose(.liked)
        let first = m.session
        await m.answer(.opponent)
        XCTAssertEqual(m.history.count, 1)
        m.undo()
        XCTAssertEqual(m.session, first)
        m.undo()
        XCTAssertEqual(m.step, .sentiment)
        XCTAssertEqual(lib.saves.count, 0, "nothing is saved before placement")
    }

    func testAFailedSaveKeepsTheLastQuestionToRetry() async {
        let lib = FakeRateLibrary()
        lib.failSave = true
        lib.context = context(ranking: [ranked("br", "Blade Runner 2049", rank: 1)])
        let m = await model(lib)
        await m.choose(.liked)
        let question = m.session
        await m.answer(.candidate)
        XCTAssertEqual(m.failure?.title, "Could not save rating")
        XCTAssertEqual(m.step, .comparing)
        XCTAssertEqual(m.session, question)
    }

    func testAMissingTrackShowsNotFound() async {
        let m = await model(FakeRateLibrary())
        XCTAssertEqual(m.step, .missing)
    }

    func testTheOpponentAndReasonComeFromTheRanking() async {
        let lib = FakeRateLibrary()
        lib.context = context(ranking: [ranked("br", "Blade Runner 2049", rank: 1)])
        lib.context = RateContext(detail: lib.context!.detail, profile: RatingProfile(key: "entry:interstellar", creator: "Denis Villeneuve"),
                                  ranking: lib.context!.ranking, existing: nil)
        let m = await model(lib)
        await m.choose(.liked)
        XCTAssertEqual(m.opponent?.title, "Blade Runner 2049")
        XCTAssertEqual(m.reason, "Both by Denis Villeneuve")
    }

    func testReleasingAStartedModelSynchronouslyIsSafe() {
        var m: AnyObject? = RateModel(ref: ref, library: FakeRateLibrary())
        XCTAssertNotNil(m); m = nil; XCTAssertNil(m)
    }
}
