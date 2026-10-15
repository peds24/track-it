import SwiftUI

/// Secondary flows (components.md § IrisSheet, §5.3): system sheet, detents,
/// visible grabber, system corner radius (iOS 26 sheets are glass already).
extension View {
    func irisSheet<Content: View>(
        isPresented: Binding<Bool>,
        detents: Set<PresentationDetent> = [.medium, .large],
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        sheet(isPresented: isPresented) {
            content()
                .presentationDetents(detents)
                .presentationDragIndicator(.visible)
        }
    }

    /// The same, presenting one item at a time (the Rate sheet, I12).
    func irisSheet<Item: Identifiable, Content: View>(
        item: Binding<Item?>,
        detents: Set<PresentationDetent> = [.medium, .large],
        @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
        sheet(item: item) { value in
            content(value)
                .presentationDetents(detents)
                .presentationDragIndicator(.visible)
        }
    }
}
