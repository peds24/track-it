/// Port of src/domain/mode.ts. Mode is a total function of media type (A16:
/// a standalone comic reads the two-tap way a book does).
public func modeFor(_ mediaType: EntryMediaType) -> Mode {
    switch mediaType {
    case .episode, .movie: .watch
    case .book, .issue, .volume, .comic: .read
    }
}

/// A10: a standalone watch-mode entry (a movie) has no in_progress state; a
/// watch-mode series child (an episode) does.
public func isStatusValid(_ mediaType: EntryMediaType, status: Status, isSeriesChild: Bool) -> Bool {
    if modeFor(mediaType) == .watch && !isSeriesChild { return status != .inProgress }
    return true
}
