/// Port of src/domain/seasons.ts (A11, A12) — display math; entries stay flat (D3).
public struct SeasonSegment: Codable, Equatable, Sendable {
    public let number: Int
    public let episodeCount: Int
    public let done: Int
}

public struct CurrentSeason: Codable, Equatable, Sendable {
    public let number: Int
    public let nextEpisode: Int
    public let episodeCount: Int
}

public struct SeasonPosition: Codable, Equatable, Sendable {
    public let season: Int
    public let episode: Int
}

public func seasonSegments(_ seasons: [SeasonBoundary], doneCount: Int) -> [SeasonSegment] {
    var cursor = 0
    return seasons.map { season in
        let done = max(0, min(season.episodeCount, doneCount - cursor))
        cursor += season.episodeCount
        return SeasonSegment(number: season.number, episodeCount: season.episodeCount, done: done)
    }
}

public func currentSeason(_ seasons: [SeasonBoundary], doneCount: Int) -> CurrentSeason? {
    var cursor = 0
    for season in seasons {
        let doneInSeason = max(0, min(season.episodeCount, doneCount - cursor))
        if doneInSeason < season.episodeCount {
            return CurrentSeason(number: season.number, nextEpisode: doneInSeason + 1, episodeCount: season.episodeCount)
        }
        cursor += season.episodeCount
    }
    return nil
}

public func ordinalFor(_ seasons: [SeasonBoundary], seasonNumber: Int, episodeNumber: Int) -> Int? {
    var cursor = 0
    for season in seasons {
        if season.number == seasonNumber {
            if episodeNumber < 1 || episodeNumber > season.episodeCount { return nil }
            return cursor + episodeNumber
        }
        cursor += season.episodeCount
    }
    return nil
}

public func positionIn(_ seasons: [SeasonBoundary], ordinal: Int) -> SeasonPosition? {
    if ordinal < 1 { return nil }
    var cursor = 0
    for season in seasons {
        if ordinal <= cursor + season.episodeCount {
            return SeasonPosition(season: season.number, episode: ordinal - cursor)
        }
        cursor += season.episodeCount
    }
    return nil
}
