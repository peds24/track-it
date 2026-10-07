import Foundation

private let baseURL = "https://metron.cloud/api"

/// The TS encoder, byte for byte: UTF-16 code units, each surrogate encoded on
/// its own as 3 bytes (no pair joining) — so a password matches across platforms.
func metronBase64(_ input: String) -> String {
    var bytes: [Int] = []
    for unit in input.utf16 {
        let code = Int(unit)
        if code < 0x80 { bytes.append(code) }
        else if code < 0x800 { bytes += [0xC0 | (code >> 6), 0x80 | (code & 0x3F)] }
        else { bytes += [0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F)] }
    }
    let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
    var out = ""
    for i in stride(from: 0, to: bytes.count, by: 3) {
        let b0 = bytes[i]
        let b1 = i + 1 < bytes.count ? bytes[i + 1] : nil
        let b2 = i + 2 < bytes.count ? bytes[i + 2] : nil
        out.append(chars[b0 >> 2])
        out.append(chars[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)])
        if let b1 { out.append(chars[((b1 & 0x0F) << 2) | ((b2 ?? 0) >> 6)]) } else { out.append("=") }
        if let b2 { out.append(chars[b2 & 0x3F]) } else { out.append("=") }
    }
    return out
}

/// Port of src/providers/metron.ts — comic issues; HTTP Basic auth.
public struct MetronProvider: DetailsProvider, UnitProvider {
    public let id = "metron"
    public var category: Category? { nil }
    private let username: String?
    private let password: String?
    private let http: HTTPClient

    public init(username: String?, password: String?, http: HTTPClient) {
        self.username = username?.isEmpty == false ? username : nil
        self.password = password?.isEmpty == false ? password : nil
        self.http = http
    }

    private func get(_ path: String) async throws -> JSONValue {
        guard let username, let password else {
            throw DomainError("Metron search needs EXPO_PUBLIC_METRON_USERNAME/EXPO_PUBLIC_METRON_PASSWORD")
        }
        let auth = "Basic \(metronBase64("\(username):\(password)"))"
        let response = try await http.fetch(HTTPRequest(url: "\(baseURL)\(path)", headers: ["Authorization": auth]))
        guard response.ok else { throw DomainError("Metron request failed: \(response.status)") }
        return try response.json()
    }

    /// The series an issue belongs to, by the issue's own `series.id`.
    private func seriesOf(_ issue: JSONValue) async throws -> JSONValue {
        try await get("/series/\(encodeURIComponent(jsString(issue["series"]?["id"])))/")
    }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        return toResults(try await get("/issue/?series_name=\(encodeURIComponent(trimmed))"))
    }

    /// A9: UPC-A + EAN-5 → exact match; UPC-A alone (or a blank EAN-5) → prefix match.
    public func searchByUpc(_ upcA: String, ean5: String?) async throws -> [SearchResult] {
        let upc = jsTrim(upcA)
        let supplement = ean5.map(jsTrim) ?? ""
        let param = supplement.isEmpty
            ? "upc_starts_with=\(encodeURIComponent(upc))"
            : "upc=\(encodeURIComponent(upc + supplement))"
        return toResults(try await get("/issue/?\(param)"))
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        if result.id == id { return try generateEntries(result) } // no real match — typed title.
        let issue = try await get("/issue/\(encodeURIComponent(result.id))/")
        let series = try await seriesOf(issue)
        let total = series["issue_count"]?.number ?? 0
        let yearEnd = series["year_end"]
        let ongoing = yearEnd == nil || yearEnd == .null
        var input = result
        input.title = issue["series"]?["name"]?.string ?? result.title
        input.count = total > 0 ? total : result.count
        input.ongoing = ongoing
        var draft = try generateEntries(input)
        let began = series["year_began"]
        var yearRange: String?
        if let began, began.truthy {
            if ongoing { yearRange = "\(jsString(began))–present" }
            else if let yearEnd, yearEnd.truthy, yearEnd != began { yearRange = "\(jsString(began))–\(jsString(yearEnd))" }
            else { yearRange = jsString(began) }
        }
        draft.metaLine = [
            series["publisher"]?["name"]?.string,
            yearRange,
            total > 0 ? "\(jsNumberString(total)) issue\(total == 1 ? "" : "s")" : nil,
            ongoing ? "Ongoing" : "Completed",
        ].compactMap { $0 }
        draft.externalSource = id
        draft.externalId = result.id
        draft.blurb = cleanDescription(series["desc"]?.string)
        draft.metadata = metronMetadata(issue, series)
        return draft
    }

    /// A22: the backfill's lookup — never throws.
    public func details(_ externalId: String) async -> TrackMetadata? {
        guard let issue = try? await get("/issue/\(encodeURIComponent(externalId))/"),
              let series = try? await seriesOf(issue) else { return nil }
        return metronMetadata(issue, series)
    }

    /// A25: the issue numbered `ordinal` in the series `externalId` belongs to.
    public func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? {
        guard let issue = try? await get("/issue/\(encodeURIComponent(externalId))/"),
              let body = try? await get("/issue/?series_id=\(encodeURIComponent(jsString(issue["series"]?["id"])))&number=\(encodeURIComponent(String(ordinal)))"),
              let hit = body["results"]?.array?.first else { return nil }
        return UnitRecord(externalId: jsString(hit["id"]), number: hit["number"]?.string ?? jsString(hit["number"]), coverUrl: hit["image"]?.string)
    }
}

private func toResults(_ body: JSONValue) -> [SearchResult] {
    (body["results"]?.array ?? []).map { item in
        SearchResult(id: jsString(item["id"]), title: item["issue"]?.string ?? "", category: .comic, count: 1,
                     year: yearOf(item["cover_date"]?.string), thumbnailUrl: item["image"]?.string)
    }
}

/// Writer credits; a "Story" credit counts as writing. Each name once, first place kept.
private func writersOf(_ credits: [JSONValue]?) -> String? {
    var seen = Set<String>()
    let names = (credits ?? [])
        .filter { ($0["role"]?.array ?? []).contains { ($0["name"]?.string ?? "").firstMatch(of: jsRegex(#/writer|story/#).ignoresCase()) != nil } }
        .compactMap { $0["creator"]?.string }
        .filter { !$0.isEmpty && seen.insert($0).inserted }
    return names.isEmpty ? nil : names.joined(separator: ", ")
}

private func metronMetadata(_ issue: JSONValue, _ series: JSONValue) -> TrackMetadata {
    let began = series["year_began"]
    return withGenres(
        TrackMetadata(
            coverUrl: issue["image"]?.string, creator: writersOf(issue["credits"]?.array),
            description: cleanDescription(series["desc"]?.string),
            releaseYear: began?.truthy == true ? jsString(began) : nil
        ),
        series["genres"]?.array?.map { $0["name"]?.string }
    )
}
