@testable import IrisCore

let advanceFixtures: [String: FixtureFn] = [
    "advance": { a in try toJSON(advance(arg(a, 0), now: arg(a, 1))) },
    "setPosition": { a in try toJSON(setPosition(arg(a, 0), targetOrdinal: arg(a, 1), now: arg(a, 2))) },
    "ongoingPlaceholder": { a in try toJSON(ongoingPlaceholder(arg(a, 0), ongoing: arg(a, 1))) },
    "completeUnits": { a in try toJSON(completeUnits(arg(a, 0), ongoing: arg(a, 1), now: arg(a, 2))) },
]
