import Foundation
@testable import IrisCore

private struct RecordingFile: Decodable { let area: String; let cases: [RecordedCase] }
private struct RecordedCase: Decodable {
    let name: String
    let provider: String?
    let env: [String: String]?
    let call: String
    let args: [JSON]
    let responses: [JSON]?
    let requests: [JSON]
    let unusedResponses: Int
    let result: JSON?
    let `throws`: String?
}

/// (provider name, keys, http) → a Swift provider, mirroring makeProvider in shared/providers/registry.ts.
func makeProvider(_ name: String, keys: ProviderKeys, http: HTTPClient) -> (any MetadataProvider)? {
    let registry = ProviderRegistry(keys: keys, http: http)
    switch name {
    case "tmdb-show": return registry.provider(for: .show)
    case "tmdb-movie": return registry.provider(for: .movie)
    case "google-books-book": return GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
    case "google-books-manga": return GoogleBooksProvider(category: .manga, apiKey: keys.googleBooks, http: http)
    case "google-books-comic": return GoogleBooksProvider(category: .comic, apiKey: keys.googleBooks, http: http)
    case "metron": return registry.provider(for: .comic)
    case "anilist": return registry.provider(for: .manga)
    case "manual": return ManualProvider()
    default: return nil
    }
}

typealias RecordingCall = @Sendable ((any MetadataProvider)?, [JSON]) async throws -> JSON

let providersDirectory = fixturesDirectory.deletingLastPathComponent().appendingPathComponent("providers")

/// Replays one area; a case fails if any request differs (count, order,
/// method, URL, headers, body), if responses are left unread or run out, or
/// if the result/throw differs.
func runRecordings(_ area: String, _ calls: [String: RecordingCall]) async throws -> [String] {
    let file = try JSONDecoder().decode(RecordingFile.self, from: Data(contentsOf: providersDirectory.appendingPathComponent("\(area).json")))
    var failures: [String] = []
    for c in file.cases {
        let env = c.env ?? [:]
        let keys = ProviderKeys(tmdb: env["TMDB_API_KEY"], googleBooks: env["GOOGLE_BOOKS_API_KEY"],
                                metronUsername: env["METRON_USERNAME"], metronPassword: env["METRON_PASSWORD"])
        let http = FakeHTTP(c.responses ?? [])
        let provider = c.provider.flatMap { makeProvider($0, keys: keys, http: http) }
        if let name = c.provider, provider == nil { failures.append("\(c.name): no Swift provider \(name)"); continue }
        guard let call = calls[c.call] else { failures.append("\(c.name): no Swift call \(c.call)"); continue }
        var outcome: (JSON?, String?)
        do { outcome = (try await call(provider, c.args), nil) }
        catch let e as DomainError { outcome = (nil, e.message) }
        catch { outcome = (nil, "\(error)") }
        let requests = await http.requests
        if !fixtureMatches(.array(requests), .array(c.requests)) {
            failures.append("\(c.name): requests differ\n  expected \(JSON.array(c.requests))\n  got      \(JSON.array(requests))")
        }
        let unused = await http.unused
        if unused != c.unusedResponses { failures.append("\(c.name): \(unused) responses unread, expected \(c.unusedResponses)") }
        switch (outcome, c.throws) {
        case let ((nil, message?), expected?) where message == expected: break
        case let ((got?, nil), nil) where fixtureMatches(got, c.result ?? .null): break
        default:
            let expected = c.throws.map { "throw \"\($0)\"" } ?? "\(c.result ?? .null)"
            let got = outcome.1.map { "throw \"\($0)\"" } ?? "\(outcome.0 ?? .null)"
            failures.append("\(c.name): expected \(expected), got \(got)")
        }
    }
    return failures
}
