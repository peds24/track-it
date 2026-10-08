import SwiftUI

/// The one prominent action on a screen or sheet (components.md § IrisPrimaryButton).
struct IrisPrimaryButton: View {
    let title: String
    var symbol: IrisSymbol?
    var fullWidth = false
    var inProgress = false
    let action: () -> Void

    init(_ title: String, symbol: IrisSymbol? = nil, fullWidth: Bool = false, inProgress: Bool = false, action: @escaping () -> Void) {
        self.title = title; self.symbol = symbol; self.fullWidth = fullWidth; self.inProgress = inProgress; self.action = action
    }

    @State private var taps = 0

    var body: some View {
        Button {
            taps += 1
            action()
        } label: {
            HStack(spacing: IrisTokens.Space.sm) {
                if inProgress { ProgressView() } else if let symbol { symbol.image }
                Text(title)
            }
            .font(IrisTokens.Typography.headline.font)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 50)
            .padding(.horizontal, IrisTokens.Space.lg)
        }
        .buttonStyle(.glassProminent)
        .tint(IrisTokens.Colors.accent)
        .disabled(inProgress)
        .sensoryFeedback(.success, trigger: taps)
        .accessibilityValue(inProgress ? "In progress" : "")
    }
}
