import Foundation
import GRDB

/// Untyped JSON, for validating a backup field by field the way backup.ts
/// does (`typeof value === 'string'`, …) before trusting any of it.
public enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
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

    var string: String? { if case let .string(s) = self { s } else { nil } }
    var object: [String: JSONValue]? { if case let .object(o) = self { o } else { nil } }

    /// JS `String(value)`, for messages like "Unsupported backup version: 2".
    var jsDescription: String {
        switch self {
        case .null: "null"
        case let .bool(b): b ? "true" : "false"
        case let .number(n): jsNumberString(n)
        case let .string(s): s
        case .array, .object: "[object Object]"
        }
    }
}

extension JSONValue {
    /// A SQL parameter, as better-sqlite3 binds the same JS value.
    var databaseValue: DatabaseValue {
        switch self {
        case .null: .null
        case let .bool(b): (b ? 1 : 0).databaseValue
        case let .number(n): n == n.rounded() && abs(n) < 9e15 ? Int64(n).databaseValue : n.databaseValue
        case let .string(s): s.databaseValue
        case .array, .object: .null
        }
    }
}
