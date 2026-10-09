import Foundation
@testable import IrisCore

let trackDetailFixtures: [String: FixtureFn] = [
    "detailMeta": { a in try toJSON(detailMeta(arg(a, 0), releaseYear: arg(a, 1))) },
    "detailPrimaryLabel": { a in try toJSON(detailPrimaryLabel(arg(a, 0))) },
    "progressCaption": { a in try toJSON(progressCaption(arg(a, 0), unitLabel: arg(a, 1))) },
    "detailStats": { a in
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        return try toJSON(detailStats(arg(a, 0), now: arg(a, 1), calendar: utc).map { [$0.label, $0.value] })
    },
    "positionEdit": { a in try toJSON(positionEdit(arg(a, 0), seasonText: arg(a, 1), unitText: arg(a, 2))) },
]
