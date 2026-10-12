import Foundation
import IrisCore
import XCTest
@testable import Iris

/// A catalogue whose answers the test scripts, and can hold until released.
final class FakeCatalogue: AddCatalogue, @unchecked Sendable {
    private let lock = NSLock()
    private var gates: [String: CheckedContinuation<Void, Never>] = [:]
    private var held: Set<String> = []
    private(set) var searches: [(String, String)] = []
    var answers: [String: [SearchResult]] = [:]
    var hydrateFails = false
    var mangaTitle = "Attack on Titan 30"
    private(set) var upcCalls: [(String, String?)] = []

    func hold(_ token: String) { lock.withLock { _ = held.insert(token) } }
    func release(_ token: String) {
        let gate = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            held.remove(token)
            return gates.removeValue(forKey: token)
        }
        gate?.resume()
    }
    /// Registers and checks under one lock, so a release can't slip between them.
    private func wait(_ token: String) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            let resumeNow = lock.withLock { () -> Bool in
                guard held.contains(token) else { return true }
                gates[token] = c
                return false
            }
            if resumeNow { c.resume() }
        }
    }

    func search(_ query: String, key: AddCatalogueKey) async throws -> [SearchResult] {
        lock.withLock { searches.append((query, key.rawValue)) }
        await wait("search:\(query)")
        return answers[query] ?? []
    }
    func hydrate(_ result: SearchResult, key: AddCatalogueKey) async throws -> SeriesDraft {
        await wait("hydrate:\(result.id)")
        if hydrateFails { throw DomainError("offline") }
        return SeriesDraft(title: result.title, mediaType: .show, unitLabel: .episode, entries: [EntryDraft(ordinal: 1, title: "Episode 1")],
                           metaLine: ["2015"], blurb: "b-\(result.id)")
    }
    func preview(_ result: SearchResult, key: AddCatalogueKey) async -> MatchPreview {
        MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: TrackMetadata(creator: "c-\(result.id)"))
    }
    func mangaISBN(_ isbn: String) async throws -> [SearchResult] {
        [SearchResult(id: "gb", title: mangaTitle, category: .manga, count: 1)]
    }
    var holdUPC = false
    func comicUPC(_ upc: String, ean5: String?) async throws -> [SearchResult] {
        if holdUPC { hold("upc") }        // held before the call is visible to the test
        lock.withLock { upcCalls.append((upc, ean5)) }
        if holdUPC { await wait("upc") }
        return [SearchResult(id: "issue", title: "Saga", category: .comic, count: nil, ongoing: true)]
    }
}

final class FakeAddLibrary: AddLibrary, @unchecked Sendable {
    private(set) var added: [(AddTrackInput, Bool)] = []
    var failWith: Error?
    func add(_ input: AddTrackInput, startNow: Bool, now: Date,
             hydrate: @Sendable (SearchResult) async throws -> SeriesDraft) async throws -> TrackRef {
        if let failWith { throw failWith }
        added.append((input, startNow))
        return TrackRef(kind: .series, id: "new")
    }
}

@MainActor
final class AddModelTests: XCTestCase {
    private func hit(_ id: String, _ title: String, _ category: IrisCore.Category = .show) -> SearchResult {
        SearchResult(id: id, title: title, category: category, count: 10)
    }
    private func settle(_ until: () -> Bool) async { for _ in 0..<500 where !until() { await Task.yield() } }
    private func make(_ cat: FakeCatalogue = FakeCatalogue(), _ lib: FakeAddLibrary = FakeAddLibrary()) -> (AddModel, FakeCatalogue, FakeAddLibrary) {
        (AddModel(catalogue: cat, library: lib, debounce: .zero), cat, lib)
    }

    func testTypingSearchesTheChosenCatalogue() async {
        let (model, cat, _) = make()
        cat.answers["Expanse"] = [hit("e", "The Expanse")]
        model.choose(.show)
        model.query = "Expanse"; model.queryChanged()
        await settle { !model.results.isEmpty }
        XCTAssertEqual(model.results.map(\.id), ["e"])
        XCTAssertEqual(cat.searches.last?.1, "show")
    }

    func testALateAnswerForAnOldQueryIsDropped() async {
        let (model, cat, _) = make()
        cat.answers["a"] = [hit("old", "Old")]
        cat.answers["ab"] = [hit("new", "New")]
        cat.hold("search:a")
        model.choose(.show)
        model.query = "a"; model.queryChanged()
        await settle { cat.searches.count == 1 }
        model.query = "ab"; model.queryChanged()
        await settle { model.results.map(\.id) == ["new"] }
        cat.release("search:a")
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(model.results.map(\.id), ["new"])
    }

