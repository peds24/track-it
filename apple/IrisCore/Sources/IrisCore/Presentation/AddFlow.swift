import Foundation

/// Port of src/ui/addFlow.ts: the Add screen's rules (D2, D10, A9–A11,
/// A14, A16, A17, A24). Held to TS by shared/fixtures/addFlow.json.

public enum ComicMode: String, Codable, Sendable { case single, collection }

/// Which catalogue answers: the category's registry provider (D10), or
/// Google Books for a comic collection (A14).
public enum AddCatalogueKey: Equatable, Hashable, Sendable {
    case category(Category)
    case comicCollection

    /// The TS string: the category name, or "comic-collection".
    public var rawValue: String {
        switch self {
        case let .category(c): c.rawValue
        case .comicCollection: "comic-collection"
        }
    }
}

public func addCatalogueKey(_ category: Category, comicMode: ComicMode?) -> AddCatalogueKey {
    category == .comic && comicMode == .collection ? .comicCollection : .category(category)
}

/// A16: tracked unit by unit — a unit label, and not a comic collection.
public func addIsSeries(_ category: Category, comicMode: ComicMode?) -> Bool {
    unitLabelFor(category) != nil && !(category == .comic && comicMode == .collection)
}

public enum BarcodeKind: String, Codable, Sendable { case ean13, ean8, upcA = "upc_a" }

/// A9/A14: the symbologies to scan for, or nil for no scan button.
public func addBarcodeTypes(_ category: Category, comicMode: ComicMode?) -> [BarcodeKind]? {
    switch category {
    case .comic:
        switch comicMode {
        case .single: [.upcA]
        case .collection: [.ean13, .ean8]
        case nil: nil
        }
    case .book, .manga: [.ean13, .ean8]
    case .show, .movie: nil
    }
}

/// A11/A17: the confirm screen's main button.
public func confirmPrimaryLabel(_ category: Category) -> String {
    switch category {
    case .movie: "Watched"
    case .show: "Start watching"
    default: "Start reading"
    }
}

/// The no-match screen's main button (D2).
public func manualPrimaryLabel(_ category: Category) -> String { category == .movie ? "Watched" : "Start" }

/// A10/A24: the pick's title plus a scanned "#N", or what was typed.
public func addSaveTitle(pickedTitle: String?, pickedOrdinal: Int?, typed: String) -> String {
    guard let pickedTitle else { return typed }
    return pickedOrdinal.map { "\(pickedTitle) #\($0)" } ?? pickedTitle
}

/// What the Add screen's save passes to addTrack.
public func addTrackInput(
    category: Category, comicMode: ComicMode?, saveTitle: String,
    picked: SearchResult?, draft: SeriesDraft?, previewMetadata: TrackMetadata?
) -> AddTrackInput {
    let isCollection = category == .comic && comicMode == .collection
    let isSeries = addIsSeries(category, comicMode: comicMode)
    let parsed = (category == .comic && !isCollection) || category == .manga
        ? parseSeriesTitle(saveTitle)
        : ParsedSeriesTitle(title: jsTrim(saveTitle), ordinal: nil)
    return AddTrackInput(
        title: parsed.title, category: category, count: 1, ongoing: isSeries, match: picked,
        startAtOrdinal: parsed.ordinal, draft: isSeries ? draft : nil, standalone: isCollection ? true : nil,
        externalSource: isCollection ? "google-books" : nil, metadata: isSeries ? nil : previewMetadata
    )
}

/// A17: the confirm screen's data — hydrate's for a series, preview's for a standalone.
public func matchSummary(isSeries: Bool, draft: SeriesDraft?, preview: MatchPreview?) -> MatchPreview? {
    guard isSeries else { return preview }
    guard let draft else { return nil }
    return MatchPreview(title: draft.title, metaLine: draft.metaLine ?? [], blurb: draft.blurb, metadata: draft.metadata)
}
