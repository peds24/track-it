import IrisCore
import SwiftUI

/// A26: "Finished X — rank it against the other …?", asked once an action has
/// finished a track that isn't rated yet (offerRatingIfFinished in TS).
struct RatePromptItem: Identifiable, Equatable {
    let ref: TrackRef
    let title: String
    let category: IrisCore.Category
    var id: String { ratingKey(ref) }
}

extension View {
    /// The prompt as an alert: Later, or Rate it (which hands the item back).
    func ratePrompt(_ item: Binding<RatePromptItem?>, onRate: @escaping (RatePromptItem) -> Void) -> some View {
        let text = item.wrappedValue.map { IrisCore.ratePrompt(title: $0.title, category: $0.category) }
        return alert(text?.title ?? "", isPresented: Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } }),
                     presenting: item.wrappedValue) { prompt in
            Button("Later", role: .cancel) {}
            Button("Rate it") { onRate(prompt) }
        } message: { _ in
            Text(text?.message ?? "")
        }
    }
}
