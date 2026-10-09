import Foundation
import IrisCore

/// Where the Add flow searches (I9): the real catalogues, or canned ones.
protocol AddCatalogue: Sendable {
    func search(_ query: String, key: AddCatalogueKey) async throws -> [SearchResult]
    func hydrate(_ result: SearchResult, key: AddCatalogueKey) async throws -> SeriesDraft
    func preview(_ result: SearchResult, key: AddCatalogueKey) async -> MatchPreview
    /// A11: a manga ISBN resolves through Google Books first.
    func mangaISBN(_ isbn: String) async throws -> [SearchResult]
    /// A9: a single issue by UPC-A, narrowed by its EAN-5 when given.
    func comicUPC(_ upc: String, ean5: String?) async throws -> [SearchResult]
}

/// Where the Add flow saves.
protocol AddLibrary: Sendable {
    func add(_ input: AddTrackInput, startNow: Bool, now: Date,
             hydrate: @Sendable (SearchResult) async throws -> SeriesDraft) async throws -> TrackRef
}

extension Library: AddLibrary {}

/// The canned catalogue, for DEBUG `-IrisCatalogue demo` and previews.
struct DemoAddCatalogue: AddCatalogue {
    private let demo = DemoCatalogue()
    func search(_ query: String, key: AddCatalogueKey) async throws -> [SearchResult] { try await demo.provider(for: key).search(query) }
    func hydrate(_ result: SearchResult, key: AddCatalogueKey) async throws -> SeriesDraft { try await demo.provider(for: key).hydrate(result) }
    func preview(_ result: SearchResult, key: AddCatalogueKey) async -> MatchPreview { await demo.provider(for: key).preview(result) }
    func mangaISBN(_ isbn: String) async throws -> [SearchResult] { try await demo.mangaISBN(isbn) }
    func comicUPC(_ upc: String, ean5: String?) async throws -> [SearchResult] { try await demo.comicUPC(upc, ean5: ean5) }
}
