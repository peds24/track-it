import Foundation
import IrisCore
import Observation

/// What the detail screen needs from the library: `Library`, or a fake in tests.
protocol DetailLibrary: Sendable {
    func detail(_ ref: TrackRef) -> AsyncStream<Result<TrackPage?, Error>>
    func advance(entryId: String, now: Date) async throws
    func resume(_ track: TrackRef) async throws
    func returnToBacklog(_ track: TrackRef) async throws
    func complete(_ track: TrackRef, now: Date) async throws
    func delete(_ track: TrackRef) async throws
    func setPosition(seriesId: String, ordinal: Int, now: Date) async throws
    func syncAfterMove(seriesId: String, registry: ProviderRegistry?) async -> Bool
}

extension Library: DetailLibrary {}

/// One track's screen (I8, A22). Behaviour and copy are app/track/[kind]/[id].tsx's,
/// which differ from the swipe row's in places ("Could not pause", "Its
/// progress will be cleared.").
@MainActor @Observable
final class DetailModel {
    enum State: Equatable { case loading, missing, loaded(TrackPage) }
    enum Pending: Identifiable, Equatable {
        case complete, moveToBacklog, delete
        var id: Self { self }
    }

    static let missingMessage = "This track couldn’t be found — it may have been deleted."

    let ref: TrackRef
    private(set) var state: State = .loading
    var pending: Pending?
    var failure: ShelfModel.Failure?
    /// The position editor sheet (A12).
    var editing = false
    /// Turns true once the track is deleted; the view pops.
    private(set) var dismissed = false
    /// Bumped by a successful completion (confirmed from a dialog): a haptic trigger.
    private(set) var commits = 0

    @ObservationIgnored private let library: any DetailLibrary
    @ObservationIgnored private let registry: ProviderRegistry?
    @ObservationIgnored private var observer: Task<Void, Never>?
    /// Set while our own delete runs: its nil page must not flash "not found" as we pop.
    @ObservationIgnored private var deleting = false

    init(ref: TrackRef, library: any DetailLibrary, registry: ProviderRegistry?) {
        self.ref = ref
        self.library = library
        self.registry = registry
    }

    isolated deinit { observer?.cancel() }

    var track: TrackSummary? {
        if case let .loaded(page) = state { return page.detail.summary }
        return nil
    }

    /// Begins observing; a no-op while already observing.
    func start() {
        guard observer == nil else { return }
        let pages = library.detail(ref)
        observer = Task { [weak self] in
            for await result in pages {
                guard let self else { return }
                switch result {
                case let .success(page?): self.state = .loaded(page)
                case .success(nil): if !self.deleting && !self.dismissed { self.state = .missing }
                case .failure:
                    // TS shows the not-found state for a failed read; keep a page
                    // already on screen. Forget the ended stream so the next
                    // appearance subscribes again.
                    if case .loading = self.state { self.state = .missing }
                    self.observer = nil
                    return
                }
            }
        }
    }

    // MARK: Actions

    /// The bottom button: advance the next unit, or resume.
    func primary() async {
        guard let track, let next = track.nextEntryId, !next.isEmpty else { return }
        if track.shelf == .backlog && track.paused {
            await run("Could not resume") { try await $0.resume(track.ref) }
            return
        }
        // No `commits` bump: IrisPrimaryButton plays its own haptic on the tap.
        guard await run("Could not update", { try await $0.advance(entryId: next, now: Date()) }) else { return }
        if track.kind == .series { _ = await library.syncAfterMove(seriesId: track.id, registry: registry) }
    }

    /// Currently: pause now (A6, reversible). Done: ask before clearing progress.
    func pauseOrRequestMove() async {
        guard let track else { return }
        if track.shelf == .done {
            pending = .moveToBacklog
        } else {
            await run("Could not pause") { try await $0.returnToBacklog(track.ref) }
        }
    }

    func requestComplete() { pending = .complete }
    func requestDelete() { pending = .delete }

    func confirm(_ p: Pending) async {
        pending = nil
        guard let track else { return }
        switch p {
        case .complete:
            if await run("Could not complete", { try await $0.complete(track.ref, now: Date()) }) { commits += 1 }
        case .moveToBacklog:
            await run("Could not move") { try await $0.returnToBacklog(track.ref) }
        case .delete:
            deleting = true
            if await run("Could not delete", { try await $0.delete(track.ref) }) { dismissed = true }
            deleting = false
        }
    }

    /// A12: Save in the position editor.
    func setPosition(_ ordinal: Int) async {
        editing = false
        guard let track else { return }
        guard await run("Could not update", { try await $0.setPosition(seriesId: track.id, ordinal: ordinal, now: Date()) }) else { return }
        _ = await library.syncAfterMove(seriesId: track.id, registry: registry)
    }

    @discardableResult
    private func run(_ title: String, _ op: (any DetailLibrary) async throws -> Void) async -> Bool {
        do {
            try await op(library)
            return true
        } catch {
            failure = ShelfModel.Failure(title: title, message: ShelfModel.message(error))
            return false
        }
    }

    // MARK: Confirmation copy ([id].tsx, verbatim)

    static func dialogTitle(_ p: Pending, _ t: TrackSummary) -> String {
        switch p {
        case .complete: "Mark \(t.title) complete?"
        case .moveToBacklog: "Move \(t.title) to the backlog?"
        case .delete: "Delete \(t.title)?"
        }
    }

    static func dialogMessage(_ p: Pending, _ t: TrackSummary) -> String {
        switch p {
        case .complete: completionMessage(t)
        case .moveToBacklog: "Its progress will be cleared."
        case .delete:
            t.kind == .series
                ? "This removes the track and every episode, issue or volume under it. It cannot be undone."
                : "This removes the track. It cannot be undone."
        }
    }

    static func confirmLabel(_ p: Pending) -> String {
        switch p {
        case .complete: "Complete"
        case .moveToBacklog: "Move"
        case .delete: "Delete"
        }
    }

    static func isDestructive(_ p: Pending) -> Bool { p != .complete }
}
