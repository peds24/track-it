/// Port of src/domain/genres.ts (A26).

/// Each "/" path segment is its own genre; filler and case-insensitive
/// duplicates drop out, first spelling kept.
public func genresFrom(_ raw: [String?]?) -> [String] {
    let filler: Set<String> = ["general", "other", "miscellaneous"]
    var seen = Set<String>()
    var out: [String] = []
    for value in raw ?? [] {
        for part in (value ?? "").split(separator: "/", omittingEmptySubsequences: false) {
            let name = jsTrim(String(part))
            let key = name.lowercased()
            if name.isEmpty || filler.contains(key) || seen.contains(key) { continue }
            seen.insert(key)
            out.append(name)
        }
    }
    return out
}

/// Anything that can carry catalogue genres.
public protocol GenresCarrying {
    var genres: [String]? { get set }
}

extension TrackMetadata: GenresCarrying {}

/// `genres` set only when there are any, so a record with none looks exactly
/// as it did before genres were collected.
public func withGenres<T: GenresCarrying>(_ base: T, _ raw: [String?]?) -> T {
    let genres = genresFrom(raw)
    guard !genres.isEmpty else { return base }
    var out = base
    out.genres = genres
    return out
}
