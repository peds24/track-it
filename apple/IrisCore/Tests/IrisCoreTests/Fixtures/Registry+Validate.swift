@testable import IrisCore

let validateFixtures: [String: FixtureFn] = [
    "isStandaloneMediaType": { a in try toJSON(isStandaloneMediaType(arg(a, 0))) },
    "isIsoTimestamp": { a in try toJSON(isIsoTimestamp(arg(a, 0))) },
    "assertIsoTimestamp": { a in try assertIsoTimestamp(arg(a, 0), field: arg(a, 1)); return .null },
    "assertOrdinal": { a in try assertOrdinal(arg(a, 0), field: (arg(a, 1) as String?) ?? "ordinal"); return .null },
    "assertMediaTypeMatchesParent": { a in
        try assertMediaTypeMatchesParent(arg(a, 0), parentUnitLabel: arg(a, 1), label: (arg(a, 2) as String?) ?? "entry")
        return .null
    },
    "assertEntryInvariants": { a in try assertEntryInvariants(arg(a, 0)); return .null },
]
