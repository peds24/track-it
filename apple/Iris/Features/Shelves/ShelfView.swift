import IrisCore
import SwiftUI

/// One shelf tab (I7, spec §5/§6): a system list of IrisShelfRows. The commit
/// action is a leading full swipe, Pause/Delete sit in the trailing swipe, and
/// everything else is in the context menu. Destructive steps confirm first.
struct ShelfView: View {
    @Bindable var model: ShelfModel
    /// Builds the detail screen's model for a tapped row (I8).
    let makeDetail: @MainActor (TrackRef) -> DetailModel
    /// The Add sheet's model (I9); nil on Done, which has no Add.
    let makeAdd: (@MainActor () -> AddModel)?
    @State private var adding: AddModel?
    /// The Add sheet's model, kept past its dismissal: its rate prompt, if any,
    /// is asked here once the sheet has gone (I10). Kept from when the sheet
    /// opens, because the item binding isn't reliably cleared before onDismiss.
    @State private var lastAdd: AddModel?
    @State private var rating: RatePromptItem?
    @State private var rankingsCategory: IrisCore.Category?
    @Environment(\.irisFactories) private var factories

    @State private var opened: TrackRef?
    @State private var renaming: TrackSummary?
    /// Done's More menu (I12): feedback (A25) and data sources (A27).
    @State private var sendingFeedback = false
    @State private var showingDataSources = false
    /// Haptic for swipe and menu commits; the row button has its own (kit).
    /// It plays when the model reports the write succeeded, not on the gesture (I12).
    @State private var swipeCommits = 0
    @State private var hapticOnNextCommit = false

