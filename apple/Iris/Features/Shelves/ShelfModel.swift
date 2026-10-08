import Foundation
import IrisCore
import Observation

/// What a shelf needs from the library: `Library`, or a fake in tests.
protocol ShelfLibrary: Sendable {
    func tracks(shelf: Shelf, category: IrisCore.Category?) -> AsyncStream<Result<[TrackSummary], Error>>
    func scores() -> AsyncStream<[String: RowRating]>
    func advance(entryId: String, now: Date) async throws
    func resume(_ track: TrackRef) async throws
    func returnToBacklog(_ track: TrackRef) async throws
    func complete(_ track: TrackRef, now: Date) async throws
    func rename(_ track: TrackRef, title: String) async throws
    func delete(_ track: TrackRef) async throws
    func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool
}

extension Library: ShelfLibrary {}

/// One tab's state (I7): the live list, the action in flight, and what to ask
/// or report. The behaviour and copy are those of app/(tabs)/*.tsx and
/// SwipeableTrackRow.tsx.
@MainActor @Observable
final class ShelfModel {
    enum Pending: Identifiable, Equatable {
        case delete(TrackSummary), complete(TrackSummary), moveToBacklog(TrackSummary)
        var track: TrackSummary {
            switch self { case let .delete(t), let .complete(t), let .moveToBacklog(t): t }
        }
        var id: String {
            switch self {
            case let .delete(t): "delete:\(t.id)"
            case let .complete(t): "complete:\(t.id)"
            case let .moveToBacklog(t): "move:\(t.id)"
            }
        }
    }

    struct Failure: Identifiable, Equatable {
        let id = UUID()
        let title: String
        let message: String
    }

    struct Section: Identifiable, Equatable {
        let category: IrisCore.Category
        let tracks: [TrackSummary]
        var id: String { category.rawValue }
    }

    /// Currently's groups, in TS order.
    static let sectionOrder: [IrisCore.Category] = [.show, .movie, .book, .comic, .manga]

    let shelf: Shelf
    /// Backlog and Done filter by category; nil is "All".
    var category: IrisCore.Category? {
        didSet { if oldValue != category { restart() } }
    }
    private(set) var tracks: [TrackSummary] = []
    private(set) var ratings: [String: RowRating] = [:]
    private(set) var loaded = false
    /// Bumped by every successful advance or completion: the view's haptic trigger.
    private(set) var commits = 0
    var pending: Pending?
    var failure: Failure?

    @ObservationIgnored private let library: any ShelfLibrary
    @ObservationIgnored private let registry: ProviderRegistry?
    @ObservationIgnored private var observers: [Task<Void, Never>] = []

    init(shelf: Shelf, library: any ShelfLibrary, registry: ProviderRegistry?) {
        self.shelf = shelf
        self.library = library
        self.registry = registry
    }

    isolated deinit { observers.forEach { $0.cancel() } }

    /// Begins observing; calling it again is a no-op.
    func start() {
        guard observers.isEmpty else { return }
        let tracks = library.tracks(shelf: shelf, category: category)
        observers.append(Task { [weak self] in
            for await result in tracks {
                guard let self else { return }
                switch result {
                case let .success(value): self.tracks = value; self.loaded = true
                case let .failure(error):
                    self.failure = Failure(title: "Could not load your tracks", message: Self.message(error))
                    // The stream has ended; forget it so the next appearance's
                    // start() subscribes again (TS reloads on focus), rather than
                    // leaving a shelf that silently stops updating.
                    self.observers.forEach { $0.cancel() }
                    self.observers = []
                    return
                }
            }
        })
        guard shelf == .done else { return }
        let scores = library.scores()
        observers.append(Task { [weak self] in
            for await value in scores {
                guard let self else { return }
                self.ratings = value
            }
        })
    }

    private func restart() {
        observers.forEach { $0.cancel() }
        observers = []
        start()
    }

    var sections: [Section] {
        Self.sectionOrder.compactMap { category in
            let group = tracks.filter { $0.category == category }
            return group.isEmpty ? nil : Section(category: category, tracks: group)
        }
    }

    func rowModel(_ track: TrackSummary) -> IrisShelfRow.Model {
        IrisShelfRow.Model(track, rating: ratings[ratingKey(track.ref)])
    }

    // MARK: Actions

    /// The row's button or leading swipe: advance the next unit, or resume.
    func performAccessory(_ track: TrackSummary) async {
        guard let action = rowAction(track) else { return }
        switch action.kind {
        case .resume:
            await run("Could not resume track") { try await $0.resume(track.ref) }
        case .advance:
            let advanced = await run("Could not update") { try await $0.advance(entryId: action.entryId, now: Date()) }
            guard advanced else { return }
            commits += 1
            // A25: a catalogued comic moves its issue along; observation shows it.
            _ = await library.syncAfterAdvance(entryId: action.entryId, registry: registry)
        }
    }

    /// A6: pausing is reversible, so it never asks.
    func pause(_ track: TrackSummary) async {
        await run("Could not move track") { try await $0.returnToBacklog(track.ref) }
    }

    func requestMoveToBacklog(_ track: TrackSummary) { pending = .moveToBacklog(track) }
    func requestDelete(_ track: TrackSummary) { pending = .delete(track) }
    func requestComplete(_ track: TrackSummary) { pending = .complete(track) }

    func confirm(_ p: Pending) async {
        pending = nil
        switch p {
        case let .delete(t): await run("Could not delete") { try await $0.delete(t.ref) }
        case let .moveToBacklog(t): await run("Could not move track") { try await $0.returnToBacklog(t.ref) }
        case let .complete(t):
            if await run("Could not complete", { try await $0.complete(t.ref, now: Date()) }) { commits += 1 }
        }
    }

    /// A15: reversible, so no confirmation.
    func rename(_ track: TrackSummary, to title: String) async {
        await run("Could not rename track") { try await $0.rename(track.ref, title: title) }
    }

    @discardableResult
    private func run(_ title: String, _ op: (any ShelfLibrary) async throws -> Void) async -> Bool {
        do {
            try await op(library)
            return true
        } catch {
            failure = Failure(title: title, message: Self.message(error))
            return false
        }
    }

    static func message(_ error: Error) -> String { (error as? DomainError)?.message ?? error.localizedDescription }

    // MARK: Confirmation copy (SwipeableTrackRow.tsx, verbatim)

    static func dialogTitle(_ p: Pending) -> String {
        switch p {
        case let .delete(t): "Delete \(t.title)?"
        case let .complete(t): "Mark \(t.title) complete?"
        case let .moveToBacklog(t): "Move \(t.title) to the backlog?"
        }
    }

    static func dialogMessage(_ p: Pending) -> String {
        switch p {
        case let .delete(t):
            t.kind == .series
                ? "This removes the track and every episode, issue or volume under it. It cannot be undone."
                : "This removes the track. It cannot be undone."
        case let .complete(t): completionMessage(t)
        case .moveToBacklog: "Its progress will be cleared — the backlog only holds things you have not started."
        }
    }

    static func confirmLabel(_ p: Pending) -> String {
        switch p {
        case .delete: "Delete"
        case .complete: "Complete"
        case .moveToBacklog: "Move"
        }
    }

    static func isDestructive(_ p: Pending) -> Bool {
        if case .complete = p { return false }
        return true
    }
}
