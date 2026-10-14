import Foundation
import IrisCore
import XCTest
@testable import Iris

/// A ShelfLibrary whose streams the test drives and whose writes it records.
final class FakeLibrary: ShelfLibrary, @unchecked Sendable {
    enum Call: Equatable { case advance(String), resume(String), returnToBacklog(String), complete(String), rename(String, String), delete(String), sync(String) }
    private let lock = NSLock()
    private var _calls: [Call] = []
    private var _observed: [(Shelf, IrisCore.Category?)] = []
    private var trackConts: [AsyncStream<Result<[TrackSummary], Error>>.Continuation] = []
    var failWith: Error?
    var finishedUnratedAnswer = false
    /// Holds every advance until `releaseAdvances()` (I12 double-tap tests).
    var holdAdvances = false
    private var advanceGates: [CheckedContinuation<Void, Never>] = []
    func releaseAdvances() {
        let gates = lock.withLock { () -> [CheckedContinuation<Void, Never>] in
            holdAdvances = false
            defer { advanceGates = [] }
            return advanceGates
        }
        gates.forEach { $0.resume() }
    }
    var heldAdvances: Int { lock.withLock { advanceGates.count } }
    func finishedUnrated(_ ref: TrackRef) async -> Bool { finishedUnratedAnswer }

    var calls: [Call] { lock.withLock { _calls } }
    var observed: [(Shelf, IrisCore.Category?)] { lock.withLock { _observed } }

    func send(_ value: Result<[TrackSummary], Error>) { lock.withLock { trackConts.last }?.yield(value) }

    func tracks(shelf: Shelf, category: IrisCore.Category?) -> AsyncStream<Result<[TrackSummary], Error>> {
        AsyncStream { c in lock.withLock { _observed.append((shelf, category)); trackConts.append(c) } }
    }
    func scores() -> AsyncStream<[String: RowRating]> { AsyncStream { _ in } }

    private func record(_ call: Call) throws {
        lock.withLock { _calls.append(call) }
        if let failWith { throw failWith }
    }
    func advance(entryId: String, now: Date) async throws {
        try record(.advance(entryId))
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let resumeNow = lock.withLock { () -> Bool in
                guard holdAdvances else { return true }
                advanceGates.append(c)
                return false
            }
            if resumeNow { c.resume() }
        }
    }
    func resume(_ track: TrackRef) async throws { try record(.resume(track.id)) }
    func returnToBacklog(_ track: TrackRef) async throws { try record(.returnToBacklog(track.id)) }
    func complete(_ track: TrackRef, now: Date) async throws { try record(.complete(track.id)) }
    func rename(_ track: TrackRef, title: String) async throws { try record(.rename(track.id, title)) }
    func delete(_ track: TrackRef) async throws { try record(.delete(track.id)) }
    func syncAfterAdvance(entryId: String, registry: ProviderRegistry?) async -> Bool {
        lock.withLock { _calls.append(.sync(entryId)) }
        return false
    }
}

@MainActor
final class ShelfModelTests: XCTestCase {
    private func t(_ id: String, _ category: IrisCore.Category = .show, kind: TrackKind = .series, shelf: Shelf = .currently,
                   paused: Bool = false, title: String? = nil) -> TrackSummary {
        TrackSummary(kind: kind, id: id, title: title ?? id, category: category, shelf: shelf, createdAt: "2026-08-12T10:00:00.000Z",
                     progress: IrisCore.Progress(done: 3, total: 10), paused: paused, nextEntryStatus: .unstarted,
                     nextEntryId: "\(id)-next", nextEntryTitle: "Episode 4")
    }

    /// Lets the observation task deliver what the fake just sent.
    private func settle(_ model: ShelfModel, until done: () -> Bool) async {
        for _ in 0..<200 where !done() { await Task.yield() }
    }

