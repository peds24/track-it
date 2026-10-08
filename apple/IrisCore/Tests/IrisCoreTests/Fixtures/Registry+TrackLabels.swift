@testable import IrisCore

let trackLabelsFixtures: [String: FixtureFn] = [
    "verbFor": { a in try toJSON(verbFor(arg(a, 0))) },
    "positionLabel": { a in try toJSON(positionLabel(arg(a, 0))) },
    "seasonPositionLabel": { a in try toJSON(seasonPositionLabel(arg(a, 0))) },
    "canEditPosition": { a in try toJSON(canEditPosition(arg(a, 0))) },
    "rowAction": { a in try toJSON(rowAction(arg(a, 0))) },
    "completionMessage": { a in try toJSON(completionMessage(arg(a, 0))) },
]
