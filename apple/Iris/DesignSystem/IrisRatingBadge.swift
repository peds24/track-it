import IrisCore
import SwiftUI

/// A finished track's score out of 10 (components.md § IrisRatingBadge, A26).
struct IrisRatingBadge: View {
    enum Fill: Equatable { case accentTint, fill, destructiveTint }
    /// One ink: white on the iOS 26 accent, or accent/red text on their own
    /// tints, all fall under 4.5:1 (I7 accessibility audit).
    enum Ink: Equatable { case label }
    struct Style: Equatable { let fill: Fill; let ink: Ink }

    static func style(for sentiment: Sentiment) -> Style {
        switch sentiment {
        case .liked: Style(fill: .accentTint, ink: .label)
        case .fine: Style(fill: .fill, ink: .label)
        case .disliked: Style(fill: .destructiveTint, ink: .label)
        }
    }

    static func accessibilityLabel(score: Double) -> String { "Rated \(formatScore(score)) out of 10" }

    let score: Double
    let sentiment: Sentiment

    var body: some View {
        let style = Self.style(for: sentiment)
        Text(formatScore(score))
            .font(IrisTokens.Typography.subheadline.font.weight(.semibold).monospacedDigit())
            .foregroundStyle(Self.color(style.ink))
            .padding(.horizontal, IrisTokens.Space.sm)
            .padding(.vertical, IrisTokens.Space.xs)
            .frame(minWidth: 44)
            .background(Capsule().fill(Self.color(style.fill)))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.accessibilityLabel(score: score))
    }

    private static func color(_ fill: Fill) -> Color {
        switch fill {
        case .accentTint: IrisTokens.Colors.accent.opacity(0.22)
        case .fill: IrisTokens.Colors.fill
        case .destructiveTint: IrisTokens.Colors.destructive.opacity(0.15)
        }
    }

    private static func color(_ ink: Ink) -> Color {
        switch ink {
        case .label: IrisTokens.Colors.label
        }
    }
}
