/// Port of src/providers/types.ts — the parts the data layer uses (I4).
public struct SearchResult: Codable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var category: Category
    /// How many units: a number, as in TS — generateEntries rejects a fraction,
    /// and an ongoing series carries none (TS's NaN, null in JSON).
    public var count: Double?
    public var ongoing: Bool?
    public var creator: String?
    public var year: String?
    public var thumbnailUrl: String?

    public init(id: String, title: String, category: Category, count: Double?, ongoing: Bool? = nil,
                creator: String? = nil, year: String? = nil, thumbnailUrl: String? = nil) {
        self.id = id; self.title = title; self.category = category; self.count = count; self.ongoing = ongoing
        self.creator = creator; self.year = year; self.thumbnailUrl = thumbnailUrl
    }
}

public struct EntryDraft: Codable, Equatable, Sendable {
    /// A number, as in TS: a fractional or negative ordinal must reach
    /// assertEntryInvariants to be rejected with its message.
    public var ordinal: Double
    public var title: String
    public init(ordinal: Int, title: String) { self.ordinal = Double(ordinal); self.title = title }
}

public struct SeriesDraft: Codable, Equatable, Sendable {
    public var title: String
    public var mediaType: SeriesMediaType
    public var unitLabel: UnitLabel
    public var entries: [EntryDraft]
    public var ongoing: Bool?
    public var externalSource: String?
    public var externalId: String?
    public var seasons: [SeasonBoundary]?
    public var metaLine: [String]?
    public var blurb: String?
    public var metadata: TrackMetadata?

    public init(title: String, mediaType: SeriesMediaType, unitLabel: UnitLabel, entries: [EntryDraft], ongoing: Bool? = nil,
                externalSource: String? = nil, externalId: String? = nil, seasons: [SeasonBoundary]? = nil,
                metaLine: [String]? = nil, blurb: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.mediaType = mediaType; self.unitLabel = unitLabel; self.entries = entries
        self.ongoing = ongoing; self.externalSource = externalSource; self.externalId = externalId
        self.seasons = seasons; self.metaLine = metaLine; self.blurb = blurb; self.metadata = metadata
    }
}
