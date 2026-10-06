/// Port of src/domain/whatsNew.ts (A27).
public struct ReleaseNote: Codable, Equatable, Sendable {
    public struct Item: Codable, Equatable, Sendable {
        public var heading: String
        public var body: String

        public init(heading: String, body: String) { self.heading = heading; self.body = body }
    }
    public var version: String
    public var title: String
    public var items: [Item]

    public init(version: String, title: String, items: [Item]) {
        self.version = version; self.title = title; self.items = items
    }
}

/// The note to show, or nil — never on a fresh install, never twice.
public func announcementFor(current: String, lastSeen: String?, hasLibrary: Bool, notes: [ReleaseNote]) -> ReleaseNote? {
    if lastSeen == current { return nil }
    if lastSeen == nil && !hasLibrary { return nil }
    return notes.first { $0.version == current }
}
