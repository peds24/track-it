import Foundation

/// Port of src/providers/images.ts (A22, A25).

public func httpsUrl(_ url: String?) -> String? {
    guard let url, !url.isEmpty else { return nil }
    return url.replacing(jsRegex(#/^http:\/\//#).ignoresCase(), with: "https://", maxReplacements: 1)
}

public func tmdbImage(_ path: String?, size: String) -> String? {
    guard let path, !path.isEmpty else { return nil }
    return "https://image.tmdb.org/t/p/\(size)\(path)"
}

private func isGoogleBooksContent(_ url: String) -> Bool {
    url.firstMatch(of: jsRegex(#/^https:\/\/books\.google\.[a-z.]+\/books\/(publisher\/)?content\?/#).ignoresCase()) != nil
}

public func googleBooksImage(_ url: String?, width: Int) -> String? {
    guard let secure = httpsUrl(url), isGoogleBooksContent(secure) else { return httpsUrl(url) }
    let parts = secure.split(separator: "?", omittingEmptySubsequences: false)
    let base = String(parts[0])
    let query = parts.count > 1 ? String(parts[1]) : ""
    let params = query.split(separator: "&", omittingEmptySubsequences: false)
        .map(String.init)
        .filter { !$0.isEmpty && $0 != "edge=curl" && !$0.hasPrefix("fife=") }
    return "\(base)?\((params + ["fife=w\(width)"]).joined(separator: "&"))"
}

/// A25: covers at detail-screen size, applied on store and on read.
public func sharpCoverUrl(_ url: String?) -> String? {
    guard let secure = httpsUrl(url) else { return nil }
    if isGoogleBooksContent(secure) { return googleBooksImage(secure, width: 600) }
    return secure
        .replacing(jsRegex(#/^(https:\/\/image\.tmdb\.org\/t\/p\/)w(92|154|185|342|500)\//#), maxReplacements: 1) { "\($0.1)w780/" }
        .replacing(jsRegex(#/(anilistcdn\/media\/[a-z]+\/cover\/)(small|medium)\//#), maxReplacements: 1) { "\($0.1)large/" }
}
