@testable import IrisCore

let ratingFixtures: [String: FixtureFn] = [
    "scoreAt": { a in try toJSON(scoreAt(arg(a, 0), index: arg(a, 1), size: arg(a, 2))) },
    "scoresFor": { a in
        // A Map in TS, recorded as an object (insertion order); keys are unique in a ranking.
        let pairs = scoresFor(try arg(a, 0))
        return .object(Dictionary(uniqueKeysWithValues: pairs.map { ($0.key, JSON.number($0.score)) }))
    },
    "similarity": { a in try toJSON(similarity(arg(a, 0), arg(a, 1))) },
    "matchupReason": { a in try toJSON(matchupReason(arg(a, 0), arg(a, 1))) },
    "pickOpponent": { a in try toJSON(pickOpponent(arg(a, 0), lo: arg(a, 1), hi: arg(a, 2), candidate: arg(a, 3))) },
    "startRanking": { a in try toJSON(startRanking(arg(a, 0), sentiment: arg(a, 1), ranking: arg(a, 2))) },
    "answer": { a in try toJSON(answer(arg(a, 0), arg(a, 1))) },
    "isPlaced": { a in try toJSON(isPlaced(arg(a, 0))) },
    "placeInRanking": { a in
        try toJSON(placeInRanking(arg(a, 0), key: arg(a, 1), sentiment: arg(a, 2), indexInBucket: arg(a, 3)))
    },
    "formatScore": { a in try toJSON(formatScore(arg(a, 0))) },
    // Mirrors shared/fixtures/registry.ts: a whole session as one vector.
    "rankingScenario": { a in
        var session = startRanking(try arg(a, 0), sentiment: try arg(a, 1), ranking: try arg(a, 2))
        let answers: [Answer] = try arg(a, 3)
        var opponents: [String] = []
        for choice in answers {
            guard let opponent = session.opponent else { break }
            opponents.append(session.bucket[opponent].key)
            session = answer(session, choice)
        }
        return .object([
            "opponents": .array(opponents.map(JSON.string)),
            "lo": .number(Double(session.lo)),
            "comparisons": .number(Double(session.comparisons)),
            "placed": .bool(isPlaced(session)),
        ])
    },
]
