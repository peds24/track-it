import Foundation
@testable import IrisCore

private struct FixtureFile: Decodable {
    let module: String
    let timezone: String
    let cases: [FixtureCase]
}

private struct FixtureCase: Decodable {
    let name: String
    let fn: String
    let args: [JSON]
    let expect: JSON?
    let `throws`: String?
}

/// shared/fixtures, found from this file: Fixtures/ → IrisCoreTests/ →
/// Tests/ → IrisCore/ → apple/ → repo root.
let fixturesDirectory: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("shared/fixtures")

/// Numbers within 1e-9; a key missing on one side equals null on the other
/// (Swift's encoder omits nil, TS writes null) — shared/README.md.
func fixtureMatches(_ actual: JSON, _ expected: JSON) -> Bool {
    switch (actual, expected) {
    case let (.number(a), .number(b)): return abs(a - b) <= 1e-9
    case let (.array(a), .array(b)): return a.count == b.count && zip(a, b).allSatisfy(fixtureMatches)
    case let (.object(a), .object(b)):
        return Set(a.keys).union(b.keys).allSatisfy { fixtureMatches(a[$0] ?? .null, b[$0] ?? .null) }
    default: return actual == expected
    }
}

/// Runs every case of one module; returns one line per failing case. A case
/// whose `fn` has no registry entry fails — it is never skipped.
func runFixtures(_ module: String, _ registry: [String: FixtureFn]) throws -> [String] {
    let url = fixturesDirectory.appendingPathComponent("\(module).json")
    let file = try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url))
    guard file.timezone == "UTC" else { return ["\(module): fixtures recorded in \(file.timezone), expected UTC"] }
    var failures: [String] = []
    for c in file.cases {
        guard let fn = registry[c.fn] else {
            failures.append("\(c.name): no Swift registry entry for \(c.fn)")
            continue
        }
        do {
            let got = try fn(c.args)
            if let t = c.throws {
                failures.append("\(c.name): expected throw \"\(t)\", got \(got)")
            } else if !fixtureMatches(got, c.expect ?? .null) {
                failures.append("\(c.name): expected \(c.expect ?? .null), got \(got)")
            }
        } catch let error as DomainError {
            if error.message != c.throws {
                failures.append("\(c.name): threw \"\(error.message)\", expected \(c.throws.map { "\"\($0)\"" } ?? "a value")")
            }
        } catch {
            failures.append("\(c.name): \(error)")
        }
    }
    return failures
}
