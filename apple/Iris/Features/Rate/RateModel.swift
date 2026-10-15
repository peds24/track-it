import Foundation
import IrisCore
import Observation

/// What the Rate screen needs from the library: `Library`, or a fake in tests.
protocol RateLibrary: Sendable {
    func rateContext(_ ref: TrackRef) async throws -> RateContext?
    func saveRating(_ track: RatableTrack, sentiment: Sentiment, indexInBucket: Int, now: Date) async throws -> RatingSummary
}

extension Library: RateLibrary {}

/// A26: rate a finished track the Beli way (app/rate/[kind]/[id].tsx): how
/// you felt, then "which did you prefer?" until it has a place. Nothing is
/// saved until it does; backing out leaves an earlier rating as it was.
@MainActor @Observable
final class RateModel {
    enum Step: Equatable { case loading, missing, sentiment, comparing, saving, result(RatingSummary) }

    let ref: TrackRef
    /// Bumped by "Too tough to call": the cards play their own haptic, a tie
    /// plays this one (I10 minor).
    private(set) var ties = 0
    private(set) var step: Step = .loading
    private(set) var context: RateContext?
    private(set) var session: RankingSession?
    private(set) var history: [RankingSession] = []
    var failure: ShelfModel.Failure?

    @ObservationIgnored private let library: any RateLibrary

    init(ref: TrackRef, library: any RateLibrary) {
        self.ref = ref
        self.library = library
    }

    func start() async {
        do {
            context = try await library.rateContext(ref)
        } catch {
            context = nil
        }
        step = context == nil ? .missing : .sentiment
    }

    /// The ranking row the current question compares against.
    var opponent: RankedTrack? {
        guard let session, let index = session.opponent, let context else { return nil }
        let key = session.bucket[index].key
        return context.ranking.first { $0.key == key }
    }

    /// "Both by Denis Villeneuve", when the two share a creator or genres.
    var reason: String? {
        guard let context, let opponent else { return nil }
        return matchupReason(context.profile, opponent.profile)
    }

    func choose(_ sentiment: Sentiment) async {
        guard let context else { return }
        let started = startRanking(context.profile, sentiment: sentiment, ranking: context.ranking.map(\.item))
        history = []
        session = started
        if isPlaced(started) {
            await finish(started)
        } else {
            step = .comparing
        }
    }

    func answer(_ choice: Answer) async {
        guard let current = session, step == .comparing else { return }
        if choice == .tie { ties += 1 }
        let next = IrisCore.answer(current, choice)
        history.append(current)
        session = next
        if isPlaced(next) {
            if !(await finish(next)) {
                // Saving failed: back to the question that placed it, to try again.
                session = history.popLast()
            }
        }
    }

    /// "Undo last answer", or with none, "Change how I felt".
    func undo() {
        if let previous = history.popLast() {
            session = previous
            step = .comparing
        } else {
            session = nil
            step = .sentiment
        }
    }

    @discardableResult
    private func finish(_ placed: RankingSession) async -> Bool {
        guard let context else { return false }
        let previous = step
        step = .saving
        let track = RatableTrack(kind: ref.kind, id: ref.id, category: context.detail.summary.category)
        do {
            let summary = try await library.saveRating(track, sentiment: placed.sentiment, indexInBucket: placed.lo, now: Date())
            step = .result(summary)
            return true
        } catch {
            failure = ShelfModel.Failure(title: "Could not save rating", message: ShelfModel.message(error))
            step = previous   // back where it was: the sentiment step, or the question
            return false
        }
    }
}
