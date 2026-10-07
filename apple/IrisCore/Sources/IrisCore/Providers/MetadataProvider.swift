/// Port of src/providers/types.ts's interface. TS marks `preview`, `details`
/// and `unitAt` optional; here they are separate protocols a provider adopts.
public protocol MetadataProvider: Sendable {
    var id: String { get }
    /// The category an instance is fixed to, when it is (TMDB, Google Books).
    var category: Category? { get }
    func search(_ query: String) async throws -> [SearchResult]
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft
}

/// A17: the confirm screen's data for a standalone match. Never throws.
public protocol PreviewingProvider: MetadataProvider {
    func preview(_ result: SearchResult) async -> MatchPreview
}

/// A22: metadata for a stored catalogue id; nil means the lookup failed. Never throws.
public protocol DetailsProvider: MetadataProvider {
    func details(_ externalId: String) async -> TrackMetadata?
}

/// A25: unit `ordinal` of the series `externalId` belongs to (Metron). Never throws.
public protocol UnitProvider: MetadataProvider {
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord?
}

public struct MatchPreview: Codable, Equatable, Sendable {
    public var title: String
    public var metaLine: [String]
    public var blurb: String?
    public var metadata: TrackMetadata?
    public init(title: String, metaLine: [String], blurb: String?, metadata: TrackMetadata?) {
        self.title = title; self.metaLine = metaLine; self.blurb = blurb; self.metadata = metadata
    }
}

public struct UnitRecord: Codable, Equatable, Sendable {
    public var externalId: String
    public var number: String
    public var coverUrl: String?
    public init(externalId: String, number: String, coverUrl: String?) {
        self.externalId = externalId; self.number = number; self.coverUrl = coverUrl
    }
}

/// Port of ManualProvider: no catalogue (D5) — entry generation only.
public struct ManualProvider: MetadataProvider {
    public let id = "manual"
    public var category: Category? { nil }
    public init() {}
    public func search(_ query: String) async throws -> [SearchResult] { [] }
    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft { try generateEntries(result) }
}
