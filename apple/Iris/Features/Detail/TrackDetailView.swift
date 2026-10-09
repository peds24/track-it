import IrisCore
import SwiftUI

/// One track, in full (I8, A22): cover, credit, where you are, the timeline,
/// the rating card, what it's about, and every action. The main action is a
/// button pinned to the bottom; the rest sit in the toolbar menu.
struct TrackDetailView: View {
    @State var model: DetailModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        content
            .navigationTitle(model.track?.title ?? "")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { actionsMenu }
            .confirmationDialog(
                dialogTitle,
                isPresented: Binding(get: { model.pending != nil }, set: { if !$0 { model.pending = nil } }),
                titleVisibility: .visible,
                presenting: model.pending
            ) { pending in
                Button(DetailModel.confirmLabel(pending), role: DetailModel.isDestructive(pending) ? .destructive : nil) {
                    Task { await model.confirm(pending) }
                }
                Button("Cancel", role: .cancel) { model.pending = nil }
            } message: { pending in
                if let track = model.track { Text(DetailModel.dialogMessage(pending, track)) }
            }
            .alert(item: $model.failure) { Alert(title: Text($0.title), message: Text($0.message)) }
            .irisSheet(isPresented: $model.editing, detents: [.medium]) {
                if let track = model.track {
                    PositionEditorSheet(track: track, onSave: { ordinal in Task { await model.setPosition(ordinal) } },
                                        onCancel: { model.editing = false })
                }
            }
            .sensoryFeedback(.success, trigger: model.commits)
            .onChange(of: model.dismissed) { _, gone in if gone { dismiss() } }
            .task { model.start() }
    }

    private var dialogTitle: String {
        guard let p = model.pending, let track = model.track else { return "" }
        return DetailModel.dialogTitle(p, track)
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
        case .missing:
            IrisEmptyState("Not found", symbol: .emptyShelf, message: DetailModel.missingMessage)
        case let .loaded(page):
            loaded(page)
        }
    }

    private func loaded(_ page: TrackPage) -> some View {
        let track = page.detail.summary
        let metadata = page.detail.metadata
        let now = toISOString(Date())
        return List {
            Section {
                VStack(spacing: IrisTokens.Space.sm) {
                    IrisCover(url: metadata.coverUrl, title: track.title, category: track.category, size: .hero, decorative: false)
                        .padding(.bottom, IrisTokens.Space.sm)
                    Text(track.title)
                        .font(IrisTokens.Typography.title2.font)
                        .multilineTextAlignment(.center)
                    if let credit = creatorLine(track.category, creator: metadata.creator) {
                        Text(credit).font(IrisTokens.Typography.subheadline.font)
                    }
                    Text(detailMeta(track, releaseYear: metadata.releaseYear))
                        .font(IrisTokens.Typography.footnote.font)
                }
                .foregroundStyle(IrisTokens.Colors.label)
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }

            Section("Progress") {
                VStack(alignment: .leading, spacing: IrisTokens.Space.sm) {
                    Text(seasonPositionLabel(track) ?? positionLabel(track)).font(IrisTokens.Typography.headline.font)
                    if let caption = progressCaption(track, unitLabel: page.detail.unitLabel) {
                        Text(caption).font(IrisTokens.Typography.subheadline.font)
                    }
                    // Flat, as on Android's detail screen (the shelves segment by season).
                    if let p = track.progress, p.total > 0 { IrisProgress(.flat(done: p.done, total: p.total)) }
                }
                .padding(.vertical, IrisTokens.Space.xs)
            }

            Section {
                ForEach(detailStats(page.detail.timeline, now: now), id: \.label) { stat in
                    LabeledContent(stat.label, value: stat.value)
                }
            } header: {
                Text("Timeline")
            } footer: {
                if let activity = activityLine(track.category, timeline: page.detail.timeline, now: now) { Text(activity) }
            }

            if page.rating != nil || track.shelf == .done {
                Section("Rating") { ratingCard(page.rating, track) }
            }

            if let description = cleanDescription(metadata.description) {
                Section("About") { ExpandableText(text: description) }
            }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom) {
            if let label = detailPrimaryLabel(track) {
                IrisPrimaryButton(label, fullWidth: true) { Task { await model.primary() } }
                    .padding(.horizontal, IrisTokens.Space.lg)
                    .padding(.bottom, IrisTokens.Space.sm)
                    .accessibilityIdentifier("detail.primary")
            }
        }
        .accessibilityIdentifier("detail.\(track.id)")
    }

    @ViewBuilder private func ratingCard(_ rating: RatingSummary?, _ track: TrackSummary) -> some View {
        if let rating {
            HStack(spacing: IrisTokens.Space.md) {
                IrisRatingBadge(score: rating.score, sentiment: rating.sentiment)
                VStack(alignment: .leading, spacing: IrisTokens.Space.xxs) {
                    Text("#\(rating.rank) of \(rating.outOf) \(track.category.plural)").font(IrisTokens.Typography.headline.font)
                    Text(Self.sentimentLabel(rating.sentiment)).font(IrisTokens.Typography.subheadline.font)
                }
            }
            .accessibilityElement(children: .combine)
        } else {
            Text("Not rated yet. Rank it against the other \(track.category.plural) you’ve finished.")
                .font(IrisTokens.Typography.subheadline.font)
        }
    }

    /// SENTIMENT_LABEL in src/ui/rating.ts.
    static func sentimentLabel(_ s: Sentiment) -> String {
        switch s {
        case .liked: "I liked it"
        case .fine: "It was fine"
        case .disliked: "I didn’t like it"
        }
    }

    @ToolbarContentBuilder private var actionsMenu: some ToolbarContent {
        if let track = model.track {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    if canEditPosition(track) {
                        Button("Edit position", systemImage: "number") { model.editing = true }
                    }
                    if track.shelf != .done {
                        Button("Complete…", systemImage: "checkmark.circle") { model.requestComplete() }
                    }
                    if track.shelf == .currently {
                        Button("Pause", systemImage: IrisSymbol.pause.systemName) { Task { await model.pauseOrRequestMove() } }
                    } else if track.shelf == .done {
                        Button("Move to Backlog…", systemImage: IrisSymbol.emptyShelf.systemName) { Task { await model.pauseOrRequestMove() } }
                    }
                    Divider()
                    Button("Delete…", systemImage: IrisSymbol.delete.systemName, role: .destructive) { model.requestDelete() }
                } label: {
                    Label("Actions", systemImage: IrisSymbol.more.systemName)
                }
                .accessibilityIdentifier("detail.actions")
            }
        }
    }
}
