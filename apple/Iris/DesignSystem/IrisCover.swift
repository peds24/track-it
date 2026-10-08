import IrisCore
import SwiftUI

/// A track's cover, or its category-tinted stand-in (components.md § IrisCover).
struct IrisCover: View {
    enum Size {
        case row, card, hero
        var baseWidth: CGFloat { switch self { case .row: 48; case .card: 120; case .hero: 180 } }
        /// Grows with text size, up to a cap that keeps two cards side by side
        /// and a hero inside an iPhone's width at accessibility sizes.
        var maxWidth: CGFloat { switch self { case .row: 72; case .card: 160; case .hero: 240 } }
        func width(scale: CGFloat) -> CGFloat { min(baseWidth * scale, maxWidth) }
    }

    let url: String?
    let title: String
    let category: IrisCore.Category
    let size: Size
    var decorative = true

    @ScaledMetric private var scale: CGFloat = 1

    /// `http://` → `https://` (ATS), empty/unparseable → nil.
    static func resolvedURL(_ raw: String?) -> URL? {
        guard let secure = httpsUrl(raw),
              let url = URL(string: secure, encodingInvalidCharacters: false),
              url.scheme == "https", url.host() != nil else { return nil }
        return url
    }

    /// What the fallback shows in place of art: "?" when there are no words.
    static func fallbackText(_ title: String) -> String { initialsOf(title) }

    var body: some View {
        AsyncImage(url: Self.resolvedURL(url)) { phase in
            IrisCoverArt(image: phase.image, title: title, category: category, size: size)
        }
        .frame(width: size.width(scale: scale))
        .accessibilityHidden(decorative)
        .accessibilityLabel(decorative ? "" : "Cover of \(title)")
    }
}

/// The pure rendering: an image if there is one, else the fallback.
struct IrisCoverArt: View {
    let image: Image?
    let title: String
    let category: IrisCore.Category
    let size: IrisCover.Size

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: IrisTokens.Radius.control, style: .continuous)
        Color.clear
            .aspectRatio(2.0 / 3.0, contentMode: .fit)
            .overlay {
                if let image {
                    image.resizable().scaledToFill()
                } else {
                    ZStack {
                        category.tint.opacity(0.18)
                        if size == .row {
                            category.symbol.image.font(IrisTokens.Typography.headline.font)
                        } else {
                            Text(IrisCover.fallbackText(title))
                                .font(IrisTokens.Typography.title3.font.weight(.bold))
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                                .padding(IrisTokens.Space.xs)
                        }
                    }
                    .foregroundStyle(category.tint)
                }
            }
            .clipShape(shape)
    }
}
