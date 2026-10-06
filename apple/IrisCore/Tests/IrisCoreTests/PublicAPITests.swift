import XCTest
import IrisCore // deliberately not @testable: only the public API the app target sees

/// I3 review: the app (I4–I10) must be able to build every domain value.
final class PublicAPITests: XCTestCase {
    func testTheAppCanConstructEveryDomainValue() {
        _ = Series(id: "s", title: "T", mediaType: .show, unitLabel: .episode, createdAt: "2026-01-01")
        _ = TrackMetadata(creator: "X")
        _ = UnitTimes(status: .done)
        _ = Timeline(addedAt: "2026-01-01")
        let profile = RatingProfile(key: "k")
        _ = RankedItem(key: "k", sentiment: .liked)
        _ = KeyedSentiment(key: "k", sentiment: .fine)
        _ = startRanking(profile, sentiment: .liked, ranking: [])
        _ = RatingSummary(sentiment: .liked, score: 8.5, rank: 1, outOf: 1, category: .movie)
        _ = EntryInvariants(mediaType: .book, parentUnitLabel: nil)
        _ = ReleaseNote(version: "2.0.0", title: "Iris", items: [ReleaseNote.Item(heading: "h", body: "b")])
        _ = SeasonBoundary(number: 1, episodeCount: 10)
    }
}