    func testCurrentlyGroupsByCategoryInTSOrderAndDropsEmptyGroups() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        model.start()
        fake.send(.success([t("b1", .book), t("s1"), t("s2")]))
        await settle(model) { model.loaded }
        XCTAssertEqual(model.sections.map(\.category), [.show, .book])
        XCTAssertEqual(model.sections.map { $0.tracks.map(\.id) }, [["s1", "s2"], ["b1"]])
    }

    func testAccessoryAdvancesTheNextEntryThenSyncs() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.performAccessory(t("s1"))
        XCTAssertEqual(fake.calls, [.advance("s1-next"), .sync("s1-next")])
        XCTAssertEqual(model.commits, 1)
    }

    func testAccessoryOnAPausedTrackResumes() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .backlog, library: fake, registry: nil)
        await model.performAccessory(t("op", .manga, shelf: .backlog, paused: true))
        XCTAssertEqual(fake.calls, [.resume("op")])
    }

    func testAFailedAdvanceShowsTheTSTitleAndKeepsTheList() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        model.start()
        fake.send(.success([t("s1")]))
        await settle(model) { model.loaded }
        fake.failWith = DomainError("Entry s1-next is already done")
        await model.performAccessory(t("s1"))
        XCTAssertEqual(model.failure?.title, "Could not update")
        XCTAssertEqual(model.failure?.message, "Entry s1-next is already done")
        XCTAssertEqual(model.tracks.map(\.id), ["s1"])
        XCTAssertEqual(model.commits, 0)
        XCTAssertEqual(fake.calls, [.advance("s1-next")], "no sync after a failed advance")
    }

    func testAnObservationFailureShowsCouldNotLoad() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .done, library: fake, registry: nil)
        model.start()
        fake.send(.failure(DomainError("disk I/O error")))
        await settle(model) { model.failure != nil }
        XCTAssertEqual(model.failure?.title, "Could not load your tracks")
        XCTAssertEqual(model.failure?.message, "disk I/O error")
    }

    func testDeleteAsksFirstAndOnlyDeletesOnConfirm() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        let track = t("s1")
        model.requestDelete(track)
        XCTAssertEqual(model.pending, .delete(track))
        XCTAssertEqual(fake.calls, [])
        await model.confirm(.delete(track))
        XCTAssertNil(model.pending)
        XCTAssertEqual(fake.calls, [.delete("s1")])
    }

    func testCompleteConfirmsThenCompletes() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        let track = t("s1")
        model.requestComplete(track)
        await model.confirm(.complete(track))
        XCTAssertEqual(fake.calls, [.complete("s1")])
        XCTAssertEqual(model.commits, 1)
    }

    func testConfirmationCopyIsTSVerbatim() {
        let series = t("s1", title: "Saga"), entry = t("d1", .book, kind: .entry, title: "Dune")
        XCTAssertEqual(ShelfModel.dialogTitle(.delete(series)), "Delete Saga?")
        XCTAssertEqual(ShelfModel.dialogMessage(.delete(series)), "This removes the track and every episode, issue or volume under it. It cannot be undone.")
        XCTAssertEqual(ShelfModel.dialogMessage(.delete(entry)), "This removes the track. It cannot be undone.")
        XCTAssertEqual(ShelfModel.confirmLabel(.delete(entry)), "Delete")
        XCTAssertEqual(ShelfModel.dialogTitle(.complete(entry)), "Mark Dune complete?")
        XCTAssertEqual(ShelfModel.dialogMessage(.complete(entry)), "It moves to Done.")
        XCTAssertEqual(ShelfModel.confirmLabel(.complete(entry)), "Complete")
        XCTAssertEqual(ShelfModel.dialogTitle(.moveToBacklog(entry)), "Move Dune to the backlog?")
        XCTAssertEqual(ShelfModel.dialogMessage(.moveToBacklog(entry)), "Its progress will be cleared — the backlog only holds things you have not started.")
        XCTAssertEqual(ShelfModel.confirmLabel(.moveToBacklog(entry)), "Move")
        XCTAssertTrue(ShelfModel.isDestructive(.delete(entry)))
        XCTAssertTrue(ShelfModel.isDestructive(.moveToBacklog(entry)))
        XCTAssertFalse(ShelfModel.isDestructive(.complete(entry)))
    }

    func testPauseOnCurrentlyDoesNotAsk() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.pause(t("s1"))
        XCTAssertEqual(fake.calls, [.returnToBacklog("s1")])
        XCTAssertNil(model.pending)
    }

    func testRenameFailureShowsItsTitle() async {
        let fake = FakeLibrary()
        fake.failWith = DomainError("Title is required")
        let model = ShelfModel(shelf: .backlog, library: fake, registry: nil)
        await model.rename(t("s1"), to: "New")
        XCTAssertEqual(model.failure?.title, "Could not rename track")
    }

    func testTheFilterRestartsObservationWithTheCategory() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .backlog, library: fake, registry: nil)
        model.start()
        model.category = .book
        XCTAssertEqual(fake.observed.map(\.1), [nil, .book])
        XCTAssertEqual(fake.observed.map(\.0), [.backlog, .backlog])
    }

    /// Review I-1: after a failed observation the shelf must come back to life
    /// the next time it appears (TS reloads on focus), not stay frozen.
    func testAShelfRecoversFromAFailedObservation() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        model.start()
        fake.send(.failure(DomainError("disk I/O error")))
        await settle(model) { model.failure != nil }
        model.start()                               // the view's .task on next appearance
        fake.send(.success([t("s1")]))
        await settle(model) { !model.tracks.isEmpty }
        XCTAssertEqual(model.tracks.map(\.id), ["s1"])
        XCTAssertEqual(fake.observed.count, 2, "start() resubscribes after a failure")
    }

    /// A model released from a synchronous context must not crash (its
    /// `isolated deinit` did: malloc "pointer being freed was not allocated").
    func testReleasingAStartedModelSynchronouslyIsSafe() {
        var model: AnyObject? = { let m = ShelfModel(shelf: .currently, library: FakeLibrary(), registry: nil); m.start(); return m }()
        XCTAssertNotNil(model)
        model = nil
        XCTAssertNil(model)
    }

    // MARK: Rate prompt (I10)

    func testAnAdvanceThatFinishesAnUnratedTrackAsksToRate() async {
        let fake = FakeLibrary(); fake.finishedUnratedAnswer = true
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.performAccessory(t("s1", title: "Severance"))
        XCTAssertEqual(model.ratePrompt?.ref, TrackRef(kind: .series, id: "s1"))
        XCTAssertEqual(model.ratePrompt?.title, "Severance")
    }

    func testAnAdvanceThatDoesNotFinishDoesNotAsk() async {
        let model = ShelfModel(shelf: .currently, library: FakeLibrary(), registry: nil)
        await model.performAccessory(t("s1"))
        XCTAssertNil(model.ratePrompt)
    }

    func testAFailedAdvanceNeverAsks() async {
        let fake = FakeLibrary(); fake.finishedUnratedAnswer = true; fake.failWith = DomainError("nope")
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.performAccessory(t("s1"))
        XCTAssertNil(model.ratePrompt)
    }

    func testCompletingAnUnratedTrackAsksToRate() async {
        let fake = FakeLibrary(); fake.finishedUnratedAnswer = true
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.confirm(.complete(t("s1")))
        XCTAssertNotNil(model.ratePrompt)
    }

    // MARK: I12 hardening

    /// Review Focus 5: a second tap while the first advance is in flight is
    /// the same tap — one write.
    func testADoubleTapWhileAnAdvanceIsInFlightAdvancesOnce() async {
        let fake = FakeLibrary()
        fake.holdAdvances = true
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        let track = t("s1")
        let first = Task { await model.performAccessory(track) }
        await settle(model) { fake.heldAdvances == 1 }
        await model.performAccessory(track)   // ignored: s1 is in flight
        fake.releaseAdvances()
        await first.value
        XCTAssertEqual(fake.calls.filter { if case .advance = $0 { true } else { false } }.count, 1)
    }

    /// …but once it has finished, the next tap is a new advance.
    func testASecondTapAfterTheFirstFinishesAdvancesAgain() async {
        let fake = FakeLibrary()
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        let track = t("s1")
        await model.performAccessory(track)
        await model.performAccessory(track)
        XCTAssertEqual(fake.calls.filter { if case .advance = $0 { true } else { false } }.count, 2)
        XCTAssertEqual(model.commits, 2)
    }

    /// Another track isn't held up by one in flight.
    func testAnotherTrackAdvancesWhileOneIsInFlight() async {
        let fake = FakeLibrary()
        fake.holdAdvances = true
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        let first = Task { await model.performAccessory(self.t("s1")) }
        await settle(model) { fake.heldAdvances == 1 }
        let second = Task { await model.performAccessory(self.t("s2")) }
        await settle(model) { fake.heldAdvances == 2 }
        XCTAssertEqual(fake.heldAdvances, 2)
        fake.releaseAdvances()
        await first.value; await second.value
    }

    /// I7 minor: the haptic follows the write — a failed one plays nothing.
    func testAFailedWriteLeavesTheHapticTriggerAlone() async {
        let fake = FakeLibrary()
        fake.failWith = DomainError("nope")
        let model = ShelfModel(shelf: .currently, library: fake, registry: nil)
        await model.performAccessory(t("s1"))
        await model.confirm(.complete(t("s2")))
        XCTAssertEqual(model.commits, 0)
    }
}
