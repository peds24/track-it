import Foundation

/// A request exactly as the TS providers build it — `url` is the literal string.
public struct HTTPRequest: Sendable, Equatable {
    public var method: String
    public var url: String
    public var headers: [String: String]
    public var body: Data?
    public init(method: String = "GET", url: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method; self.url = url; self.headers = headers; self.body = body
    }
}

public struct HTTPResponse: Sendable {
    public var status: Int
    public var body: Data
    public init(status: Int, body: Data) { self.status = status; self.body = body }
    /// `response.ok`.
    public var ok: Bool { (200..<300).contains(status) }
    /// `await response.json()`.
    public func json() throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: body) }
}

/// The one seam between providers and the network (spec §10: none in tests).
public protocol HTTPClient: Sendable {
    func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

extension HTTPClient {
    /// `fetch`: a transport failure surfaces with React Native fetch's own
    /// message, which is what the TS recordings hold.
    func fetch(_ request: HTTPRequest) async throws -> HTTPResponse {
        do { return try await send(request) } catch let e as DomainError { throw e } catch { throw DomainError("Network request failed") }
    }
}

public struct URLSessionHTTPClient: HTTPClient {
    private let session: URLSession
    public init(session: URLSession = .shared) { self.session = session }

    public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        guard let url = URL(string: request.url) else { throw URLError(.badURL) }
        var r = URLRequest(url: url)
        r.httpMethod = request.method
        r.httpBody = request.body
        for (k, v) in request.headers { r.setValue(v, forHTTPHeaderField: k) }
        let (data, response) = try await session.data(for: r)
        return HTTPResponse(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }
}
