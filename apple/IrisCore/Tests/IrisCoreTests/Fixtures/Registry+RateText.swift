@testable import IrisCore

let rateTextFixtures: [String: FixtureFn] = [
    "sentimentLabel": { a in try toJSON(sentimentLabel(arg(a, 0))) },
    "categoryPlural": { a in try toJSON(categoryPlural(arg(a, 0))) },
    "existingRatingNote": { a in try toJSON(existingRatingNote(arg(a, 0), category: arg(a, 1))) },
    "rateFootnote": { a in try toJSON(rateFootnote(arg(a, 0))) },
    "questionFootnote": { a in try toJSON(questionFootnote(comparisons: arg(a, 0), sentiment: arg(a, 1), category: arg(a, 2))) },
    "undoLabel": { a in try toJSON(undoLabel(answered: arg(a, 0))) },
    "rankLine": { a in try toJSON(rankLine(rank: arg(a, 0), outOf: arg(a, 1), category: arg(a, 2))) },
    "scoredLabel": { a in try toJSON(scoredLabel(arg(a, 0))) },
    "seeYourLabel": { a in try toJSON(seeYourLabel(arg(a, 0))) },
    "notRatedYet": { a in try toJSON(notRatedYet(arg(a, 0))) },
    "rankingsEmpty": { a in try toJSON(rankingsEmpty(arg(a, 0))) },
    "rankingRowLabel": { a in try toJSON(rankingRowLabel(rank: arg(a, 0), title: arg(a, 1), score: arg(a, 2))) },
    "ratePrompt": { a in try toJSON(ratePrompt(title: arg(a, 0), category: arg(a, 1))) },
]
