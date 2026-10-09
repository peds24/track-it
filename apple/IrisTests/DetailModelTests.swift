import Foundation
import IrisCore
import XCTest
@testable import Iris

final class FakeDetailLibrary: DetailLibrary, @unchecked Sendable {
    enum Call: Equatable { case advance(String), resume(String), returnToBacklog(String), complete(String), delete(String), setPosition(String, Int), sync(String) }
    private let lock = NSLock()
    private var _calls: [Call] = []
    private var conts: [AsyncStream<Result<TrackPage?, Error>>.Continuation] = []
    var failWith: Error?
    var calls: [Call] { lock.withLock { _calls } }
    var subscriptions: Int { lock.withLock { conts.count } }

    func send(_ value: Result<TrackPage?, Error>) { lock.withLock { conts.last }?.yield(value) }
    func detail(_ ref: TrackRef) -> AsyncStream<Result<TrackPage?, Error>> { AsyncStream { c in lock.withLock { conts.append(c) } } }
    private func record(_ c: Call) throws {
        lock.withLock { _calls.append(c) }
        if let failWith { throw failWith }
    }
    func advance(entryId: String, now: Date) async throws { try record(.advance(entryId)) }
    func resume(_ track: TrackRef) async throws { try record(.resume(track.id)) }
    func returnToBacklog(_ track: TrackRef) async throws { try record(.returnToBacklog(track.id)) }
    func complete(_ track: TrackRef, now: Date) async throws { try record(.complete(track.id)) }
    func delete(_ track: TrackRef) async throws { try record(.delete(track.id)) }
    func setPosition(seriesId: String, ordinal: Int, now: Date) async throws { try record(.setPosition(seriesId, ordinal)) }
    func syncAfterMove(seriesId: String, registry: ProviderRegistry?) async -> Bool {
        lock.withLock { _calls.append(.sync(seriesId)) }
        return false
    }
}

@MainActor
final class DetailModelTests: XCTestCase {
    private func page(kind: TrackKind = .series, shelf: Shelf = .currently, paused: Bool = false, title: String = "Severance") -> TrackPage {
        let summary = TrackSummary(kind: kind, id: "t1", title: title, category: .show, shelf: shelf, createdAt: "2026-08-12T10:00:00.000Z",
                                   progress: IrisCore.Progress(done: 3, total: 10), paused: paused, nextEntryStatus: .unstarted,
                                   nextEntryId: shelf == .done ? nil : "e4", nextEntryTitle: shelf == .done ? nil : "Episode 4")
        return TrackPage(detail: TrackDetail(summary: summary, metadata: TrackMetadata(), timeline: Timeline(addedAt: "2026-08-12T10:00:00.000Z"),
                                             unitLabel: kind == .series ? .episode : nil), rating: nil)
    }

    private func loaded(_ p: TrackPage, _ fake: FakeDetailLibrary = FakeDetailLibrary()) async -> (DetailModel, FakeDetailLibrary) {
        let model = DetailModel(ref: p.detail.summary.ref, library: fake, registry: nil)
        model.start()
        fake.send(.success(p))
        for _ in 0..<200 where model.state != .loaded(p) { await Task.yield() }
        return (model, fake)
    }

    func testLoadingThenLoadedThenMissing() async {
        let fake = FakeDetailLibrary()
        let model = DetailModel(ref: TrackRef(kind: .series, id: "t1"), library: fake, registry: nil)
        XCTAssertEqual(model.state, .loading)
        model.start()
        fake.send(.success(page()))
        for _ in 0..<200 where model.state == .loading { await Task.yield() }
        XCTAssertEqual(model.state, .loaded(page()))
        fake.send(.success(nil))
        for _ in 0..<200 where model.state != .missing { await Task.yield() }
        XCTAssertEqual(model.state, .missing)
    }

    func testAFailedFirstReadShowsTheMissingStateAndRecovers() async {
        let fake = FakeDetailLibrary()
        let model = DetailModel(ref: TrackRef(kind: .series, id: "t1"), library: fake, registry: nil)
        model.start()
        fake.send(.failure(DomainError("disk I/O error")))
        for _ in 0..<200 where model.state == .loading { await Task.yield() }
        XCTAssertEqual(model.state, .missing)
        model.start()
        fake.send(.success(page()))
        for _ in 0..<200 where model.state != .loaded(page()) { await Task.yield() }
        XCTAssertEqual(model.state, .loaded(page()))
        XCTAssertEqual(fake.subscriptions, 2)
    }

    func testPrimaryAdvancesAndSyncsASeries() async {
        let (model, fake) = await loaded(page())
        await model.primary()
        XCTAssertEqual(fake.calls, [.advance("e4"), .sync("t1")])
        XCTAssertEqual(model.commits, 0, "the primary button's haptic is the kit's own; a second would double it")
    }

