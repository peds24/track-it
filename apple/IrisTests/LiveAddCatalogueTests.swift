import IrisCore
import XCTest
@testable import Iris

final class LiveAddCatalogueTests: XCTestCase {
    /// D10/A11/A14: book → Google Books, manga → AniList, comic → Metron,
    /// show/movie → TMDB, a comic collection → Google Books.
    func testEachKeyReachesItsCatalogue() {
        let live = LiveAddCatalogue(registry: ProviderRegistry(keys: ProviderKeys(), http: URLSessionHTTPClient()))
        let ids = [AddCatalogueKey.category(.book), .category(.manga), .category(.comic), .category(.show), .category(.movie), .comicCollection]
            .map { live.provider(for: $0).id }
        XCTAssertEqual(ids, ["google-books", "anilist", "metron", "tmdb", "tmdb", "google-books"])
        XCTAssertEqual(live.provider(for: .comicCollection).category, .comic)
        XCTAssertEqual(live.provider(for: .category(.movie)).category, .movie)
    }

    func testTheAppSaysWhyItWantsTheCamera() throws {
        let reason = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String)
        XCTAssertTrue(reason.contains("barcode"))
    }
}
