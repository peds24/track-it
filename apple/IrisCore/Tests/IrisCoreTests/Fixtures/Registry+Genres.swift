@testable import IrisCore

/// withGenres is generic over GenresCarrying; fixtures pass arbitrary objects
/// ({ a: 1 }), so this adapter carries one through the real function.
private struct JSONObjectWithGenres: GenresCarrying {
    var object: [String: JSON]
    var genres: [String]? {
        get {
            guard case let .array(xs)? = object["genres"] else { return nil }
            return xs.compactMap { if case let .string(s) = $0 { s } else { nil } }
        }
        set { object["genres"] = newValue.map { .array($0.map(JSON.string)) } }
    }
}

let genresFixtures: [String: FixtureFn] = [
    "genresFrom": { a in try toJSON(genresFrom(arg(a, 0))) },
    "withGenres": { a in
        guard case let .object(base) = a.first else { throw FixtureError("withGenres: base must be an object") }
        return try .object(withGenres(JSONObjectWithGenres(object: base), arg(a, 1)).object)
    },
]
