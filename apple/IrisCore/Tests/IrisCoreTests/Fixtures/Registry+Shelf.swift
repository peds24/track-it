@testable import IrisCore

let shelfFixtures: [String: FixtureFn] = [
    "shelfForEntry": { a in try toJSON(shelfForEntry(arg(a, 0))) },
    "shelfForSeries": { a in try toJSON(shelfForSeries(arg(a, 0), paused: (arg(a, 1) as Bool?) ?? false)) },
    "progressFor": { a in try toJSON(progressFor(arg(a, 0))) },
    "nextEntry": { a in try toJSON(nextEntry(arg(a, 0))) },
]
