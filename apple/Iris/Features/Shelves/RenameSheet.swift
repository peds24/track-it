import SwiftUI

/// Rename a track (A15: reversible, so no confirmation). A sheet, not a
/// text-field alert: UIKit's alert crashed in layout when the text size
/// changed while it was open (I12 audit).
struct RenameSheet: View {
    let original: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var draft: String
    @FocusState private var focused: Bool

    init(original: String, onSave: @escaping (String) -> Void) {
        self.original = original
        self.onSave = onSave
        _draft = State(initialValue: original)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $draft, axis: .vertical)
                    .focused($focused)
                    .accessibilityIdentifier("rename.title")
            }
            .navigationTitle("Rename Track")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(draft); dismiss() }
                        // The Library ignores an empty title anyway (I7); don't offer it.
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("rename.save")
                }
            }
            .onAppear { focused = true }
        }
    }
}
