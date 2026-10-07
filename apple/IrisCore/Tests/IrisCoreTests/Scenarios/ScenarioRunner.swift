import Foundation
import GRDB
@testable import IrisCore

typealias ScenarioCall = @Sendable (DatabaseQueue, [JSON]) async throws -> JSON

private struct ScenarioFile: Decodable {
    let area: String
    let timezone: String
    let scenarios: [RecordedScenario]
}

private struct RecordedScenario: Decodable {
    let name: String
    let steps: [RecordedStep]
    let dump: JSON
}

private struct RecordedStep: Decodable {
    let call: String
    let args: [JSON]
    let result: JSON?
    let `throws`: String?
}

let scenariosDirectory = fixturesDirectory.deletingLastPathComponent().appendingPathComponent("scenarios")

/// `{ "$ref": n, "path": "a.0.b", "json": true }` → the value from step n.
private func resolve(_ value: JSON, _ results: [JSON]) -> JSON {
    switch value {
    case let .array(items): return .array(items.map { resolve($0, results) })
    case let .object(o):
        guard case let .number(n)? = o["$ref"] else { return .object(o.mapValues { resolve($0, results) }) }
        var v = results[Int(n)]
        if case let .string(path)? = o["path"] {
            for key in path.split(separator: ".") {
                switch v {
                case let .array(a): v = Int(key).flatMap { $0 < a.count ? a[$0] : nil } ?? .null
                case let .object(fields): v = fields[String(key)] ?? .null
                default: v = .null
                }
            }
        }
        if case .bool(true)? = o["json"] { return .string(v.description) }
        return v
    default: return value
    }
}

/// Mirrors play.ts: ids → `#n` in insertion order (series, then entry, by rowid).
private final class IdTokens {
    private var order: [String] = []
    private var tokens: [String: String] = [:]

    func learn(_ queue: DatabaseQueue) throws {
        let ids = try queue.read { db in
            try String.fetchAll(db, sql: "SELECT id FROM series ORDER BY rowid")
                + String.fetchAll(db, sql: "SELECT id FROM entry ORDER BY rowid")
        }
        for id in ids where tokens[id] == nil {
            order.append(id)
            tokens[id] = "#\(order.count)"
        }
    }

    func normalize(_ value: JSON) -> JSON {
        switch value {
        case let .string(s):
            var out = s
            for id in order.sorted(by: { $0.count > $1.count }) { out = out.replacingOccurrences(of: id, with: tokens[id]!) }
            return .string(out)
        case let .array(a): return .array(a.map(normalize))
        // Keys too: allScores is keyed by `kind:id` (mirrors play.ts).
        case let .object(o):
            var out: [String: JSON] = [:]
            for (k, v) in o { if case let .string(key) = normalize(.string(k)) { out[key] = normalize(v) } }
            return .object(out)
        default: return value
        }
    }
}

/// A row as JSON, the way better-sqlite3 returns it (ints and reals as numbers).
func rowJSONForQuery(_ row: Row) -> JSON {
    var object: [String: JSON] = [:]
    for (column, value) in row {
        switch value.storage {
        case .null: object[column] = .null
        case let .int64(i): object[column] = .number(Double(i))
        case let .double(d): object[column] = .number(d)
        case let .string(s): object[column] = .string(s)
        case .blob: object[column] = .string("<blob>")
        }
    }
    return .object(object)
}

private func dump(_ queue: DatabaseQueue) throws -> JSON {
    try queue.read { db in
        var tables: [String: JSON] = [:]
        for table in ["series", "entry", "rating", "app_meta"] {
            tables[table] = .array(try Row.fetchAll(db, sql: "SELECT * FROM \(table) ORDER BY rowid").map(rowJSONForQuery))
        }
        return .object(tables)
    }
}

/// Replays every scenario of one area; returns one line per divergence. A
/// call with no Swift entry fails, never skips.
func runScenarios(_ area: String, _ calls: [String: ScenarioCall]) async throws -> [String] {
    let url = scenariosDirectory.appendingPathComponent("\(area).json")
    let file = try JSONDecoder().decode(ScenarioFile.self, from: Data(contentsOf: url))
    guard file.timezone == "UTC" else { return ["\(area): recorded in \(file.timezone), expected UTC"] }
    var failures: [String] = []
    for scenario in file.scenarios {
        let queue = try DatabaseQueue()
        try await queue.write { try migrate($0) }
        let ids = IdTokens()
        var results: [JSON] = []
        for (i, step) in scenario.steps.enumerated() {
            let label = "\(scenario.name) — step \(i) \(step.call)"
            guard let call = calls[step.call] else {
                failures.append("\(label): no Swift scenario call")
                results.append(.null)
                continue
            }
            do {
                let raw = try await call(queue, step.args.map { resolve($0, results) })
                results.append(raw)
                try ids.learn(queue)
                let got = ids.normalize(raw)
                if let t = step.throws { failures.append("\(label): expected throw \"\(t)\", got \(got)") }
                else if !fixtureMatches(got, step.result ?? .null) { failures.append("\(label): expected \(step.result ?? .null), got \(got)") }
            } catch {
                results.append(.null)
                try ids.learn(queue)
                let message: String = switch error {
                case let e as DomainError: e.message
                case let e as DatabaseError: e.message ?? "\(e)"
                default: "\(error)"
                }
                let got = ids.normalize(.string(message))
                if got != step.throws.map(JSON.string) {
                    failures.append("\(label): threw \(got), expected \(step.throws.map { "\"\($0)\"" } ?? "a value")")
                }
            }
        }
        let actual = ids.normalize(try dump(queue))
        if !fixtureMatches(actual, scenario.dump) { failures.append("\(scenario.name) — final database: expected \(scenario.dump), got \(actual)") }
    }
    return failures
}

/// Runs `body` as one write transaction, as the app does for each call.
func write<T: Sendable>(_ queue: DatabaseQueue, _ body: @escaping @Sendable (Database) throws -> T) throws -> T {
    try queue.write(body)
}
