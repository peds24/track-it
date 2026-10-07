import GRDB

/// Port of src/data/addTrack.ts's input (A9–A22).
public struct AddTrackInput: Codable, Equatable, Sendable {
    public var title: String
    public var category: Category
    public var count: Double?
    public var ongoing: Bool?
    public var match: SearchResult?
    public var startAtOrdinal: Int?
    public var draft: SeriesDraft?
    public var standalone: Bool?
    public var externalSource: String?
    public var metadata: TrackMetadata?

    public init(title: String, category: Category, count: Double?, ongoing: Bool? = nil, match: SearchResult? = nil,
                startAtOrdinal: Int? = nil, draft: SeriesDraft? = nil, standalone: Bool? = nil,
                externalSource: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.category = category; self.count = count; self.ongoing = ongoing; self.match = match
        self.startAtOrdinal = startAtOrdinal; self.draft = draft; self.standalone = standalone
        self.externalSource = externalSource; self.metadata = metadata
    }
}

/// Until I5 brings real providers, an unmatched (hand-typed) result hydrates
/// exactly as every TS provider does for one: generateEntries.
public let manualHydrate: @Sendable (SearchResult) async throws -> SeriesDraft = { try generateEntries($0) }

/// Port of src/data/addTrack.ts. Hydrates (possibly over the network, I5)
/// *before* opening the write, as TS does.
public func addTrack(
    _ writer: some DatabaseWriter, _ input: AddTrackInput, now: String,
    hydrate: @Sendable (SearchResult) async throws -> SeriesDraft = manualHydrate
) async throws -> TrackRef {
    let title = jsTrim(input.title)
    if title.isEmpty { throw DomainError("A track needs a title") }
    let providerId = providerIdFor(input.category)

    if unitLabelFor(input.category) == nil || input.standalone == true {
        let matched = input.match != nil
        let standalone = StandaloneInput(
            title: title, category: input.category,
            externalSource: matched ? (input.externalSource ?? providerId) : nil,
            externalId: matched ? input.match?.id : nil,
            metadata: matched ? input.metadata : nil
        )
        let id = try await writer.write { try createStandaloneTrack($0, standalone, now: now) }
        return TrackRef(kind: .entry, id: id)
    }

    var result = input.match ?? SearchResult(id: providerId, title: title, category: input.category, count: input.count)
    result.title = title
    result.count = input.count
    result.ongoing = input.ongoing == true
    let draft: SeriesDraft
    if let given = input.draft { draft = given } else { draft = try await hydrate(result) }
    let start = input.startAtOrdinal
    let id = try await writer.write { try createSeriesTrack($0, draft, now: now, startAtOrdinal: start) }
    return TrackRef(kind: .series, id: id)
}
