/// Port of src/domain/validate.ts — entry invariants every write path enforces.

/// A parentless entry is a book, a movie, or (A16) a comic collection.
public func isStandaloneMediaType(_ mediaType: String) -> Bool {
    ["book", "movie", "comic"].contains(mediaType)
}

/// ISO-8601 date or date-time that JS's Date.parse also accepts.
public func isIsoTimestamp(_ value: String) -> Bool {
    isoParts(value) != nil
}

public func assertIsoTimestamp(_ value: String?, field: String) throws {
    guard let value else { return }
    if !isIsoTimestamp(value) {
        throw DomainError("\(field) must be an ISO-8601 timestamp, got: \(value)")
    }
}

/// Ordinals number the units of a series: never negative, never fractional.
public func assertOrdinal(_ value: Double?, field: String = "ordinal") throws {
    guard let value else { return }
    if !value.isFinite || value.rounded(.towardZero) != value || value < 0 {
        throw DomainError("\(field) must be a non-negative whole number, got: \(jsNumberString(value))")
    }
}

/// The message still says "book or movie" though comics are standalone too
/// (A16) — verbatim from TS, which the fixtures hold Swift to.
public func assertMediaTypeMatchesParent(_ mediaType: EntryMediaType, parentUnitLabel: UnitLabel?, label: String = "entry") throws {
    guard let parentUnitLabel else {
        if !isStandaloneMediaType(mediaType.rawValue) {
            throw DomainError("\(label) has no parent series, so its media type must be book or movie, got: \(mediaType.rawValue)")
        }
        return
    }
    if mediaType.rawValue != parentUnitLabel.rawValue {
        throw DomainError("\(label) has media type \(mediaType.rawValue) but its series is tracked in \(parentUnitLabel.rawValue)s")
    }
}

public struct EntryInvariants: Codable, Equatable, Sendable {
    /// Used only to name the offending row in error messages.
    public var label: String?
    public var mediaType: EntryMediaType
    public var parentUnitLabel: UnitLabel?
    public var ordinal: Double?
    public var createdAt: String?
    public var startedAt: String?
    public var finishedAt: String?

    public init(
        label: String? = nil, mediaType: EntryMediaType, parentUnitLabel: UnitLabel?, ordinal: Double? = nil,
        createdAt: String? = nil, startedAt: String? = nil, finishedAt: String? = nil
    ) {
        self.label = label; self.mediaType = mediaType; self.parentUnitLabel = parentUnitLabel; self.ordinal = ordinal
        self.createdAt = createdAt; self.startedAt = startedAt; self.finishedAt = finishedAt
    }
}

/// Every entry invariant in one call, so no write path can enforce a subset.
public func assertEntryInvariants(_ input: EntryInvariants) throws {
    let label = input.label ?? "entry"
    try assertMediaTypeMatchesParent(input.mediaType, parentUnitLabel: input.parentUnitLabel, label: label)
    try assertOrdinal(input.ordinal, field: "\(label) ordinal")
    try assertIsoTimestamp(input.createdAt, field: "\(label) createdAt")
    try assertIsoTimestamp(input.startedAt, field: "\(label) startedAt")
    try assertIsoTimestamp(input.finishedAt, field: "\(label) finishedAt")
}