    func testSwitchingCategoryDropsResults() async {
        let (model, cat, _) = make()
        cat.answers["Dune"] = [hit("d", "Dune", .book)]
        cat.hold("search:Dune")
        model.choose(.book)
        model.query = "Dune"; model.queryChanged()
        await settle { cat.searches.count == 1 }
        model.leaveSearch()
        model.choose(.movie)
        cat.release("search:Dune")
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(model.results, [])
        XCTAssertEqual(model.query, "")
    }

    func testPickingASecondMatchWhileTheFirstHydratesConfirmsTheSecond() async {
        let (model, cat, _) = make()
        cat.hold("hydrate:a")
        model.choose(.show)
        model.pick(hit("a", "Alpha"))
        model.unpick()
        model.pick(hit("b", "Beta"))
        await settle { model.summary != nil }
        cat.release("hydrate:a")
        for _ in 0..<100 { await Task.yield() }
        XCTAssertEqual(model.summary?.title, "Beta")
        XCTAssertEqual(model.picked?.id, "b")
    }

    func testAFailedHydrateFallsBackToATypedTitle() async {
        let (model, cat, _) = make()
        cat.hydrateFails = true
        model.choose(.show)
        model.query = "exp"
        model.pick(hit("e", "The Expanse"))
        await settle { model.hydrateFailed }
        XCTAssertNil(model.picked)
        XCTAssertEqual(model.query, "The Expanse")
        XCTAssertFalse(model.checking)
    }

    func testAStandaloneMatchPreviews() async {
        let (model, _, _) = make()
        model.choose(.movie)
        model.pick(hit("m", "Arrival", .movie))
        await settle { model.summary != nil }
        XCTAssertEqual(model.summary?.metadata?.creator, "c-m")
        XCTAssertFalse(model.isSeries)
    }

    func testAMangaScanCarriesItsVolumeWithThePick() async {
        let (model, cat, lib) = make()
        cat.answers["Attack on Titan"] = [hit("aot", "Attack on Titan", .manga)]
        model.choose(.manga)
        await model.scanned("9781612620244")
        XCTAssertEqual(cat.searches.last?.0, "Attack on Titan")
        XCTAssertEqual(model.query, "", "A24: the box keeps what was typed")
        model.pick(model.results[0])
        await settle { model.summary != nil }
        XCTAssertEqual(model.pickedOrdinal, 30)
        await model.save(startNow: true)
        XCTAssertEqual(lib.added.first?.0.startAtOrdinal, 30)
        XCTAssertEqual(lib.added.first?.0.title, "Attack on Titan")
    }

    func testAComicIssueScanAsksForTheEAN5() async {
        let (model, cat, _) = make()
        model.choose(.comic); model.chooseComicMode(.single)
        await model.scanned("0761941333509")
        XCTAssertEqual(model.pendingUPC, "761941333509")
        await model.submitEAN5(nil)
        XCTAssertNil(model.pendingUPC)
        XCTAssertEqual(cat.upcCalls.last?.0, "761941333509")
        XCTAssertNil(cat.upcCalls.last?.1)
        model.pendingUPC = "761941333509"
        await model.submitEAN5(" 12345 ")
        XCTAssertEqual(cat.upcCalls.last?.1, "12345")
        model.pendingUPC = "761941333509"
        await model.submitEAN5("123")
        XCTAssertNil(cat.upcCalls.last?.1, "TS sends a code only when it is 5 digits")
        XCTAssertFalse(model.results.isEmpty)
    }

    func testSaveBuildsTheSharedInput() async {
        let (model, _, lib) = make()
        model.choose(.comic); model.chooseComicMode(.single)
        model.query = "Saga #12"
        await model.save(startNow: false)
        XCTAssertEqual(lib.added.first?.0.title, "Saga")
        XCTAssertEqual(lib.added.first?.0.startAtOrdinal, 12)
        XCTAssertEqual(lib.added.first?.1, false)
        XCTAssertEqual(model.saved, TrackRef(kind: .series, id: "new"))
    }

