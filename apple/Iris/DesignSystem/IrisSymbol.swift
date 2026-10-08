import SwiftUI

/// Every icon Iris draws, named for its purpose (spec §4.2, §5.4). The
/// SF Symbol and the other platforms' glyph for each case are listed in
/// design/iris/components.md; ComponentContractTests keeps the two in step.
enum IrisSymbol: String, CaseIterable, Sendable {
    case show, movie, book, comic, manga
    case add, advance, start, pause, rate, rankings, scan, search, delete, more
    case emptyShelf, gallery

    var systemName: String {
        switch self {
        case .show: "tv"
        case .movie: "film"
        case .book: "book.closed"
        case .comic: "magazine"
        case .manga: "character.book.closed.ja"
        case .add: "plus"
        case .advance: "checkmark"
        case .start: "play.fill"
        case .pause: "pause.fill"
        case .rate: "star"
        case .rankings: "list.number"
        case .scan: "barcode.viewfinder"
        case .search: "magnifyingglass"
        case .delete: "trash"
        case .more: "ellipsis"
        case .emptyShelf: "tray"
        case .gallery: "swatchpalette"
        }
    }

    var image: Image { Image(systemName: systemName) }
}
