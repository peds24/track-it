import Foundation
import IrisCore
import Observation

/// The Add flow (I9): app/add.tsx's state and steps, with its rules from
/// IrisCore's addFlow port. Every search, hydrate or preview runs in its own
/// task, cancelled when a newer one starts, and its answer is applied only
/// if it still matches what is on screen.
@MainActor @Observable
final class AddModel {
    private(set) var category: IrisCore.Category?
    private(set) var comicMode: ComicMode?
    /// The search box.
    var query = ""
    private(set) var results: [SearchResult] = []
    private(set) var picked: SearchResult?
    /// A24: a manga scan's volume, carried with the pick, not written into the box.
    private(set) var pickedOrdinal: Int?
    private(set) var checking = false
    private(set) var hydrateFailed = false
    /// A9: a scanned single-issue UPC waiting for its EAN-5.
    var pendingUPC: String?
    var failure: ShelfModel.Failure?
    /// Set once saved; the sheet closes.
    private(set) var saved: TrackRef?
    /// Saved but not started (I12): the sheet closes once the alert is read.
    @ObservationIgnored private var savedOnceAcknowledged: TrackRef?
    /// I10 (moved from I9): a track added as Watched/Start that is now
    /// finished and unrated; the shelf asks once the sheet has closed.
    private(set) var ratePrompt: RatePromptItem?
    private(set) var saving = false

    @ObservationIgnored private var draft: SeriesDraft?
    @ObservationIgnored private var preview: MatchPreview?
    @ObservationIgnored private var scannedOrdinal: Int?
    /// "search" and "match"; cancelled when the model goes (see TaskBag).
    @ObservationIgnored private let tasks = TaskBag()
    @ObservationIgnored private var searchGeneration = 0
    /// Set when the model itself writes `query` (the hydrate fallback): the
    /// view's onChange then searches but must not treat it as the user's edit,
    /// which would erase the note before it shows (TS's onChangeText rule).
    @ObservationIgnored private var queryWrittenByModel = false
    @ObservationIgnored private let catalogue: any AddCatalogue
    @ObservationIgnored private let library: any AddLibrary
    @ObservationIgnored private let debounce: Duration

    /// What the confirm screen shows; changes as hydrate/preview land.
    private(set) var summary: MatchPreview?

    init(catalogue: any AddCatalogue, library: any AddLibrary, debounce: Duration = .milliseconds(300)) {
        self.catalogue = catalogue
        self.library = library
        self.debounce = debounce
    }


    var key: AddCatalogueKey? { category.map { addCatalogueKey($0, comicMode: comicMode) } }
    var isSeries: Bool { category.map { addIsSeries($0, comicMode: comicMode) } ?? false }
    var barcodeKinds: [BarcodeKind]? { category.flatMap { addBarcodeTypes($0, comicMode: comicMode) } }
    /// A comic needs its mode before it can search.
    var needsComicMode: Bool { category == .comic && comicMode == nil }

    // MARK: Steps

    func choose(_ c: IrisCore.Category) {
        resetSearch()
        category = c
        comicMode = nil
    }

    func chooseComicMode(_ m: ComicMode) {
        resetSearch()
        comicMode = m
    }

    /// Back out of search: TS's beforeRemove — a comic steps back to its mode, anything else to the categories.
    func leaveSearch() {
        resetSearch()
        if category == .comic && comicMode != nil { comicMode = nil } else { category = nil }
    }

    private func resetSearch() {
        tasks.cancel("search")
        searchGeneration += 1
        query = ""
        results = []
        pendingUPC = nil
        scannedOrdinal = nil
        hydrateFailed = false
        unpick()
    }

    /// The box changed: debounced search (300 ms in the app), as TS's effect.
    func queryChanged() {
        let edited = !queryWrittenByModel
        queryWrittenByModel = false
        if jsTrim(query).isEmpty { results = [] }
        if edited {
            unpick()
            scannedOrdinal = nil
            hydrateFailed = false
        }
        tasks.cancel("search")
        searchGeneration += 1
        let generation = searchGeneration
        let text = jsTrim(query)
        guard !text.isEmpty, let key, !needsComicMode else { return }
        let debounce = debounce
        tasks.set("search", Task { [weak self] in
            if debounce > .zero { try? await Task.sleep(for: debounce) }
            guard !Task.isCancelled, let self else { return }
            let hits = (try? await self.catalogue.search(text, key: key)) ?? []
            guard !Task.isCancelled, generation == self.searchGeneration else { return }
            self.results = Array(hits.prefix(20))
        })
    }

