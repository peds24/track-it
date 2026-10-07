import Foundation
import GRDB
@testable import IrisCore

let ratingCalls: [String: ScenarioCall] = [
    "listRanking": { q, a in let c: IrisCore.Category = try arg(a, 0); return try toJSON(write(q) { try listRanking($0, category: c) }) },
    "ratingProfileOf": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try ratingProfileOf($0, t) }) },
    "getRating": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try getRating($0, t) }) },
    "allScores": { q, _ in
        let pairs = try write(q) { try allScores($0) }
        return .object(Dictionary(uniqueKeysWithValues: pairs.map { ($0.key, JSON.number($0.score)) }))
    },
    "saveRating": { q, a in
        let (t, s, i, now): (RatableTrack, Sentiment, Int, String) = (try arg(a, 0), try arg(a, 1), try arg(a, 2), try arg(a, 3))
        try write(q) { try saveRating($0, t, sentiment: s, indexInBucket: i, now: now) }
        return .null
    },
    "removeRating": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try removeRating($0, t) }; return .null },
    "exportLibrary": { q, _ in
        let text = try write(q) { try exportLibrary($0) }
        return try JSONDecoder().decode(JSON.self, from: Data(text.utf8))
    },
    "importLibrary": { q, a in let json: String = try arg(a, 0); try write(q) { try importLibrary($0, json: json) }; return .null },
]
