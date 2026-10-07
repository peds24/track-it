import Foundation
@testable import IrisCore

/// Serves recorded responses in order and records every request (Iris I5).
actor FakeHTTP: HTTPClient {
    private var responses: [JSON]
    private(set) var requests: [JSON] = []

    init(_ responses: [JSON]) { self.responses = responses }

    nonisolated func send(_ request: HTTPRequest) async throws -> HTTPResponse { try await serve(request) }

    private func serve(_ request: HTTPRequest) throws -> HTTPResponse {
        let body: JSON = request.body.flatMap { try? JSONDecoder().decode(JSON.self, from: $0) } ?? .null
        requests.append(.object([
            "method": .string(request.method), "url": .string(request.url),
            "headers": .object(request.headers.mapValues(JSON.string)), "body": body,
        ]))
        guard !responses.isEmpty else { throw URLError(.resourceUnavailable) }
        let next = responses.removeFirst()
        guard case let .object(o) = next else { throw URLError(.badServerResponse) }
        if case .bool(true)? = o["networkError"] { throw URLError(.notConnectedToInternet) }
        let status: Int = if case let .number(n)? = o["status"] { Int(n) } else { 200 }
        let data = try JSONEncoder().encode(o["body"] ?? .null)
        return HTTPResponse(status: status, body: data)
    }

    var unused: Int { responses.count }
}
