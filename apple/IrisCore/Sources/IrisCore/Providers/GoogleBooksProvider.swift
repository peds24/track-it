import Foundation

/// Port of src/providers/googleBooks.ts — `book`, `manga`, `comic`, one category per instance.
public struct GoogleBooksProvider: PreviewingProvider, DetailsProvider {
    public let id = "google-books"
    private let fixedCategory: Category
    private let apiKey: String?
    private let http: HTTPClient

    public init(category: Category, apiKey: String?, http: HTTPClient) {
        self.fixedCategory = category; self.apiKey = apiKey?.isEmpty == false ? apiKey : nil; self.http = http
    }

    public var category: Category? { fixedCategory }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        guard let key = apiKey else { throw DomainError("Google Books search needs EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY") }

        func fetchShelf(_ q: String) async throws -> [JSONValue] {
            let url = "https://www.googleapis.com/books/v1/volumes?q=\(encodeURIComponent(q))&printType=books&maxResults=40&key=\(encodeURIComponent(key))"
            let response = try await http.fetch(HTTPRequest(url: url))
            guard response.ok else { throw DomainError("Google Books search failed: \(response.status)") }
            return (try response.json()["items"]?.array ?? []).filter(isShelfBook)
        }

        var items: [JSONValue]
        if trimmed.wholeMatch(of: jsRegex(#/\d{10}(\d{3})?/#)) != nil {
            items = try await fetchShelf("isbn:\(trimmed)")
        } else {
            items = try await fetchShelf("intitle:\(trimmed)")
            if items.isEmpty { items = try await fetchShelf(trimmed) }
        }
        // A25: a cover and an author first; a stable sort keeps Google's relevance order otherwise.
        let ranked = items.enumerated()
            .sorted { a, b in
                let (ra, rb) = (completeness(a.element), completeness(b.element))
                return ra != rb ? ra > rb : a.offset < b.offset
            }
            .map(\.element)
        return dedupe(ranked).map { item in
            let info = item["volumeInfo"]
            let links = info?["imageLinks"]
            return SearchResult(
                id: jsString(item["id"]), title: info?["title"]?.string ?? "", category: fixedCategory, count: 1,
                creator: authorsOf(info?["authors"]?.array), year: yearOf(info?["publishedDate"]?.string),
                thumbnailUrl: googleBooksImage(links?["thumbnail"]?.string ?? links?["smallThumbnail"]?.string, width: 200)
            )
        }
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        var draft = try generateEntries(result)
        if result.id == id { return draft }
        draft.externalSource = id
        draft.externalId = result.id
        return draft
    }

    /// A17: year and pages for a picked book; falls back to the picked title.
    public func preview(_ result: SearchResult) async -> MatchPreview {
        let fallback = MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: nil)
        if result.id == id { return fallback } // hand-typed title, no real match.
        guard case let .found(info) = await fetchVolume(result.id) else { return fallback }
        let metadata = metadataOf(info)
        let pages = info["pageCount"]
        let metaLine = [metadata.releaseYear, pages?.truthy == true ? "\(jsString(pages)) pages" : nil].compactMap { $0 }
        return MatchPreview(title: result.title, metaLine: metaLine, blurb: metadata.description, metadata: metadata)
    }

    /// A22: a 404 answers with empty metadata (stamp it); other failures retry later (nil).
    public func details(_ externalId: String) async -> TrackMetadata? {
        switch await fetchVolume(externalId) {
        case .gone: TrackMetadata(coverUrl: nil, creator: nil, description: nil, releaseYear: nil)
        case let .found(info): metadataOf(info)
        case .failed: nil
        }
    }

    private enum Volume { case found(JSONValue), gone, failed }

    private func fetchVolume(_ volumeId: String) async -> Volume {
        guard let key = apiKey else { return .failed }
        let url = "https://www.googleapis.com/books/v1/volumes/\(encodeURIComponent(volumeId))?key=\(encodeURIComponent(key))"
        guard let response = try? await http.fetch(HTTPRequest(url: url)) else { return .failed }
        if response.status == 404 { return .gone }
        guard response.ok, let body = try? response.json() else { return .failed }
        return .found(body["volumeInfo"] ?? .object([:]))
    }
}

/// A25: a real, ISBN-bearing book — not a journal, report, or a summary of the book.
private func isShelfBook(_ item: JSONValue) -> Bool {
    guard let title = item["volumeInfo"]?["title"]?.string else { return false }
    let hasIsbn = (item["volumeInfo"]?["industryIdentifiers"]?.array ?? []).contains {
        ($0["type"]?.string ?? "").wholeMatch(of: jsRegex(#/ISBN_(10|13)/#)) != nil
    }
    let knockoff = title.firstMatch(of: jsRegex(#/^(summary|study guide|workbook)\b|\bsummary (and|&) analysis\b|\bstudy guide\b|\bbook club (kit|in a box)\b|\b(movie|book) review$/#).ignoresCase()) != nil
    return hasIsbn && !knockoff
}

private func completeness(_ item: JSONValue) -> Int {
    let info = item["volumeInfo"]
    return (info?["imageLinks"]?.truthy == true ? 2 : 0) + (info?["authors"]?.array?.isEmpty == false ? 1 : 0)
}

/// A25: the same title by the same first author lists once — the best-ranked one.
private func dedupe(_ items: [JSONValue]) -> [JSONValue] {
    var seen = Set<String>()
    return items.filter { item in
        let info = item["volumeInfo"]
        let key = "\(jsTrim(info?["title"]?.string ?? "").lowercased())|\((info?["authors"]?.array?.first?.string ?? "").lowercased())"
        return seen.insert(key).inserted
    }
}

/// `authors.join(', ')`, or nil for none — JS join writes null as "".
private func authorsOf(_ authors: [JSONValue]?) -> String? {
    guard let authors, !authors.isEmpty else { return nil }
    return authors.map { $0 == .null ? "" : jsString($0) }.joined(separator: ", ")
}

private func metadataOf(_ info: JSONValue) -> TrackMetadata {
    let links = info["imageLinks"]
    return withGenres(
        TrackMetadata(
            coverUrl: sharpCoverUrl(links?["thumbnail"]?.string ?? links?["smallThumbnail"]?.string),
            creator: authorsOf(info["authors"]?.array), description: cleanDescription(info["description"]?.string),
            releaseYear: yearOf(info["publishedDate"]?.string)
        ),
        info["categories"]?.array?.map { $0.string }
    )
}
