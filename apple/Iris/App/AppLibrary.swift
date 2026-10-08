import Foundation
import IrisCore

/// Where the app's library lives and how it is opened (I7).
enum AppLibrary {
    /// Application Support/Iris/library.sqlite: backed up, never user-visible.
    static var defaultURL: URL {
        URL.applicationSupportDirectory.appending(path: "Iris/library.sqlite")
    }

    /// The library to run on. DEBUG builds launched with `-IrisSeed demo` get a
    /// fresh in-memory library with one track in every row state, for UI tests
    /// and screenshots; everything else opens the real file.
    static func make() -> Result<Library, Error> {
        Result {
            #if DEBUG
            if UserDefaults.standard.string(forKey: "IrisSeed") == "demo" {
                let library = try Library.inMemory()
                try seedDemoLibrary(library)
                return library
            }
            #endif
            return try Library.open(at: defaultURL)
        }
    }

    /// Catalogue lookups after an advance (A25); keys come from Secrets.xcconfig.
    static let registry = ProviderRegistry(keys: .fromBundle(), http: URLSessionHTTPClient())
}
