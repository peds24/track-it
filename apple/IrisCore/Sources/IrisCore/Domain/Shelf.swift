/// Port of src/domain/shelf.ts. Derived, never stored (D3).

/// JS's Array.prototype.sort is stable; Swift's `sorted` doesn't promise it,
/// so ties on ordinal keep their input order explicitly.
func byOrdinal(_ entries: [Entry]) -> [Entry] {
    entries.enumerated()
        .sorted { a, b in
            let (x, y) = (a.element.ordinal ?? 0, b.element.ordinal ?? 0)
            return x != y ? x < y : a.offset < b.offset
        }
        .map(\.element)
}

public func shelfForEntry(_ entry: Entry) -> Shelf {
    if entry.status == .done { return .done }
    // A6: paused overrides in_progress.
    if entry.paused { return .backlog }
    if entry.status == .inProgress { return .currently }
    return .backlog
}

/// A6: `paused` never overrides a fully finished series.
public func shelfForSeries(_ children: [Entry], paused: Bool = false) -> Shelf {
    if children.isEmpty { return .backlog }
    let doneCount = children.filter { $0.status == .done }.count
    if doneCount == children.count { return .done }
    if paused { return .backlog }
    if children.contains(where: { $0.status == .inProgress }) { return .currently }
    if doneCount > 0 { return .currently }
    return .backlog
}

public struct Progress: Codable, Equatable, Sendable {
    public let done: Int
    public let total: Int
}

public func progressFor(_ children: [Entry]) -> Progress {
    Progress(done: children.filter { $0.status == .done }.count, total: children.count)
}

/// The thing the Currently screen offers to advance.
public func nextEntry(_ children: [Entry]) -> Entry? {
    if let inProgress = children.first(where: { $0.status == .inProgress }) { return inProgress }
    return byOrdinal(children.filter { $0.status == .unstarted }).first
}