    func testAFailedSaveShowsTheTSAlertAndStays() async {
        let lib = FakeAddLibrary(); lib.failWith = DomainError("A track needs a title")
        let (model, _, _) = make(FakeCatalogue(), lib)
        model.choose(.book)
        await model.save(startNow: true)
        XCTAssertEqual(model.failure?.title, "Could not add track")
        XCTAssertEqual(model.failure?.message, "A track needs a title")
        XCTAssertNil(model.saved)
    }

    func testUnpickKeepsTheQuery() async {
        let (model, _, _) = make()
        model.choose(.movie)
        model.query = "arr"
        model.pick(hit("m", "Arrival", .movie))
        model.unpick()
        XCTAssertEqual(model.query, "arr")
        XCTAssertNil(model.picked)
    }

    func testResultsAreCappedAtTwenty() async {
        let (model, cat, _) = make()
        cat.answers["x"] = (0..<30).map { hit("\($0)", "X \($0)") }
        model.choose(.show)
        model.query = "x"; model.queryChanged()
        await settle { !model.results.isEmpty }
        XCTAssertEqual(model.results.count, 20)
    }

    func testBarcodeKindsFollowTheSharedRule() {
        let (model, _, _) = make()
        model.choose(.show); XCTAssertNil(model.barcodeKinds)
        model.leaveSearch(); model.choose(.book); XCTAssertEqual(model.barcodeKinds, [.ean13, .ean8])
        model.leaveSearch(); model.choose(.comic); XCTAssertNil(model.barcodeKinds)
        model.chooseComicMode(.single); XCTAssertEqual(model.barcodeKinds, [.upcA])
    }

    /// The alert clears pendingUPC as it closes; the captured code still searches.
    func testTheEAN5PromptStillSearchesAfterTheAlertClearedItsCode() async {
        let (model, cat, _) = make()
        model.choose(.comic); model.chooseComicMode(.single)
        await model.scanned("0761941333509")
        let upc = model.pendingUPC
        model.pendingUPC = nil            // what the alert's dismissal does
        await model.submitEAN5(nil, upc: upc)
        XCTAssertEqual(cat.upcCalls.last?.0, "761941333509")
        XCTAssertFalse(model.results.isEmpty)
    }

    /// Review C1: the fallback writes the box from code; the view's onChange then
    /// calls queryChanged(), which must search without erasing the note.
    func testTheHydrateFallbackSurvivesTheViewsQueryChange() async {
        let (model, cat, _) = make()
        cat.hydrateFails = true
        cat.answers["The Expanse"] = [hit("e", "The Expanse")]
        model.choose(.show)
        model.pick(hit("e", "The Expanse"))
        await settle { model.hydrateFailed }
        model.queryChanged()                       // what .onChange(of: query) does
        await settle { !model.results.isEmpty }
        XCTAssertTrue(model.hydrateFailed, "the note must still show")
        XCTAssertEqual(cat.searches.last?.0, "The Expanse", "the fallback title is searched, as TS's effect does")
        model.query = "The Expanse 2"; model.queryChanged()   // a real edit clears it
        XCTAssertFalse(model.hydrateFailed)
    }

    /// Review I2: a scan whose answer arrives after the user moved on is dropped.
    func testALateScanAnswerAfterSwitchingCategoryIsDropped() async {
        let (model, cat, _) = make()
        cat.answers["Attack on Titan"] = [hit("aot", "Attack on Titan", .manga)]
        cat.hold("search:Attack on Titan")
        model.choose(.manga)
        let scan = Task { await model.scanned("9781612620244") }
        await settle { cat.searches.contains { $0.0 == "Attack on Titan" } }
        model.leaveSearch()
        model.choose(.book)
        cat.release("search:Attack on Titan")
        await scan.value
        XCTAssertEqual(model.results, [])
        XCTAssertNil(model.pickedOrdinal)
    }

    /// Review I2: a late EAN-5 answer can't clear a pick made meanwhile.
    func testALateUPCAnswerDoesNotClearANewPick() async {
        let (model, cat, _) = make()
        cat.holdUPC = true
        model.choose(.comic); model.chooseComicMode(.single)
        await model.scanned("0761941333509")
        let upc = model.pendingUPC
        let lookup = Task { await model.submitEAN5(nil, upc: upc) }
        await settle { cat.upcCalls.count == 1 }
        model.query = "Saga"; model.queryChanged()
        model.pick(hit("typed", "Saga", .comic))
        cat.release("upc")
        await lookup.value
        XCTAssertEqual(model.picked?.id, "typed")
    }
}
