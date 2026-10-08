/// Port of src/ui/trackLabels.ts and src/ui/completionMessage.ts: what a shelf
/// row says. Held to TS by shared/fixtures/trackLabels.json, so an Iris row
/// reads exactly as an Android row does. JS truthiness is kept: an empty
/// string counts as no title.

private let readCategories: Set<Category> = [.book, .comic, .manga]

private func present(_ s: String?) -> String? { s.flatMap { $0.isEmpty ? nil : $0 } }

/// "watched" vs "read" is presentation only; the database stores neither.
public func verbFor(_ category: Category) -> String { readCategories.contains(category) ? "read" : "watched" }

/// Where you are, in words: "Next Episode 4", "Not started", "Reading", "Watched", "Finished".
public func positionLabel(_ track: TrackSummary) -> String {
    let read = readCategories.contains(track.category)
    switch track.shelf {
    case .done:
        if track.kind == .series { return "Finished" }
        return read ? "Read" : "Watched"
    case .backlog:
        // A6: paused keeps the row pointed at wherever it was left.
        if track.paused, let next = present(track.nextEntryTitle), next != track.title { return "Paused · \(next)" }
        if track.paused { return "Paused" }
        return "Not started"
    case .currently:
        if let next = present(track.nextEntryTitle), next != track.title {
            if !read { return "Watching \(next)" }
            return "\(track.nextEntryStatus == .inProgress ? "Reading" : "Next") \(next)"
        }
        return read ? "Reading" : "Watching"
    }
}

/// A11/A13: a show gets season treatment while being watched, or paused with progress.
public func hasSeasonProgress(_ track: TrackSummary) -> Bool {
    let eligible = track.shelf == .currently || (track.shelf == .backlog && track.paused)
    return eligible && !(track.seasons ?? []).isEmpty && track.progress != nil
}

/// "S3 Ep 15 of 24", or "Paused · S3 Ep 15 of 24"; nil when there is no season position.
public func seasonPositionLabel(_ track: TrackSummary) -> String? {
    guard hasSeasonProgress(track), let progress = track.progress, let seasons = track.seasons,
          let current = currentSeason(seasons, doneCount: progress.done) else { return nil }
    let text = "S\(current.number) Ep \(current.nextEpisode) of \(current.episodeCount)"
    return track.paused ? "Paused · \(text)" : text
}

public func canEditPosition(_ track: TrackSummary) -> Bool {
    track.kind == .series && track.shelf == .currently && !track.ongoing && (track.progress?.total ?? 0) > 0
}

/// The row's one button: what it says and what it does.
public struct RowAction: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable { case advance, resume }
    public let kind: Kind
    public let entryId: String
    public let label: String
    public let accessibilityLabel: String
}

public func rowAction(_ track: TrackSummary) -> RowAction? {
    guard let entryId = present(track.nextEntryId), let next = present(track.nextEntryTitle) else { return nil }
    let resuming = track.shelf == .backlog && track.paused
    let starting = track.shelf == .backlog && !track.paused
    let startLabel = track.category == .movie ? "Watched" : "Start"
    return RowAction(
        kind: resuming ? .resume : .advance,
        entryId: entryId,
        label: resuming ? "Resume" : starting ? startLabel : "Done",
        accessibilityLabel: resuming
            ? "Resume \(track.title)"
            : starting ? "\(startLabel) \(track.title)" : "Mark \(next) \(verbFor(track.category))"
    )
}

/// A23: the body of the "Mark … complete?" confirm.
public func completionMessage(_ track: TrackSummary) -> String {
    if track.kind == .entry { return "It moves to Done." }
    if let drops = present(track.completionDrops) {
        return "\(drops) isn't marked done, so it's removed and the series ends at the last one you finished. Tap Done on it first if you finished it."
    }
    return track.ongoing
        ? "Everything you have reached is marked done and the series stops growing. It moves to Done."
        : "Every remaining unit is marked done. It moves to Done."
}
