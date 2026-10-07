import Foundation

/// Port of src/providers/tmdb.ts — `show` and `movie`, one category per instance.
public struct TMDBProvider: PreviewingProvider, DetailsProvider {
    public let id = "tmdb"
    private let fixedCategory: Category
    private let apiKey: String?
    private let http: HTTPClient

    public init(category: Category, apiKey: String?, http: HTTPClient) {
        self.fixedCategory = category; self.apiKey = apiKey?.isEmpty == false ? apiKey : nil; self.http = http
    }

    public var category: Category? { fixedCategory }
    private var endpoint: String { fixedCategory == .show ? "tv" : "movie" }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        guard let key = apiKey else { throw DomainError("TMDB search needs EXPO_PUBLIC_TMDB_API_KEY") }
        let url = "https://api.themoviedb.org/3/search/\(endpoint)?api_key=\(encodeURIComponent(key))&query=\(encodeURIComponent(trimmed))"
        let response = try await http.fetch(HTTPRequest(url: url))
        guard response.ok else { throw DomainError("TMDB search failed: \(response.status)") }
        let body = try response.json()
        return (body["results"]?.array ?? []).compactMap { hit in
            guard let title = (fixedCategory == .show ? hit["name"] : hit["title"])?.string else { return nil }
            return SearchResult(
                id: jsString(hit["id"]), title: title, category: fixedCategory, count: 1,
                year: yearOf((fixedCategory == .show ? hit["first_air_date"] : hit["release_date"])?.string),
                thumbnailUrl: tmdbImage(hit["poster_path"]?.string, size: "w185")
            )
        }
    }

    /// A11: a matched show's ongoing comes from TMDB's status; an unmatched title is manual.
    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        let matched = result.id != id
        if fixedCategory != .show || !matched {
            var draft = try generateEntries(result)
            if matched { draft.externalSource = id; draft.externalId = result.id }
            return draft
        }
        let detail = await fetchShowDetail(result.id)
        var input = result
        if let detail { input.count = detail.total ?? result.count; input.ongoing = detail.ongoing }
        var draft = try generateEntries(input)
        if let detail {
            if !detail.seasons.isEmpty { draft.seasons = detail.seasons }
            draft.metaLine = detail.metaLine
            draft.blurb = detail.blurb
            draft.metadata = detail.metadata
        }
        draft.externalSource = id
        draft.externalId = result.id
        return draft
    }

    /// A17: a movie's whole confirm-screen answer; falls back to the picked title.
    public func preview(_ result: SearchResult) async -> MatchPreview {
        let fallback = MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: nil)
        guard let body = await fetchMovieDetail(result.id) else { return fallback }
        let metadata = Self.movieMetadata(body)
        return MatchPreview(title: result.title, metaLine: metadata.releaseYear.map { [$0] } ?? [], blurb: metadata.description, metadata: metadata)
    }

    /// A22: the backfill's lookup, per category.
    public func details(_ externalId: String) async -> TrackMetadata? {
        if fixedCategory == .show { return await fetchShowDetail(externalId)?.metadata }
        return await fetchMovieDetail(externalId).map(Self.movieMetadata)
    }

    // MARK: Lookups — never throw; nil means failed or no key configured.

    private func get(_ url: String) async -> JSONValue? {
        guard let response = try? await http.fetch(HTTPRequest(url: url)), response.ok else { return nil }
        return try? response.json()
    }

    private func fetchMovieDetail(_ movieId: String) async -> JSONValue? {
        guard let key = apiKey else { return nil }
        return await get("https://api.themoviedb.org/3/movie/\(encodeURIComponent(movieId))?api_key=\(encodeURIComponent(key))&append_to_response=credits")
    }

    private static func movieMetadata(_ body: JSONValue) -> TrackMetadata {
        let directors = (body["credits"]?["crew"]?.array ?? []).filter { $0["job"]?.string == "Director" }
        return withGenres(
            TrackMetadata(
                coverUrl: tmdbImage(body["poster_path"]?.string, size: "w780"), creator: namesOf(directors),
                description: cleanDescription(body["overview"]?.string), releaseYear: yearOf(body["release_date"]?.string)
            ),
            body["genres"]?.array?.map { $0["name"]?.string }
        )
    }

    private struct ShowDetail {
        var total: Double?
        var ongoing: Bool
        var seasons: [SeasonBoundary]
        var metaLine: [String]
        var blurb: String?
        var metadata: TrackMetadata
    }

    private func fetchShowDetail(_ showId: String) async -> ShowDetail? {
        guard let key = apiKey,
              let body = await get("https://api.themoviedb.org/3/tv/\(encodeURIComponent(showId))?api_key=\(encodeURIComponent(key))")
        else { return nil }
        let seasons = body["seasons"]?.array ?? []
        let breakdown = seasonBreakdown(seasons)
        let total = sumEpisodeCount(seasons)
        // "Ended"/"Canceled" mean no more episodes are coming; anything else means there are.
        let status = body["status"]?.string
        let ongoing = status != "Ended" && status != "Canceled"
        let startYear = yearOf(body["first_air_date"]?.string)
        let endYear = yearOf(body["last_air_date"]?.string)
        let yearRange: String? = startYear.map { start in
            if ongoing { return "\(start)–present" }
            if let end = endYear, end != start { return "\(start)–\(end)" }
            return start
        }
        let metaLine = [
            yearRange,
            breakdown.isEmpty ? nil : "\(breakdown.count) season\(breakdown.count == 1 ? "" : "s")",
            total > 0 ? "\(jsNumberString(total)) episode\(total == 1 ? "" : "s")" : nil,
            ongoing ? "Ongoing" : status,
        ].compactMap { $0 }
        return ShowDetail(
            total: total > 0 ? total : nil, ongoing: ongoing, seasons: breakdown, metaLine: metaLine,
            blurb: cleanDescription(body["overview"]?.string),
            metadata: withGenres(
                TrackMetadata(
                    coverUrl: tmdbImage(body["poster_path"]?.string, size: "w780"), creator: namesOf(body["created_by"]?.array),
                    description: cleanDescription(body["overview"]?.string), releaseYear: startYear
                ),
                body["genres"]?.array?.map { $0["name"]?.string }
            )
        )
    }
}

/// `people.map(p => p.name).filter(Boolean).join(', ')`, or nil.
func namesOf(_ people: [JSONValue]?) -> String? {
    let names = (people ?? []).compactMap { $0["name"]?.string }.filter { !$0.isEmpty }
    return names.isEmpty ? nil : names.joined(separator: ", ")
}

/// Season 0 is specials — excluded (D1: still a flat episode count).
public func sumEpisodeCount(_ seasons: [JSONValue]) -> Double {
    seasons.filter { $0["season_number"]?.number != 0 }.reduce(0) { $0 + ($1["episode_count"]?.number ?? 0) }
}

/// A11: the per-season breakdown for the segmented bar.
public func seasonBreakdown(_ seasons: [JSONValue]) -> [SeasonBoundary] {
    seasons.filter { $0["season_number"]?.number != 0 }.map {
        SeasonBoundary(number: Int(exactly: $0["season_number"]?.number ?? 0) ?? 0, episodeCount: Int(exactly: $0["episode_count"]?.number ?? 0) ?? 0)
    }
}
