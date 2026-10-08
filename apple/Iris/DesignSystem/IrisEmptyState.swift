import SwiftUI

/// Nothing here yet (components.md § IrisEmptyState): the system view, Iris defaults.
struct IrisEmptyState: View {
    let title: String
    let symbol: IrisSymbol
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    init(_ title: String, symbol: IrisSymbol, message: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title; self.symbol = symbol; self.message = message; self.actionTitle = actionTitle; self.action = action
    }

    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol.systemName)
        } description: {
            Text(message)
        } actions: {
            if let actionTitle, let action { IrisPrimaryButton(actionTitle, symbol: .add, action: action) }
        }
    }
}