    var body: some View {
        content
            .navigationTitle(Self.title(model.shelf))
            .toolbar { filterMenu; addButton; rankingsButton; moreMenu }
            .sheet(item: Binding(get: { adding.map(AddSheetItem.init) }, set: { if $0 == nil { adding = nil } }),
                   onDismiss: {
                       if let prompt = lastAdd?.ratePrompt { model.ratePrompt = prompt }
                       lastAdd = nil
                   }) { item in
                AddView(model: item.model)
            }
            .ratePrompt($model.ratePrompt) { rating = $0 }
            .irisSheet(item: $rating, detents: [.large]) { item in
                if let factories { RateView(model: factories.rate(item.ref)) { rankingsCategory = $0 } }
            }
            .navigationDestination(item: $rankingsCategory) { category in
                if let factories { RankingsView(model: factories.rankings(category)) }
            }
            .navigationDestination(item: $opened) { TrackDetailView(model: makeDetail($0)) }
            .confirmationDialog(
                model.pending.map(ShelfModel.dialogTitle) ?? "",
                isPresented: Binding(get: { model.pending != nil }, set: { if !$0 { model.pending = nil } }),
                titleVisibility: .visible,
                presenting: model.pending
            ) { pending in
                Button(ShelfModel.confirmLabel(pending), role: ShelfModel.isDestructive(pending) ? .destructive : nil) {
                    if case .complete = pending { hapticOnNextCommit = true }
                    Task { await model.confirm(pending) }
                }
                Button("Cancel", role: .cancel) { model.pending = nil }
            } message: { Text(ShelfModel.dialogMessage($0)) }
            .alert(item: $model.failure) { failure in
                Alert(title: Text(failure.title), message: Text(failure.message))
            }
            .irisSheet(isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } }), detents: [.medium]) {
                if let track = renaming {
                    RenameSheet(original: track.title) { title in Task { await model.rename(track, to: title) } }
                }
            }
            .irisSheet(isPresented: $sendingFeedback, detents: [.medium, .large]) { FeedbackSheet() }
            .irisSheet(isPresented: $showingDataSources, detents: [.medium]) { DataSourcesSheet() }
            .sensoryFeedback(.success, trigger: swipeCommits)
            .onChange(of: model.commits) {
                if hapticOnNextCommit { swipeCommits += 1 }
                hapticOnNextCommit = false
            }
            .onChange(of: model.failure?.id) { hapticOnNextCommit = false }
            .task { model.start() }
    }

    @ViewBuilder private var content: some View {
        if model.loaded && model.tracks.isEmpty {
            let empty = Self.empty(model.shelf)
            IrisEmptyState(empty.title, symbol: .emptyShelf, message: empty.message)
        } else {
            List {
                if model.shelf == .currently {
                    ForEach(model.sections) { section in
                        Section {
                            rows(section.tracks)
                        } header: {
                            HStack {
                                Label(section.category.plural.capitalized, systemImage: section.category.symbol.systemName)
                                Spacer()
                                Text("\(section.tracks.count)").monospacedDigit()
                            }
                            // Label colour, not the default grey: the audit found that too faint.
                            .font(IrisTokens.Typography.headline.font)
                            .foregroundStyle(IrisTokens.Colors.label)
                            .textCase(nil)
                            .accessibilityElement(children: .combine)
                        }
                    }
                } else {
                    Section { rows(model.tracks) }
                }
            }
            .listStyle(.insetGrouped)
            .accessibilityIdentifier("shelf.\(model.shelf.rawValue)")
        }
    }

    private func rows(_ tracks: [TrackSummary]) -> some View {
        ForEach(tracks, id: \.id) { track in
            IrisShelfRow(model.rowModel(track), onOpen: { opened = track.ref }, onAccessory: {
                if model.rowModel(track).accessory == .rate {
                    rating = RatePromptItem(ref: track.ref, title: track.title, category: track.category)
                    return
                }
                Task { await model.performAccessory(track) }
            })
            .accessibilityIdentifier("row.\(track.id)")
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                if let action = rowAction(track) {
                    Button(action.label, systemImage: (action.kind == .resume || track.shelf == .backlog ? IrisSymbol.start : .advance).systemName) {
                        hapticOnNextCommit = true
                        Task { await model.performAccessory(track) }
                    }
                    .tint(IrisTokens.Colors.accent)
                }
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                Button("Delete", systemImage: IrisSymbol.delete.systemName, role: .destructive) { model.requestDelete(track) }
                if track.shelf == .currently {
                    Button("Pause", systemImage: IrisSymbol.pause.systemName) { Task { await model.pause(track) } }
                } else if track.shelf == .done {
                    Button("Backlog", systemImage: IrisSymbol.emptyShelf.systemName) { model.requestMoveToBacklog(track) }
                }
            }
            .contextMenu {
                Button("Rename…", systemImage: "pencil") { renaming = track }
                if track.shelf == .currently {
                    Button("Pause", systemImage: IrisSymbol.pause.systemName) { Task { await model.pause(track) } }
                }
                if track.shelf != .done {
                    Button("Complete…", systemImage: "checkmark.circle") { model.requestComplete(track) }
                } else {
                    Button("Move to Backlog…", systemImage: IrisSymbol.emptyShelf.systemName) { model.requestMoveToBacklog(track) }
                }
                Divider()
                Button("Delete…", systemImage: IrisSymbol.delete.systemName, role: .destructive) { model.requestDelete(track) }
            }
        }
    }

    /// Spec §6: Finished's toolbar opens Rankings (A26).
    @ToolbarContentBuilder private var rankingsButton: some ToolbarContent {
        if model.shelf == .done {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Rankings", systemImage: IrisSymbol.rankings.systemName) { rankingsCategory = model.category ?? .movie }
                    .accessibilityIdentifier("shelf.rankings")
            }
        }
    }

    /// Spec §6 Finished: everything that isn't a track lives behind More.
    @ToolbarContentBuilder private var moreMenu: some ToolbarContent {
        if model.shelf == .done {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button("Send Feedback…", systemImage: "envelope") { sendingFeedback = true }
                    Button("Data Sources", systemImage: "info.circle") { showingDataSources = true }
                } label: {
                    Label("More", systemImage: IrisSymbol.more.systemName)
                }
                .accessibilityIdentifier("shelf.more")
            }
        }
    }

    @ToolbarContentBuilder private var addButton: some ToolbarContent {
        if let makeAdd {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add a track", systemImage: IrisSymbol.add.systemName) {
                    adding = makeAdd()
                    lastAdd = adding
                }
                    .accessibilityIdentifier("shelf.add")
            }
        }
    }

    @ToolbarContentBuilder private var filterMenu: some ToolbarContent {
        if model.shelf != .currently {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Category", selection: $model.category) {
                        Text("All").tag(IrisCore.Category?.none)
                        ForEach(IrisCore.Category.allCases, id: \.self) { category in
                            Label(category.plural.capitalized, systemImage: category.symbol.systemName).tag(Optional(category))
                        }
                    }
                } label: {
                    Label("Filter", systemImage: model.category == nil
                          ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                }
                .accessibilityIdentifier("shelf.filter")
            }
        }
    }

    static func title(_ shelf: Shelf) -> String {
        switch shelf {
        case .currently: "Currently"
        case .backlog: "Backlog"
        case .done: "Done"
        }
    }

    /// The TS screens' empty-state copy.
    static func empty(_ shelf: Shelf) -> (title: String, message: String) {
        switch shelf {
        case .currently: ("Nothing on the go", "Add something new, or start a track from your backlog.")
        case .backlog: ("Nothing here yet", "Tracks in your backlog will appear here.")
        case .done: ("Nothing finished yet", "Completed tracks will be listed here.")
        }
    }
}

/// Identifies one presentation of the Add sheet.
private struct AddSheetItem: Identifiable {
    let model: AddModel
    var id: ObjectIdentifier { ObjectIdentifier(model) }
}
