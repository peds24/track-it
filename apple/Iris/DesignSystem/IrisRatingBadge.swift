import IrisCore
import SwiftUI

/// A finished track's score out of 10 (components.md § IrisRatingBadge, A26).
struct IrisRatingBadge: View {
    enum Fill: Equatable { case accent, fill, destructiveTint }
    enum Ink: Equatable { case onAccent, label, destructive }
    struct Style: Equatable { let fill: Fill; let ink: Ink }

    static func style(for sentiment: Sentiment) -> Style {
        switch sentiment {
        case .liked: Style(fill: .accent, ink: .onAccent)
        case .fine: Style(fill: .fill, ink: .label)
        case .disliked: Style(fill: .destructiveTint, ink: .destructive)
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
        case .accent: IrisTokens.Colors.accent
        case .fill: IrisTokens.Colors.fill
        case .destructiveTint: IrisTokens.Colors.destructive.opacity(0.15)
        }
    }

    private static func color(_ ink: Ink) -> Color {
        switch ink {
        case .onAccent: IrisTokens.Colors.onAccent
        case .label: IrisTokens.Colors.label
        case .destructive: IrisTokens.Colors.destructive
        }
    }
}
