/// Port of src/domain/seriesTitle.ts (A10, A11).
public struct ParsedSeriesTitle: Codable, Equatable, Sendable {
    public let title: String
    public let ordinal: Int?
}

/// "Absolute Batman #1" → ("Absolute Batman", 1). A title stripping would
/// empty is left alone. Tried in order; the first matching pattern wins.
public func parseSeriesTitle(_ raw: String) -> ParsedSeriesTitle {
    let trimmed = jsTrim(raw)
    let patterns = [
        jsRegex(#/#\s*(\d+)\s*$/#),
        jsRegex(#/\b(?:volume|vol\.?)\s+(\d+)\s*$/#).ignoresCase(),
        jsRegex(#/\b(?:issue|iss\.?)\s+(\d+)\s*$/#).ignoresCase(),
    ]
    for pattern in patterns {
        guard let match = trimmed.firstMatch(of: pattern), let n = Int(match.1) else { continue }
        let stripped = jsTrim(String(trimmed[..<match.range.lowerBound]))
        if stripped.isEmpty { continue }
        return ParsedSeriesTitle(title: stripped, ordinal: n)
    }
    return ParsedSeriesTitle(title: trimmed, ordinal: nil)
}

/// A11: Google Books' bare trailing volume number — provider titles only.
public func stripBareTrailingNumber(_ raw: String) -> ParsedSeriesTitle {
    let trimmed = jsTrim(raw)
    guard let match = trimmed.firstMatch(of: jsRegex(#/\s+(\d+)\s*$/#)), let n = Int(match.1) else {
        return ParsedSeriesTitle(title: trimmed, ordinal: nil)
    }
    let stripped = jsTrim(String(trimmed[..<match.range.lowerBound]))
    if stripped.isEmpty { return ParsedSeriesTitle(title: trimmed, ordinal: nil) }
    return ParsedSeriesTitle(title: stripped, ordinal: n)
}
