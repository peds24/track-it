import Foundation
import GRDB
@testable import IrisCore

/// Mirrors stubProvider in shared/scenarios/registry.ts: a provider described
/// as data. Swift's optional capabilities are protocol conformances, so the
/// spec picks one of four concrete stubs.
actor CallLog { private(set) var calls: [String] = []; func add(_ c: String) { calls.append(c) } }
actor SleepLog { private(set) var values: [Double] = []; func add(_ v: Double) { values.append(v) } }

private func field(_ j: JSON?, _ key: String) -> JSON? { if case let .object(o)? = j { o[key] } else { nil } }
private func entries(_ j: JSON?) -> [String: JSON] { if case let .object(o)? = j { o } else { [:] } }

/// A `details` answer: metadata, null, or `{ "throws": … }` — a failed lookup
/// either way, since Swift's details never throws and TS's backfill counts a
/// throw as `failed`.
private func detailsAnswer(_ answers: [String: JSON], _ id: String) -> TrackMetadata? {
    guard let a = answers[id], a != .null, field(a, "throws") == nil else { return nil }
    return try? fromJSON(a)
}

private struct NoCapabilities: MetadataProvider {
    let id = "stub"
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
}

private struct DetailsStub: DetailsProvider {
    let id = "stub"; let answers: [String: JSON]; let log: CallLog
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func details(_ externalId: String) async -> TrackMetadata? {
        await log.add("details:\(externalId)")
        return detailsAnswer(answers, externalId)
    }
}

private struct UnitStub: UnitProvider {
    let id = "stub"; let answers: [String: JSON]; let log: CallLog
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? {
        await log.add("unitAt:\(externalId)#\(ordinal)")
        return answers["\(externalId)#\(ordinal)"].flatMap { $0 == .null ? nil : try? fromJSON($0) }
    }
}

private struct BothStub: DetailsProvider, UnitProvider {
    let detailsStub: DetailsStub; let unitStub: UnitStub
    let id = "stub"
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func details(_ externalId: String) async -> TrackMetadata? { await detailsStub.details(externalId) }
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? { await unitStub.unitAt(externalId, ordinal: ordinal) }
}

func stubResolver(_ stubs: JSON, log: CallLog) -> @Sendable (String, IrisCore.Category) -> (any MetadataProvider)? {
    let specs = entries(stubs)
    return { source, _ in
        guard let spec = specs[source] else { return nil }
        let d = field(spec, "details").map { DetailsStub(answers: entries($0), log: log) }
        let u = field(spec, "unitAt").map { UnitStub(answers: entries($0), log: log) }
        switch (d, u) {
        case let (d?, u?): return BothStub(detailsStub: d, unitStub: u)
        case let (d?, nil): return d
        case let (nil, u?): return u
        case (nil, nil): return NoCapabilities()
        }
    }
}

let providerScenarioCalls: [String: ScenarioCall] = [
    "backfillMetadata": { q, a in
        let (stubs, now): (JSON, String) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let sleeps = SleepLog()
        let result = await backfillMetadata(q, resolve: stubResolver(stubs, log: log), now: { now }, sleep: { await sleeps.add($0) })
        return .object([
            "filled": .number(Double(result.filled)), "skipped": .number(Double(result.skipped)), "failed": .number(Double(result.failed)),
            "calls": .array(await log.calls.map(JSON.string)), "sleeps": .array(await sleeps.values.map(JSON.number)),
        ])
    },
    "syncSeriesUnit": { q, a in
        let (id, stubs): (String, JSON) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let changed = await syncSeriesUnit(q, seriesId: id, resolve: stubResolver(stubs, log: log))
        return .object(["changed": .bool(changed), "calls": .array(await log.calls.map(JSON.string))])
    },
    "syncUnitForEntry": { q, a in
        let (id, stubs): (String, JSON) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let changed = await syncUnitForEntry(q, entryId: id, resolve: stubResolver(stubs, log: log))
        return .object(["changed": .bool(changed), "calls": .array(await log.calls.map(JSON.string))])
    },
]
