/// Ports of src/domain/types.ts. Raw values are the strings the TS app stores
/// and the fixtures carry, so Codable round-trips them unchanged.

public enum Category: String, Codable, Sendable, CaseIterable { case show, movie, book, comic, manga }
public enum UnitLabel: String, Codable, Sendable { case episode, issue, volume }
public enum EntryMediaType: String, Codable, Sendable { case episode, issue, volume, book, movie, comic }
public enum Mode: String, Codable, Sendable { case watch, read }
public enum Status: String, Codable, Sendable { case unstarted, inProgress = "in_progress", done }
public enum Shelf: String, Codable, Sendable { case currently, backlog, done }
public enum SeriesMediaType: String, Codable, Sendable { case show, comic, manga }

/// A11: one TV season's episode count — display metadata, never a source of truth (D3).
public struct SeasonBoundary: Codable, Equatable, Sendable {
    public var number: Int
    public var episodeCount: Int
    public init(number: Int, episodeCount: Int) { self.number = number; self.episodeCount = episodeCount }
}

public struct Series: Codable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var mediaType: SeriesMediaType
    public var unitLabel: UnitLabel
    public var createdAt: String
    /// A4: still being published — no total, never reaches Done.
    public var ongoing: Bool
    /// A6: pulled into Backlog without touching any child's status.
    public var paused: Bool
    public var externalSource: String?
    public var externalId: String?
    /// A11: TMDB only.
    public var seasons: [SeasonBoundary]?
}

public struct Entry: Codable, Equatable, Sendable {
    public var id: String
    public var seriesId: String?
    public var title: String
    public var ordinal: Int?
    public var mediaType: EntryMediaType
    public var status: Status
    public var startedAt: String?
    public var finishedAt: String?
    public var createdAt: String
    /// A6: only meaningful for a standalone entry.
    public var paused: Bool
    public var externalSource: String?
    public var externalId: String?

    public init(
        id: String, seriesId: String?, title: String, ordinal: Int?, mediaType: EntryMediaType, status: Status,
        startedAt: String?, finishedAt: String?, createdAt: String, paused: Bool,
        externalSource: String?, externalId: String?
    ) {
        self.id = id; self.seriesId = seriesId; self.title = title; self.ordinal = ordinal
        self.mediaType = mediaType; self.status = status; self.startedAt = startedAt
        self.finishedAt = finishedAt; self.createdAt = createdAt; self.paused = paused
        self.externalSource = externalSource; self.externalId = externalId
    }
}

/// A22: display-only catalogue metadata (D3: never a source of truth).
public struct TrackMetadata: Codable, Equatable, Sendable {
    public var coverUrl: String?
    public var creator: String?
    public var description: String?
    public var releaseYear: String?
    /// A26: absent when the catalogue gave none.
    public var genres: [String]?
}

/// A domain rule refused an input. `message` is the TS message, verbatim.
public struct DomainError: Error, Equatable, Sendable, CustomStringConvertible {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var description: String { message }
}
