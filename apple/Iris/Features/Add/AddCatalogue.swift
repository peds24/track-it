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
    /// I10: Done and unrated — the rate prompt's test.
    func finishedUnrated(_ ref: TrackRef) async -> Bool
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

/// The real catalogues (I5 providers) behind the Add flow.
struct LiveAddCatalogue: AddCatalogue {
    let registry: ProviderRegistry

    /// D10, plus A14's exception the registry can't express: a comic
    /// collection is Google Books, not Metron.
    func provider(for key: AddCatalogueKey) -> any MetadataProvider {
        switch key {
        case let .category(c): registry.provider(for: c)
        case .comicCollection: GoogleBooksProvider(category: .comic, apiKey: registry.keys.googleBooks, http: registry.http)
        }
    }

    func search(_ query: String, key: AddCatalogueKey) async throws -> [SearchResult] { try await provider(for: key).search(query) }
    func hydrate(_ result: SearchResult, key: AddCatalogueKey) async throws -> SeriesDraft { try await provider(for: key).hydrate(result) }

    /// A17: a provider without preview falls back to the bare title, as TS does.
    func preview(_ result: SearchResult, key: AddCatalogueKey) async -> MatchPreview {
        if let p = provider(for: key) as? any PreviewingProvider { return await p.preview(result) }
        return MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: nil)
    }

    func mangaISBN(_ isbn: String) async throws -> [SearchResult] {
        try await GoogleBooksProvider(category: .manga, apiKey: registry.keys.googleBooks, http: registry.http).search(isbn)
    }

    func comicUPC(_ upc: String, ean5: String?) async throws -> [SearchResult] {
        guard let metron = registry.provider(for: .comic) as? MetronProvider else { return [] }
        return try await metron.searchByUpc(upc, ean5: ean5)
    }
}
