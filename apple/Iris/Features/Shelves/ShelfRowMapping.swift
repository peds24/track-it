import IrisCore

/// A track summary as a shelf row (I7), by TrackRow.tsx's rules. The words
/// come from IrisCore's trackLabels port, which fixtures hold to TS.
extension IrisShelfRow.Model {
    init(_ track: TrackSummary, rating: RowRating?) {
        let detail = rowDetailLine(track)

        let progress: IrisProgress.Value? = {
            guard let p = track.progress, p.total > 0, track.shelf != .done else { return nil }
            if hasSeasonProgress(track), let seasons = track.seasons {
                return .seasons(seasonSegments(seasons, doneCount: p.done))
            }
            return .flat(done: p.done, total: p.total)
        }()

        let accessory: IrisShelfRow.Accessory
        if let action = rowAction(track) {
            let symbol: IrisSymbol = action.kind == .resume || track.shelf == .backlog ? .start : .advance
            accessory = .action(title: action.label, symbol: symbol, accessibilityName: action.accessibilityLabel)
        } else if let rating {
            accessory = .rating(score: rating.score, sentiment: rating.sentiment)
        } else if track.shelf == .done {
            accessory = .rate // A26: unrated and finished
        } else {
            accessory = .none
        }

        // Summaries carry no cover on either platform; rows use the category art.
        self.init(title: track.title, category: track.category, detail: detail, progress: progress, coverURL: nil, accessory: accessory)
    }
}
