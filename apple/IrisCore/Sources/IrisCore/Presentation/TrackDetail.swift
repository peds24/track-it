import Foundation

/// Port of src/ui/trackDetail.ts: the detail screen's text (A22) and the
/// position editor's rules (A12). Held to TS by shared/fixtures/trackDetail.json.

/// The medium in capitals ("MOVIE"), as KIND_LABEL.
public func kindLabel(_ category: Category) -> String { category.rawValue.uppercased() }

/// "MOVIE · 2016 · Ongoing" — the line under the credit. An empty year is dropped, as JS's truthiness does.
public func detailMeta(_ track: TrackSummary, releaseYear: String?) -> String {
    [kindLabel(track.category), releaseYear, track.ongoing ? "Ongoing" : nil]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
}

/// The screen's main button, or nil when there is nothing to advance.
public func detailPrimaryLabel(_ track: TrackSummary) -> String? {
    guard let id = track.nextEntryId, !id.isEmpty else { return nil }
    if track.shelf == .backlog && track.paused { return "Resume" }
    if track.shelf == .backlog { return track.category == .movie ? "Watched" : "Start" }
    // JS interpolates a null title as "null"; TS never reaches this with one.
    return "Mark \(track.nextEntryTitle ?? "null") \(verbFor(track.category))"
}

/// "13 of 19 episodes", or nil without progress or a unit.
public func progressCaption(_ track: TrackSummary, unitLabel: UnitLabel?) -> String? {
    guard let p = track.progress, let unit = unitLabel else { return nil }
    return "\(p.done) of \(p.total) \(unit.rawValue)\(p.total == 1 ? "" : "s")"
}

public struct DetailStat: Equatable, Sendable {
    public let label: String
    public let value: String
}

/// The timeline rows under the progress card.
public func detailStats(_ timeline: Timeline, now: String, calendar: Calendar = .current) -> [DetailStat] {
    var stats = [DetailStat(label: "Added", value: "\(formatDate(timeline.addedAt, calendar: calendar)) · \(formatRelative(timeline.addedAt, now: now, calendar: calendar))")]
    if let started = timeline.startedAt, !started.isEmpty {
        stats.append(DetailStat(label: "Started", value: "\(formatDate(started, calendar: calendar)) · \(formatRelative(started, now: now, calendar: calendar))"))
    }
    if let finished = timeline.finishedAt, !finished.isEmpty {
        stats.append(DetailStat(label: "Finished", value: formatDate(finished, calendar: calendar)))
    }
    return stats
}

/// A12: what the position editor shows for what was typed, and the ordinal Save would set.
public struct PositionEdit: Codable, Equatable, Sendable {
    public let unitWord: String
    public let seasoned: Bool
    public let seasonPlaceholder: Int?
    public let seasonCount: Int?
    public let unitPlaceholder: Int
    public let unitTotal: Int?
    /// nil keeps Save disabled.
    public let target: Int?
}

/// A field's number, or nil for anything but ASCII digits (JS `^\d+$`). Digits
/// too long for an Int become Int.max: JS still sees a number, which then
/// matches no season and exceeds every total.
private func typed(_ value: String) -> Int? {
    let trimmed = jsTrim(value)
    guard !trimmed.isEmpty, trimmed.unicodeScalars.allSatisfy({ ("0"..."9").contains($0) }) else { return nil }
    return Int(trimmed) ?? Int.max
}

public func positionEdit(_ track: TrackSummary, seasonText: String, unitText: String) -> PositionEdit {
    let total = track.progress?.total ?? 0
    let unit = unitLabelFor(track.category) ?? .episode
    let unitWord = unitTitle(unit)
    let currentOrdinal = (track.progress?.done ?? 0) + 1
    let seasons = (track.seasons ?? []).isEmpty ? nil : track.seasons
    let at = seasons.flatMap { positionIn($0, ordinal: currentOrdinal) }
    let seasoned = seasons != nil && at != nil
    let seasonNumber = seasoned ? (typed(seasonText) ?? at!.season) : nil
    let seasonTotal = seasoned ? seasons!.first(where: { $0.number == seasonNumber })?.episodeCount : nil
    let unitTotal: Int? = seasoned ? seasonTotal : total
    let unitPlaceholder = seasoned ? at!.episode : currentOrdinal
    let target: Int? = {
        guard let typedUnit = typed(unitText) else { return nil }
        if seasoned {
            guard let seasonNumber, let flat = ordinalFor(seasons!, seasonNumber: seasonNumber, episodeNumber: typedUnit) else { return nil }
            return flat <= total ? flat : nil
        }
        return typedUnit >= 1 && typedUnit <= total ? typedUnit : nil
    }()
    return PositionEdit(
        unitWord: unitWord, seasoned: seasoned, seasonPlaceholder: seasoned ? at!.season : nil,
        seasonCount: seasoned ? seasons!.count : nil, unitPlaceholder: unitPlaceholder, unitTotal: unitTotal, target: target
    )
}
