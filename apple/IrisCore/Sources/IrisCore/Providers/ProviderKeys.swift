import Foundation

/// The catalogue credentials (spec §2.2): Secrets.xcconfig → Info.plist → here.
public struct ProviderKeys: Sendable, Equatable {
    public var tmdb: String?
    public var googleBooks: String?
    public var metronUsername: String?
    public var metronPassword: String?

    public init(tmdb: String? = nil, googleBooks: String? = nil, metronUsername: String? = nil, metronPassword: String? = nil) {
        self.tmdb = tmdb; self.googleBooks = googleBooks; self.metronUsername = metronUsername; self.metronPassword = metronPassword
    }

    /// Empty or unexpanded (`$(TMDB_API_KEY)` with no Secrets.xcconfig) values count as missing.
    public static func fromBundle(_ bundle: Bundle = .main) -> ProviderKeys {
        func value(_ key: String) -> String? {
            guard let v = bundle.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.hasPrefix("$(") else { return nil }
            return v
        }
        return ProviderKeys(tmdb: value("TMDB_API_KEY"), googleBooks: value("GOOGLE_BOOKS_API_KEY"),
                            metronUsername: value("METRON_USERNAME"), metronPassword: value("METRON_PASSWORD"))
    }
}
