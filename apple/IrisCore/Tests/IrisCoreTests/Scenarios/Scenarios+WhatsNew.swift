import GRDB
@testable import IrisCore

let whatsNewCalls: [String: ScenarioCall] = [
    "markAnnounced": { q, a in let v: String = try arg(a, 0); try write(q) { try markAnnounced($0, version: v) }; return .null },
    "pendingAnnouncement": { q, a in
        let (v, notes): (String, [ReleaseNote]) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try pendingAnnouncement($0, version: v, notes: notes) })
    },
]

/// Raw SQL steps (test setup/inspection), shared by every area.
let sqlCalls: [String: ScenarioCall] = [
    "sql": { q, a in
        let (sql, params): (String, [JSONValue]?) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try $0.execute(sql: sql, arguments: StatementArguments((params ?? []).map(\.databaseValue))) }
        return .null
    },
    "query": { q, a in
        let (sql, params): (String, [JSONValue]?) = (try arg(a, 0), try arg(a, 1))
        // Row isn't Sendable: turn rows into JSON inside the read.
        let rows = try await q.read { try Row.fetchAll($0, sql: sql, arguments: StatementArguments((params ?? []).map(\.databaseValue))).map(rowJSONForQuery) }
        return .array(rows)
    },
]
