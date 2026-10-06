import Foundation

/// Any JSON value, so fixtures decode without knowing their shapes up front.
enum JSON: Codable, Equatable, Sendable, CustomStringConvertible {
    case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSON].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .number(n): try c.encode(n)
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    var description: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return (try? String(decoding: encoder.encode(self), as: UTF8.self)) ?? "<unencodable>"
    }
}

struct FixtureError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

typealias FixtureFn = @Sendable ([JSON]) throws -> JSON

func toJSON<T: Encodable>(_ value: T) throws -> JSON {
    try JSONDecoder().decode(JSON.self, from: JSONEncoder().encode(value))
}

func fromJSON<T: Decodable>(_ value: JSON) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
}

/// The i-th positional argument; a TS default parameter left out is `.null`.
func arg<T: Decodable>(_ args: [JSON], _ i: Int) throws -> T {
    try fromJSON(i < args.count ? args[i] : .null)
}

/// Fixtures run under TZ=UTC (shared/README.md); the Swift side passes this calendar.
let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()