    func pick(_ result: SearchResult) {
        tasks.cancel("match")
        picked = result
        pickedOrdinal = scannedOrdinal
        hydrateFailed = false
        draft = nil
        preview = nil
        summary = nil
        checking = true
        guard let key else { return }
        let series = isSeries
        tasks.set("match", Task { [weak self] in
            guard let self else { return }
            if series {
                do {
                    let draft = try await self.catalogue.hydrate(result, key: key)
                    guard !Task.isCancelled, self.picked == result else { return }
                    self.draft = draft
                } catch {
                    guard !Task.isCancelled, self.picked == result else { return }
                    // A11: tracked as you go — the title goes back in the box.
                    let fallback = self.pickedOrdinal.map { "\(result.title) #\($0)" } ?? result.title
                    if fallback != self.query { self.queryWrittenByModel = true }
                    self.query = fallback
                    self.picked = nil
                    self.pickedOrdinal = nil
                    self.hydrateFailed = true
                }
            } else {
                let preview = await self.catalogue.preview(result, key: key)
                guard !Task.isCancelled, self.picked == result else { return }
                self.preview = preview
            }
            self.checking = false
            self.summary = matchSummary(isSeries: series, draft: self.draft, preview: self.preview)
        })
    }

    /// Back from the confirm screen: the search is as it was (A24).
    func unpick() {
        tasks.cancel("match")
        picked = nil
        pickedOrdinal = nil
        draft = nil
        preview = nil
        summary = nil
        checking = false
    }

    /// A9/A11: route a scanned code.
    func scanned(_ payload: String) async {
        guard let category, let key else { return }
        let code = normalizedBarcode(payload, for: barcodeKinds ?? [])
        if category == .comic && comicMode == .single {
            pendingUPC = code
            return
        }
        tasks.cancel("search")
        searchGeneration += 1
        let generation = searchGeneration
        // Applied only if nothing moved on while the lookups were out.
        let current = { [weak self] in self?.searchGeneration == generation }
        do {
            if category == .manga {
                let raw = try await catalogue.mangaISBN(code).first?.title
                guard current() else { return }
                if let raw, !raw.isEmpty {
                    let parsed = stripBareTrailingNumber(raw)
                    let hits = try await catalogue.search(parsed.title, key: key)
                    guard current() else { return }
                    scannedOrdinal = parsed.ordinal
                    results = Array(hits.prefix(20))
                } else {
                    scannedOrdinal = nil
                    results = []
                }
            } else {
                let hits = try await catalogue.search(code, key: key)
                guard current() else { return }
                results = Array(hits.prefix(20))
            }
            unpick()
            hydrateFailed = false
        } catch {
            guard current() else { return }
            scannedOrdinal = nil
            results = []
        }
    }

    /// A9: search the scanned UPC, with the EAN-5 only when it is five digits.
    /// `upc` is the code captured when the prompt's button was tapped: the
    /// alert's dismissal clears `pendingUPC` before this runs.
    func submitEAN5(_ code: String?, upc captured: String? = nil) async {
        guard let upc = captured ?? pendingUPC else { return }
        pendingUPC = nil
        let trimmed = code.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        tasks.cancel("search")
        searchGeneration += 1
        let generation = searchGeneration
        do {
            let hits = try await catalogue.comicUPC(upc, ean5: trimmed?.count == 5 ? trimmed : nil)
            guard generation == searchGeneration else { return }   // the user moved on
            results = Array(hits.prefix(20))
            unpick()
            hydrateFailed = false
        } catch {
            guard generation == searchGeneration else { return }
            results = []
        }
    }

    func save(startNow: Bool) async {
        guard let category, let key, !saving else { return }
        saving = true
        defer { saving = false }
        let input = addTrackInput(
            category: category, comicMode: comicMode,
            saveTitle: addSaveTitle(pickedTitle: picked?.title, pickedOrdinal: pickedOrdinal, typed: query),
            picked: picked, draft: draft, previewMetadata: preview?.metadata
        )
        let catalogue = catalogue
        do {
            let ref = try await library.add(input, startNow: startNow, now: Date()) { try await catalogue.hydrate($0, key: key) }
            if startNow, await library.finishedUnrated(ref) {
                ratePrompt = RatePromptItem(ref: ref, title: input.title, category: category)
            }
            saved = ref
        } catch let notStarted as AddedButNotStarted {
            // Retrying would add it twice: say where it is instead (I12).
            let copy = addedNotStarted(input.title)
            savedOnceAcknowledged = notStarted.ref
            failure = ShelfModel.Failure(title: copy.title, message: copy.message)
        } catch {
            failure = ShelfModel.Failure(title: "Could not add track", message: ShelfModel.message(error))
        }
    }

    /// The failure alert was dismissed.
    func acknowledgeFailure() {
        failure = nil
        if let ref = savedOnceAcknowledged { savedOnceAcknowledged = nil; saved = ref }
    }
}
