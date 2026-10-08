import IrisCore
import SwiftUI

/// How a media category presents. The words match the TS app
/// (`KIND_LABEL` in title case, `CATEGORY_PLURAL` in src/ui/rating.ts).
/// Spelled `IrisCore.Category` because Objective-C's `Category` shadows it.
extension IrisCore.Category {
    var label: String {
        switch self {
        case .show: "Show"
        case .movie: "Movie"
        case .book: "Book"
        case .comic: "Comic"
        case .manga: "Manga"
        }
    }

    var plural: String {
        switch self {
        case .show: "shows"
        case .movie: "movies"
        case .book: "books"
        case .comic: "comics"
        case .manga: "manga"
        }
    }

    var tint: Color {
        switch self {
        case .show: IrisTokens.Colors.categoryShow
        case .movie: IrisTokens.Colors.categoryMovie
        case .book: IrisTokens.Colors.categoryBook
        case .comic: IrisTokens.Colors.categoryComic
        case .manga: IrisTokens.Colors.categoryManga
        }
    }

    var symbol: IrisSymbol {
        switch self {
        case .show: .show
        case .movie: .movie
        case .book: .book
        case .comic: .comic
        case .manga: .manga
        }
    }
}
