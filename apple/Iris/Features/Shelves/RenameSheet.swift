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
                // One line: a title has no line breaks, and Return saves (review M2).
                TextField("Title", text: $draft)
                    .focused($focused)
                    .submitLabel(.done)
                    .onSubmit(save)
                    .accessibilityIdentifier("rename.title")
            }
            .navigationTitle("Rename Track")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: save)
                        // The Library ignores an empty title anyway (I7); don't offer it.
                        .disabled(!canSave)
                        .accessibilityIdentifier("rename.save")
                }
            }
            .onAppear { focused = true }
        }
    }

    private var canSave: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private func save() {
        guard canSave else { return }
        onSave(draft)
        dismiss()
    }
}
