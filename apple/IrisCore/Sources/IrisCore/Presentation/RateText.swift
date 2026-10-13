/// Port of src/ui/rateText.ts: the words of the Rate and Rankings screens
/// and the rate prompt (A26). Held to TS by shared/fixtures/rateText.json.

public func categoryPlural(_ category: Category) -> String {
    switch category {
    case .show: "shows"
    case .movie: "movies"
    case .book: "books"
    case .comic: "comics"
    case .manga: "manga"
    }
}

public func sentimentLabel(_ sentiment: Sentiment) -> String {
    switch sentiment {
    case .liked: "I liked it"
    case .fine: "It was fine"
    case .disliked: "I didn’t like it"
    }
}

/// "Question 2 · among the movies *you liked*".
private func sentimentGroup(_ sentiment: Sentiment) -> String {
    switch sentiment {
    case .liked: "you liked"
    case .fine: "that were fine"
    case .disliked: "you didn’t like"
    }
}

public func existingRatingNote(_ existing: RatingSummary, category: Category) -> String {
    "Currently \(formatScore(existing.score)) · #\(existing.rank) of \(existing.outOf) \(categoryPlural(category)). Rating it again replaces that."
}

public func rateFootnote(_ category: Category) -> String {
    "You’ll compare it with other \(categoryPlural(category)) you’ve rated — by the same creator or in the same genre where possible — and its 1–10 score comes from where it lands."
}

public func questionFootnote(comparisons: Int, sentiment: Sentiment, category: Category) -> String {
    "Question \(comparisons + 1) · among the \(categoryPlural(category)) \(sentimentGroup(sentiment))"
}

public func undoLabel(answered: Int) -> String { answered == 0 ? "Change how I felt" : "Undo last answer" }

public func rankLine(rank: Int, outOf: Int, category: Category) -> String { "#\(rank) of \(outOf) \(categoryPlural(category))" }

public func scoredLabel(_ score: Double) -> String { "Scored \(formatScore(score)) out of 10" }

public func seeYourLabel(_ category: Category) -> String { "See your \(categoryPlural(category))" }

public func notRatedYet(_ category: Category) -> String {
    "Not rated yet. Rank it against the other \(categoryPlural(category)) you’ve finished."
}

public struct TitledText: Codable, Equatable, Sendable {
    public let title: String
    public let body: String
}

public func rankingsEmpty(_ category: Category) -> TitledText {
    TitledText(title: "No \(categoryPlural(category)) ranked yet",
               body: "Finish something and tap Rate — you’ll compare it with the others you’ve rated, and its score comes from where it lands.")
}

public func rankingRowLabel(rank: Int, title: String, score: Double) -> String { "Number \(rank), \(title), \(formatScore(score)) out of 10" }

public struct PromptText: Codable, Equatable, Sendable {
    public let title: String
    public let message: String
}

public func ratePrompt(title: String, category: Category) -> PromptText {
    PromptText(title: "Finished \(title)", message: "Rank it against the other \(categoryPlural(category)) you’ve rated?")
}
