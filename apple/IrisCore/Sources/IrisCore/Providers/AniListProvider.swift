import Foundation

private let endpoint = "https://graphql.anilist.co"
private let staffFields = "staff(perPage: 4, sort: [RELEVANCE]) { edges { role node { name { full } } } }"
// Both queries equal the TS template literals exactly — the recordings compare the request body.
private let searchQuery = """

  query ($search: String) {
    Page(perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english }
        startDate { year }
        coverImage { large }
        \(staffFields)
      }
    }
  }

"""
private let detailQuery = """

  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      volumes
      chapters
      status
      description(asHtml: false)
      genres
      startDate { year }
      endDate { year }
      coverImage { extraLarge large }
      \(staffFields)
    }
  }

"""

/// Port of src/providers/anilist.ts — manga (A11), keyless GraphQL.
public struct AniListProvider: DetailsProvider {
    public let id = "anilist"
    public var category: Category? { nil }
    private let http: HTTPClient

    public init(http: HTTPClient) { self.http = http }

    private func post(_ query: String, _ variables: [String: JSONValue]) async throws -> JSONValue {
        let body = try JSONEncoder().encode(JSONValue.object(["query": .string(query), "variables": .object(variables)]))
        let response = try await http.fetch(HTTPRequest(
            method: "POST", url: endpoint,
            headers: ["Content-Type": "application/json", "Accept": "application/json"], body: body
        ))
        guard response.ok else { throw DomainError("AniList request failed: \(response.status)") }
        return try response.json()
    }

    /// `Number(id)` as JSON.stringify sends it: blank is 0, NaN and ±Infinity are null.
    private func idVariable(_ id: String) -> JSONValue {
        let trimmed = jsTrim(id)
        if trimmed.isEmpty { return .number(0) }
        guard let n = Double(trimmed), n.isFinite else { return .null }
        return .number(n)
    }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        let body = try await post(searchQuery, ["search": .string(trimmed)])
        return (body["data"]?["Page"]?["media"]?.array ?? []).compactMap { hit in
            let titles = hit["title"]
            let english = titles?["english"]
            // `english ?? romaji`, kept only when the winner is a string.
            guard let title = (english == nil || english == .null ? titles?["romaji"] : english)?.string else { return nil }
            let year = hit["startDate"]?["year"]
            return SearchResult(
                id: jsString(hit["id"]), title: title, category: .manga, count: 1, creator: authorOf(hit["staff"]),
                year: year?.truthy == true ? jsString(year) : nil, thumbnailUrl: hit["coverImage"]?["large"]?.string
            )
        }
    }

    /// Real volumes (else chapters) and status; a failure propagates, as in TS.
    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        if result.id == id { return try generateEntries(result) } // no real match — typed title.
        let body = try await post(detailQuery, ["id": idVariable(result.id)])
        let media = nonNull(body["data"]?["Media"])
        let status = media?["status"]?.string
        let ongoing = status == "RELEASING" || status == "NOT_YET_RELEASED"
        let volumes = nonNull(media?["volumes"])
        let total = (volumes ?? media?["chapters"])?.number
        var input = result
        input.count = !ongoing && (total ?? 0) > 0 ? total : result.count
        input.ongoing = ongoing
        var draft = try generateEntries(input)
        let start = nonNull(media?["startDate"]?["year"])
        let end = nonNull(media?["endDate"]?["year"])
        var yearRange: String?
        if let start, start.truthy {
            if ongoing { yearRange = "\(jsString(start))–present" }
            else if let end, end.truthy, end != start { yearRange = "\(jsString(start))–\(jsString(end))" }
            else { yearRange = jsString(start) }
        }
        var countLabel: String?
        if let total, total > 0 {
            countLabel = "\(jsNumberString(total)) \(volumes?.truthy == true ? "volume" : "chapter")\(total == 1 ? "" : "s")"
        }
        draft.metaLine = [yearRange, countLabel, ongoing ? "Ongoing" : "Completed"].compactMap { $0 }
        draft.externalSource = id
        draft.externalId = result.id
        draft.blurb = cleanDescription(media?["description"]?.string)
        draft.metadata = media.map(anilistMetadata)
        return draft
    }

    /// A22: the backfill's lookup — never throws.
    public func details(_ externalId: String) async -> TrackMetadata? {
        guard let body = try? await post(detailQuery, ["id": idVariable(externalId)]),
              let media = nonNull(body["data"]?["Media"]), media.truthy else { return nil }
        return anilistMetadata(media)
    }
}

/// `value ?? …` treats null like absent.
private func nonNull(_ value: JSONValue?) -> JSONValue? { value == .null ? nil : value }

/// The story credit ("Story", "Story & Art") is the author; else the first credit.
private func authorOf(_ staff: JSONValue?) -> String? {
    let edges = staff?["edges"]?.array ?? []
    let story = edges.first { ($0["role"]?.string ?? "").firstMatch(of: jsRegex(#/story/#).ignoresCase()) != nil } ?? edges.first
    return story?["node"]?["name"]?["full"]?.string
}

private func anilistMetadata(_ media: JSONValue) -> TrackMetadata {
    let cover = media["coverImage"]
    let year = media["startDate"]?["year"]
    return withGenres(
        TrackMetadata(
            // A25: `extraLarge` — AniList's `large` is blurry on the detail screen.
            coverUrl: cover?["extraLarge"]?.string ?? cover?["large"]?.string, creator: authorOf(media["staff"]),
            description: cleanDescription(media["description"]?.string),
            releaseYear: year?.truthy == true ? jsString(year) : nil
        ),
        media["genres"]?.array?.map { $0.string }
    )
}
