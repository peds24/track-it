import IrisCore
import SwiftUI

/// A26's Rate sheet (spec §6): how you felt, then "which did you prefer?",
/// then where it landed. Cancel at any point saves nothing.
struct RateView: View {
    @State var model: RateModel
    /// "See your movies": the presenter pushes Rankings once the sheet has gone.
    let onSeeRankings: (IrisCore.Category) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    if !isResult {
                        ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    }
                }
        }
        .alert(item: $model.failure) { Alert(title: Text($0.title), message: Text($0.message)) }
        .sensoryFeedback(.success, trigger: isResult)
        .sensoryFeedback(.selection, trigger: model.ties)
        .task { if model.step == .loading { await model.start() } }
    }

    private var isResult: Bool { if case .result = model.step { return true } else { return false } }

    private var title: String {
        switch model.step {
        case .comparing, .saving: "Which did you prefer?"
        case .result: "Rated"
        default: "Rate"
        }
    }

    private var category: IrisCore.Category { model.context?.detail.summary.category ?? .movie }

    @ViewBuilder private var content: some View {
        switch model.step {
        case .loading: ProgressView()
        case .missing: IrisEmptyState("Not found", symbol: .emptyShelf, message: DetailModel.missingMessage)
        case .sentiment: sentiment
        case .comparing, .saving: comparing
        case let .result(summary): result(summary)
        }
    }

    // MARK: Steps

    private var sentiment: some View {
        ScrollView {
            VStack(spacing: IrisTokens.Space.lg) {
                if let context = model.context {
                    let track = context.detail.summary
                    IrisCover(url: context.detail.metadata.coverUrl, title: track.title, category: track.category, size: .card, decorative: false)
                    Text(track.title).font(IrisTokens.Typography.title2.font).multilineTextAlignment(.center)
                    Text("How was it?").font(IrisTokens.Typography.title3.font)
                    if let existing = context.existing {
                        Text(existingRatingNote(existing, category: track.category))
                            .font(IrisTokens.Typography.subheadline.font).multilineTextAlignment(.center)
                    }
                    VStack(spacing: IrisTokens.Space.sm) {
                        ForEach(Sentiment.allCases, id: \.self) { s in
                            Button { Task { await model.choose(s) } } label: {
                                Text(sentimentLabel(s))
                                    .font(IrisTokens.Typography.headline.font)
                                    .frame(maxWidth: .infinity, minHeight: 50)
                                    .background(Self.fill(s), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    Text(rateFootnote(track.category))
                        .font(IrisTokens.Typography.footnote.font).multilineTextAlignment(.center)
                }
            }
            .foregroundStyle(IrisTokens.Colors.label)
            .padding(IrisTokens.Space.lg)
        }
    }

    private var comparing: some View {
        ScrollView {
            VStack(spacing: IrisTokens.Space.lg) {
                if let context = model.context, let session = model.session, let opponent = model.opponent {
                    let track = context.detail.summary
                    Text("Which did you prefer?").font(IrisTokens.Typography.title3.font)
                    if let reason = model.reason { Text(reason).font(IrisTokens.Typography.subheadline.font.weight(.semibold)) }
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .top, spacing: IrisTokens.Space.md) { cards(track, context, opponent) }
                        VStack(spacing: IrisTokens.Space.md) { cards(track, context, opponent) }
                    }
                    .disabled(model.step == .saving)
                    Button { Task { await model.answer(.tie) } } label: {
                        Text("Too tough to call")
                            .font(IrisTokens.Typography.headline.font)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(IrisTokens.Colors.fill, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    Button { model.undo() } label: {
                        // The 44 pt frame inside the label: outside a plain button it isn't the hit area.
                        Text(undoLabel(answered: model.history.count))
                            .font(IrisTokens.Typography.subheadline.font.weight(.semibold))
                            .underline()
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    Text(questionFootnote(comparisons: session.comparisons, sentiment: session.sentiment, category: track.category))
                        .font(IrisTokens.Typography.footnote.font)
                }
            }
            .foregroundStyle(IrisTokens.Colors.label)
            .padding(IrisTokens.Space.lg)
        }
        .overlay { if model.step == .saving { ProgressView() } }
    }

    @ViewBuilder private func cards(_ track: TrackSummary, _ context: RateContext, _ opponent: RankedTrack) -> some View {
        IrisComparisonCard(title: track.title, subtitle: Self.meta(context.detail.metadata.creator, context.detail.metadata.releaseYear),
                           coverURL: context.detail.metadata.coverUrl, category: track.category) {
            Task { await model.answer(.candidate) }
        }
        .accessibilityIdentifier("rate.candidate")
        IrisComparisonCard(title: opponent.title, subtitle: Self.meta(opponent.creator, opponent.releaseYear),
                           coverURL: opponent.coverUrl, category: track.category) {
            Task { await model.answer(.opponent) }
        }
        .accessibilityIdentifier("rate.opponent")
    }

    private func result(_ summary: RatingSummary) -> some View {
        ScrollView {
            VStack(spacing: IrisTokens.Space.lg) {
                if let context = model.context {
                    let track = context.detail.summary
                    IrisCover(url: context.detail.metadata.coverUrl, title: track.title, category: track.category, size: .card)
                    Text(track.title).font(IrisTokens.Typography.title2.font).multilineTextAlignment(.center)
                    IrisRatingBadge(score: summary.score, sentiment: summary.sentiment, large: true)
                        .accessibilityLabel(scoredLabel(summary.score))
                    Text(rankLine(rank: summary.rank, outOf: summary.outOf, category: track.category))
                        .font(IrisTokens.Typography.headline.font)
                    IrisPrimaryButton("Done", fullWidth: true) { dismiss() }
                        .accessibilityIdentifier("rate.done")
                    Button {
                        let category = track.category
                        dismiss()
                        onSeeRankings(category)
                    } label: {
                        Text(seeYourLabel(track.category))
                            .font(IrisTokens.Typography.headline.font)
                            .frame(minWidth: 44, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .foregroundStyle(IrisTokens.Colors.label)
            .padding(IrisTokens.Space.lg)
        }
    }

    /// The sentiment buttons' fills, as the badge's (label text on every one).
    static func fill(_ s: Sentiment) -> Color {
        switch s {
        case .liked: IrisTokens.Colors.accent.opacity(0.22)
        case .fine: IrisTokens.Colors.fill
        case .disliked: IrisTokens.Colors.destructive.opacity(0.15)
        }
    }

    static func meta(_ creator: String?, _ year: String?) -> String? {
        let s = [creator, year].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        return s.isEmpty ? nil : s
    }
}
