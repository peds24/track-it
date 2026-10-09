import IrisCore
import SwiftUI

/// A12: put a series on a given unit ("Edit track number"). Season and unit
/// fields follow the shared rule (IrisCore `positionEdit`, held to TS by
/// fixtures); Save stays disabled until the rule yields a target.
struct PositionEditorSheet: View {
    let track: TrackSummary
    let onSave: (Int) -> Void
    let onCancel: () -> Void

    @State private var season = ""
    @State private var unit = ""
    @FocusState private var unitFocused: Bool

    static func target(_ track: TrackSummary, season: String, unit: String) -> Int? {
        positionEdit(track, seasonText: season, unitText: unit).target
    }

    var body: some View {
        let edit = positionEdit(track, seasonText: season, unitText: unit)
        NavigationStack {
            Form {
                Section {
                    if edit.seasoned {
                        field("Season", text: $season, placeholder: edit.seasonPlaceholder, total: edit.seasonCount, id: "editor.season")
                    }
                    field(edit.unitWord, text: $unit, placeholder: edit.unitPlaceholder, total: edit.unitTotal, id: "editor.unit")
                        .focused($unitFocused)
                } footer: {
                    Text(track.title)
                }
            }
            .navigationTitle("Edit track number")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { if let target = edit.target { onSave(target) } }
                        .disabled(edit.target == nil)
                        .accessibilityIdentifier("editor.save")
                }
            }
            .onAppear { unitFocused = true }
        }
    }

    private func field(_ label: String, text: Binding<String>, placeholder: Int?, total: Int?, id: String) -> some View {
        LabeledContent(label) {
            HStack(spacing: IrisTokens.Space.sm) {
                TextField(placeholder.map(String.init) ?? "", text: text)
                    .keyboardType(.numberPad)
                    .multilineTextAlignment(.trailing)
                    .accessibilityLabel("\(label) number")
                    .accessibilityIdentifier(id)
                Text(total.map { "of \($0)" } ?? "—")
                    .foregroundStyle(IrisTokens.Colors.label)
                    .monospacedDigit()
            }
        }
    }
}
