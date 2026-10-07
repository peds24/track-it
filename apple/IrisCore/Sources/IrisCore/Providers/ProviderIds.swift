/// The id each category's registered provider records as `externalSource`
/// (src/providers/registry.ts). The providers themselves arrive in I5.
public func providerIdFor(_ category: Category) -> String {
    switch category {
    case .book: "google-books"
    case .manga: "anilist"
    case .comic: "metron"
    case .show, .movie: "tmdb"
    }
}
