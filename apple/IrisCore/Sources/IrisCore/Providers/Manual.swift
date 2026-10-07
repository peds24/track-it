/// Port of src/providers/manual.ts: entry generation every provider shares (A9).

/// nil means the category is a standalone entry with no container (D1).
public func unitLabelFor(_ category: Category) -> UnitLabel? {
    switch category {
    case .show: .episode
    case .comic: .issue
    case .manga: .volume
    case .book, .movie: nil
    }
}

/// Upper bound on generated entries — far above any real series, far below a freeze.
public let maxUnits = 5000

public func generateEntries(_ result: SearchResult) throws -> SeriesDraft {
    if result.ongoing != true {
        // A missing count is TS's NaN: not < 1, not whole.
        let count = result.count ?? .nan
        if count < 1 { throw DomainError("A track must have at least 1 unit") }
        if count != count.rounded(.towardZero) { throw DomainError("A unit count must be a whole number") }
        if count > Double(maxUnits) { throw DomainError("A track cannot have more than \(maxUnits) units") }
    }
    guard let unitLabel = unitLabelFor(result.category), let mediaType = SeriesMediaType(rawValue: result.category.rawValue) else {
        throw DomainError("\(result.category.rawValue) is a standalone track and has no entries to generate")
    }
    let length = result.ongoing == true ? 1 : Int(result.count ?? 1)
    return SeriesDraft(
        title: result.title, mediaType: mediaType, unitLabel: unitLabel,
        entries: (1...max(length, 1)).prefix(length).map { EntryDraft(ordinal: $0, title: "\(unitTitle(unitLabel)) \($0)") },
        ongoing: result.ongoing == true
    )
}
