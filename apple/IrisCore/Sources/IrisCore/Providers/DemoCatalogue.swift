import Foundation

/// Canned catalogue answers (I9): unit tests and DEBUG `-IrisCatalogue demo`
/// run the Add flow with no network (spec §10). Not a fixture of any real
/// provider — plain values in the shapes the real ones return.
public struct DemoCatalogue: Sendable {
    public init() {}

    public func provider(for key: AddCatalogueKey) -> DemoProvider { DemoProvider(key: key) }

    /// A11: a manga ISBN resolves through Google Books, whose title carries the volume bare.
    public func mangaISBN(_ isbn: String) async throws -> [SearchResult] {
        [SearchResult(id: "gb-aot-30", title: "Attack on Titan 30", category: .manga, count: 1, creator: "Hajime Isayama", year: "2019")]
    }

    /// A9: a single issue by UPC-A (and its EAN-5, when given).
    public func comicUPC(_ upc: String, ean5: String?) async throws -> [SearchResult] {
        [SearchResult(id: "metron-saga", title: "Saga", category: .comic, count: nil, ongoing: true, creator: "Brian K. Vaughan", year: "2012")]
    }
}

public struct DemoProvider: PreviewingProvider {
    let key: AddCatalogueKey
    public var id: String { "demo" }
    public var category: Category? {
        if case let .category(c) = key { return c }
        return .comic
    }

    private var catalogue: [SearchResult] {
        switch key {
        case .category(.show):
            [SearchResult(id: "demo-expanse", title: "The Expanse", category: .show, count: 23, creator: "Mark Fergus", year: "2015"),
             SearchResult(id: "demo-andor", title: "Andor", category: .show, count: 24, creator: "Tony Gilroy", year: "2022")]
        case .category(.movie):
            [SearchResult(id: "demo-dune2", title: "Dune: Part Two", category: .movie, count: 1, creator: "Denis Villeneuve", year: "2024"),
             SearchResult(id: "demo-arrival", title: "Arrival", category: .movie, count: 1, creator: "Denis Villeneuve", year: "2016")]
        case .category(.book):
            [SearchResult(id: "demo-hailmary", title: "Project Hail Mary", category: .book, count: 1, creator: "Andy Weir", year: "2021"),
             SearchResult(id: "demo-martian", title: "The Martian", category: .book, count: 1, creator: "Andy Weir", year: "2011")]
        case .category(.comic):
            [SearchResult(id: "demo-saga", title: "Saga", category: .comic, count: nil, ongoing: true, creator: "Brian K. Vaughan", year: "2012")]
        case .category(.manga):
            [SearchResult(id: "demo-aot", title: "Attack on Titan", category: .manga, count: 34, creator: "Hajime Isayama", year: "2009")]
        case .comicCollection:
            [SearchResult(id: "demo-saga-v1", title: "Saga, Volume One", category: .comic, count: 1, creator: "Brian K. Vaughan", year: "2012")]
        }
    }

    public func search(_ query: String) async throws -> [SearchResult] {
        let q = query.lowercased()
        return catalogue.filter { $0.title.lowercased().contains(q) || q.contains($0.title.lowercased()) }
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        var draft = try generateEntries(result.id == id ? result : SearchResult(
            id: result.id, title: result.title, category: result.category, count: result.count ?? 3,
            ongoing: result.ongoing, creator: result.creator, year: result.year))
        draft.externalSource = "demo"
        draft.externalId = result.id
        draft.metadata = TrackMetadata(creator: result.creator, description: Self.blurb(result.title), releaseYear: result.year)
        draft.metaLine = [result.year, result.count.map { "\(Int($0)) \(draft.unitLabel.rawValue)s" }].compactMap { $0 }
        draft.blurb = Self.blurb(result.title)
        if result.id == "demo-expanse" {
            draft.seasons = [SeasonBoundary(number: 1, episodeCount: 10), SeasonBoundary(number: 2, episodeCount: 13)]
            draft.metaLine = ["2015", "2 seasons"]
        }
        return draft
    }

    public func preview(_ result: SearchResult) async -> MatchPreview {
        MatchPreview(title: result.title, metaLine: [result.year].compactMap { $0 }, blurb: Self.blurb(result.title),
                     metadata: TrackMetadata(creator: result.creator, description: Self.blurb(result.title), releaseYear: result.year))
    }

    private static func blurb(_ title: String) -> String { "A demo catalogue entry for \(title), so the confirm screen has something to show." }
}
