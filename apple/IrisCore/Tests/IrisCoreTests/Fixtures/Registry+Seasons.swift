@testable import IrisCore

let seasonsFixtures: [String: FixtureFn] = [
    "seasonSegments": { a in try toJSON(seasonSegments(arg(a, 0), doneCount: arg(a, 1))) },
    "currentSeason": { a in try toJSON(currentSeason(arg(a, 0), doneCount: arg(a, 1))) },
    "ordinalFor": { a in try toJSON(ordinalFor(arg(a, 0), seasonNumber: arg(a, 1), episodeNumber: arg(a, 2))) },
    "positionIn": { a in try toJSON(positionIn(arg(a, 0), ordinal: arg(a, 1))) },
]
