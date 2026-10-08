import IrisCore
import SwiftUI

/// One side of Rate's "which did you prefer?" (components.md § IrisComparisonCard).
struct IrisComparisonCard: View {
    let title: String
    let subtitle: String?
    let coverURL: String?
    let category: IrisCore.Category
    var chosen = false
    let action: () -> Void

    init(title: String, subtitle: String?, coverURL: String?, category: IrisCore.Category, chosen: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.subtitle = subtitle; self.coverURL = coverURL; self.category = category; self.chosen = chosen; self.action = action
    }

    @State private var picks = 0

    var body: some View {
        Button { picks += 1; action() } label: {
            VStack(spacing: IrisTokens.Space.sm) {
                IrisCover(url: coverURL, title: title, category: category, size: .card)
                Text(title).font(IrisTokens.Typography.headline.font).foregroundStyle(IrisTokens.Colors.label)
                    .lineLimit(3).multilineTextAlignment(.center)
                if let subtitle {
                    Text(subtitle).font(IrisTokens.Typography.footnote.font).foregroundStyle(IrisTokens.Colors.secondaryLabel)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(IrisTokens.Space.lg)
            .frame(maxWidth: .infinity)
            .background(IrisTokens.Colors.secondaryGroupedBackground, in: .rect(cornerRadius: IrisTokens.Radius.card, style: .continuous))
            .overlay {
                if chosen {
                    RoundedRectangle(cornerRadius: IrisTokens.Radius.card, style: .continuous).strokeBorder(IrisTokens.Colors.accent, lineWidth: 2)
                }
            }
        }
        .buttonStyle(PressScale())
        .sensoryFeedback(.selection, trigger: picks)
        .accessibilityLabel(title)
        .accessibilityHint("Choose this one")
    }
}

/// Scales to 0.97 while pressed; no scale under Reduce Motion.
private struct PressScale: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            // Task 6 replaces this with IrisMotion.animation(IrisTokens.Motion.snappy, reduceMotion: reduceMotion).
            .animation(reduceMotion ? .easeInOut(duration: 0.2) : IrisTokens.Motion.snappy, value: configuration.isPressed)
    }
}
