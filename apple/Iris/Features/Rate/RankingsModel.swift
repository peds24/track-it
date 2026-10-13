import Foundation
import IrisCore
import Observation

protocol RankingsLibrary: Sendable {
    func rankings(category: IrisCore.Category) -> AsyncStream<Result<[RankedTrack], Error>>
}

extension Library: RankingsLibrary {}

/// A26: one category's ranking, live. No "All": a movie's 8.4 and a book's
/// 8.4 were never compared.
@MainActor @Observable
final class RankingsModel {
    /// TS order (app/rankings.tsx).
    static let order: [IrisCore.Category] = [.movie, .show, .book, .comic, .manga]

    var category: IrisCore.Category { didSet { if oldValue != category { restart() } } }
    private(set) var ranking: [RankedTrack] = []
    private(set) var loaded = false

    @ObservationIgnored private let library: any RankingsLibrary
    @ObservationIgnored private let tasks = TaskBag()

    init(category: IrisCore.Category, library: any RankingsLibrary) {
        self.category = category
        self.library = library
    }

    func start() {
        guard !tasks.has("ranking") else { return }
        let stream = library.rankings(category: category)
        tasks.set("ranking", Task { [weak self] in
            for await result in stream {
                guard let self else { return }
                // A failed read shows an empty list, as TS does.
                self.ranking = (try? result.get()) ?? []
                self.loaded = true
            }
        })
    }

    private func restart() {
        tasks.cancelAll()
        ranking = []
        loaded = false
        start()
    }
}
