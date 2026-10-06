@testable import IrisCore

let seriesTitleFixtures: [String: FixtureFn] = [
    "parseSeriesTitle": { a in try toJSON(parseSeriesTitle(arg(a, 0))) },
    "stripBareTrailingNumber": { a in try toJSON(stripBareTrailingNumber(arg(a, 0))) },
]
