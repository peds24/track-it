/// Port of src/domain/advance.ts.

/// The single forward transition behind the one-tap advance (D8, A10).
public func advance(_ entry: Entry, now: String) throws -> Entry {
    if entry.status == .done { throw DomainError("Entry \(entry.id) is already done") }
    var e = entry
    if modeFor(entry.mediaType) == .watch && entry.seriesId == nil {
        e.status = .done
        e.startedAt = entry.startedAt ?? now
        e.finishedAt = now
        return e
    }
    if entry.status == .unstarted {
        e.status = .inProgress
        e.startedAt = now
        return e
    }
    e.status = .done
    e.finishedAt = now
    return e
}

/// A12: jump straight to a position; returns only the entries that changed.
public func setPosition(_ children: [Entry], targetOrdinal: Int, now: String) throws -> [Entry] {
    if targetOrdinal < 1 || targetOrdinal > children.count {
        throw DomainError("Position \(targetOrdinal) is out of range for a \(children.count)-unit series")
    }
    var changed: [Entry] = []
    for (index, child) in byOrdinal(children).enumerated() {
        let position = index + 1
        var u = child
        if position < targetOrdinal {
            u.status = .done
            u.startedAt = child.startedAt ?? now
            u.finishedAt = child.finishedAt ?? now
        } else if position == targetOrdinal {
            u.status = .inProgress
            u.startedAt = child.startedAt ?? now
            u.finishedAt = nil
        } else {
            u.status = .unstarted
            u.startedAt = nil
            u.finishedAt = nil
        }
        if u.status != child.status || u.startedAt != child.startedAt || u.finishedAt != child.finishedAt {
            changed.append(u)
        }
    }
    return changed
}

/// A23: the auto-appended trailing unit of an ongoing series, or nil.
public func ongoingPlaceholder(_ children: [Entry], ongoing: Bool) -> Entry? {
    guard ongoing, children.count >= 2 else { return nil }
    let ordered = byOrdinal(children)
    let last = ordered[ordered.count - 1]
    let previous = ordered[ordered.count - 2]
    return last.status != .done && previous.finishedAt != nil && last.createdAt == previous.finishedAt ? last : nil
}

public struct CompletedUnits: Codable, Equatable, Sendable {
    public let updated: [Entry]
    public let removedIds: [String]
}

/// A23: finish a whole track by hand.
public func completeUnits(_ children: [Entry], ongoing: Bool, now: String) -> CompletedUnits {
    let ordered = byOrdinal(children)
    let removedIds = ongoingPlaceholder(ordered, ongoing: ongoing).map { [$0.id] } ?? []
    let updated = ordered
        .filter { $0.status != .done && !removedIds.contains($0.id) }
        .map { c -> Entry in
            var u = c
            u.status = .done
            u.startedAt = c.startedAt ?? now
            u.finishedAt = now
            return u
        }
    return CompletedUnits(updated: updated, removedIds: removedIds)
}
