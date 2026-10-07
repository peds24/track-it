/// Port of src/providers/registry.ts: one provider per category (D10), and
/// the provider behind a stored `external_source` (A22).
public struct ProviderRegistry: Sendable {
    public let keys: ProviderKeys
    public let http: HTTPClient

    public init(keys: ProviderKeys, http: HTTPClient) { self.keys = keys; self.http = http }

    public func provider(for category: Category) -> any MetadataProvider {
        switch category {
        case .book: GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
        case .manga: AniListProvider(http: http)
        case .comic: MetronProvider(username: keys.metronUsername, password: keys.metronPassword, http: http)
        case .show: TMDBProvider(category: .show, apiKey: keys.tmdb, http: http)
        case .movie: TMDBProvider(category: .movie, apiKey: keys.tmdb, http: http)
        }
    }

    public func provider(forSource source: String, category: Category) -> (any MetadataProvider)? {
        switch source {
        case "google-books": GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
        case "tmdb": provider(for: category == .movie ? .movie : .show)
        case "metron": provider(for: .comic)
        case "anilist": provider(for: .manga)
        default: nil
        }
    }
}
