@testable import IrisCore

let modeFixtures: [String: FixtureFn] = [
    "modeFor": { a in try toJSON(modeFor(arg(a, 0))) },
    "isStatusValid": { a in try toJSON(isStatusValid(arg(a, 0), status: arg(a, 1), isSeriesChild: arg(a, 2))) },
]
