import IrisCore
import SwiftUI

/// One track on a shelf (components.md § IrisShelfRow). Presentational:
/// what the detail line says is decided by the shelf (I7).
struct IrisShelfRow: View {
    struct Model: Equatable {
        var title: String
        var category: IrisCore.Category
        var detail: String
        var progress: IrisProgress.Value?
        var coverURL: String?
        var accessory: Accessory

        var accessibilityLabel: String { "\(title), \(category.label), \(detail)" }

        /// The accessory's VoiceOver custom action; nil when it does nothing.
        var accessoryActionName: String? {
            switch accessory {
            case let .action(_, _, name): name
            case .rate: "Rate \(title)"
            case .none, .rating: nil
            }
        }

        static func titleLineLimit(isAccessibilitySize: Bool) -> Int? { isAccessibilitySize ? nil : 2 }
    }

    enum Accessory: Equatable {
        case none
        case action(title: String, symbol: IrisSymbol, accessibilityName: String)
        case rating(score: Double, sentiment: Sentiment)
        case rate
    }

    let model: Model
    let onOpen: () -> Void
    let onAccessory: () -> Void

    init(_ model: Model, onOpen: @escaping () -> Void, onAccessory: @escaping () -> Void = {}) {
        self.model = model; self.onOpen = onOpen; self.onAccessory = onAccessory
    }

    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var commits = 0

    var body: some View {
        let ax = typeSize.isAccessibilitySize
        Group {
            if ax {
                VStack(alignment: .leading, spacing: IrisTokens.Space.sm) {
                    cover
                    title(ax)
                    text
                    accessory.frame(maxWidth: .infinity, alignment: .leading)
                }
            } else {
                HStack(alignment: .center, spacing: IrisTokens.Space.md) {
                    cover
                    VStack(alignment: .leading, spacing: IrisTokens.Space.xs) { title(ax); text }
                    Spacer(minLength: 0)
                    accessory.fixedSize().layoutPriority(1)
                }
            }
        }
        .padding(.vertical, IrisTokens.Space.md)
        .contentShape(Rectangle())
        .onTapGesture(perform: onOpen)
        .sensoryFeedback(.success, trigger: commits)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.accessibilityLabel)
        .accessibilityValue(model.progress?.accessibilityValue ?? "")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(.default, onOpen)
        .modifier(AccessoryAction(name: model.accessoryActionName, perform: commit))
    }

    private var cover: some View { IrisCover(url: model.coverURL, title: model.title, category: model.category, size: .row) }

    private func title(_ ax: Bool) -> some View {
        Text(model.title)
            .font(IrisTokens.Typography.headline.font)
            .foregroundStyle(IrisTokens.Colors.label)
            .lineLimit(Model.titleLineLimit(isAccessibilitySize: ax))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: IrisTokens.Space.xs) {
            // One wrapping line, so a long detail flows instead of squeezing a column.
            Text("\(IrisCategoryChip.inline(model.category)) \(Text("·").foregroundStyle(IrisTokens.Colors.tertiaryLabel)) \(Text(model.detail).foregroundStyle(IrisTokens.Colors.secondaryLabel))")
                .font(IrisTokens.Typography.subheadline.font)
                .fixedSize(horizontal: false, vertical: true)
            if let progress = model.progress { IrisProgress(progress).padding(.top, IrisTokens.Space.xxs) }
        }
    }

    @ViewBuilder private var accessory: some View {
        switch model.accessory {
        case .none: EmptyView()
        case let .rating(score, sentiment): IrisRatingBadge(score: score, sentiment: sentiment)
        case let .action(title, symbol, _): accessoryButton(title, symbol: symbol)
        case .rate: accessoryButton("Rate", symbol: .rate)
        }
    }

    private func accessoryButton(_ title: String, symbol: IrisSymbol) -> some View {
        Button(action: commit) {
            Label(title, systemImage: symbol.systemName)
                .labelStyle(.titleAndIcon)
                .font(IrisTokens.Typography.subheadline.font.weight(.semibold))
                .lineLimit(1)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .controlSize(.regular)
        .tint(IrisTokens.Colors.accent)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
    }

    private func commit() { commits += 1; onAccessory() }
}

private struct AccessoryAction: ViewModifier {
    let name: String?
    let perform: () -> Void
    func body(content: Content) -> some View {
        if let name { content.accessibilityAction(named: Text(name), perform) } else { content }
    }
}
