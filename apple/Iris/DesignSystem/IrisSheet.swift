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
}