    func testPrimaryResumesAPausedTrack() async {
        let (model, fake) = await loaded(page(shelf: .backlog, paused: true))
        await model.primary()
        XCTAssertEqual(fake.calls, [.resume("t1")])
    }

    func testFailureTitlesAreTheDetailScreens() async {
        let failing = FakeDetailLibrary()
        failing.failWith = DomainError("nope")
        var (model, _) = await loaded(page(), failing)
        await model.primary()
        XCTAssertEqual(model.failure?.title, "Could not update")
        XCTAssertEqual(model.commits, 0)
        await model.pauseOrRequestMove()
        XCTAssertEqual(model.failure?.title, "Could not pause")
        await model.confirm(.complete)
        XCTAssertEqual(model.failure?.title, "Could not complete")
        await model.confirm(.delete)
        XCTAssertEqual(model.failure?.title, "Could not delete")
        XCTAssertFalse(model.dismissed, "a failed delete stays on screen")
        (model, _) = await loaded(page(shelf: .backlog, paused: true), failing)
        await model.primary()
        XCTAssertEqual(model.failure?.title, "Could not resume")
        (model, _) = await loaded(page(shelf: .done), failing)
        await model.confirm(.moveToBacklog)
        XCTAssertEqual(model.failure?.title, "Could not move")
    }

    func testPauseOnCurrentlyDoesNotAskButDoneDoes() async {
        var (model, fake) = await loaded(page())
        await model.pauseOrRequestMove()
        XCTAssertEqual(fake.calls, [.returnToBacklog("t1")])
        XCTAssertNil(model.pending)
        (model, fake) = await loaded(page(shelf: .done))
        await model.pauseOrRequestMove()
        XCTAssertEqual(model.pending, .moveToBacklog)
        XCTAssertEqual(fake.calls, [])
    }

    func testDeleteDismissesOnlyOnSuccess() async {
        let (model, fake) = await loaded(page())
        model.pending = .delete
        await model.confirm(.delete)
        XCTAssertEqual(fake.calls, [.delete("t1")])
        XCTAssertTrue(model.dismissed)
        XCTAssertNil(model.pending)
    }

    func testSetPositionThenSyncs() async {
        let (model, fake) = await loaded(page())
        model.editing = true
        await model.setPosition(3)
        XCTAssertFalse(model.editing)
        XCTAssertEqual(fake.calls, [.setPosition("t1", 3), .sync("t1")])
    }

    func testConfirmationCopyIsTheDetailScreensVerbatim() {
        let series = page(title: "Saga").detail.summary, entry = page(kind: .entry, title: "Dune").detail.summary
        XCTAssertEqual(DetailModel.dialogTitle(.complete, entry), "Mark Dune complete?")
        XCTAssertEqual(DetailModel.dialogMessage(.complete, entry), "It moves to Done.")
        XCTAssertEqual(DetailModel.dialogTitle(.moveToBacklog, entry), "Move Dune to the backlog?")
        XCTAssertEqual(DetailModel.dialogMessage(.moveToBacklog, entry), "Its progress will be cleared.")
        XCTAssertEqual(DetailModel.dialogTitle(.delete, series), "Delete Saga?")
        XCTAssertEqual(DetailModel.dialogMessage(.delete, series), "This removes the track and every episode, issue or volume under it. It cannot be undone.")
        XCTAssertEqual(DetailModel.dialogMessage(.delete, entry), "This removes the track. It cannot be undone.")
        XCTAssertEqual(DetailModel.confirmLabel(.complete), "Complete")
        XCTAssertEqual(DetailModel.confirmLabel(.moveToBacklog), "Move")
        XCTAssertEqual(DetailModel.confirmLabel(.delete), "Delete")
        XCTAssertFalse(DetailModel.isDestructive(.complete))
        XCTAssertTrue(DetailModel.isDestructive(.moveToBacklog))
        XCTAssertTrue(DetailModel.isDestructive(.delete))
        XCTAssertEqual(DetailModel.missingMessage, "This track couldn’t be found — it may have been deleted.")
    }

    /// Review: after a delete the observation's nil must not flash the
    /// not-found state while the screen pops.
    func testADeletedTrackDoesNotFlashNotFoundWhilePopping() async {
        let (model, fake) = await loaded(page())
        await model.confirm(.delete)
        XCTAssertTrue(model.dismissed)
        fake.send(.success(nil))
        for _ in 0..<50 { await Task.yield() }
        XCTAssertEqual(model.state, .loaded(page()))
    }

    func testCompleteStillBumpsTheHapticTrigger() async {
        let (model, _) = await loaded(page())
        await model.confirm(.complete)
        XCTAssertEqual(model.commits, 1)
    }
}
