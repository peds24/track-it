import GRDB
@testable import IrisCore

let trackCalls: [String: ScenarioCall] = [
    "addTrack": { q, a in
        let (input, now): (AddTrackInput, String) = (try arg(a, 0), try arg(a, 1))
        return try await toJSON(addTrack(q, input, now: now))
    },
    "createSeriesTrack": { q, a in
        let (draft, now, start): (SeriesDraft, String, Int?) = (try arg(a, 0), try arg(a, 1), try arg(a, 2))
        return try toJSON(write(q) { try createSeriesTrack($0, draft, now: now, startAtOrdinal: start) })
    },
    "createStandaloneTrack": { q, a in
        let (input, now): (StandaloneInput, String) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try createStandaloneTrack($0, input, now: now) })
    },
    "firstEntryOf": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try firstEntryOf($0, t) }) },
    "listTracks": { q, a in
        let (shelf, category): (Shelf, Category?) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try listTracks($0, shelf: shelf, category: category) })
    },
    "getTrackDetail": { q, a in
        let (kind, id): (TrackKind, String) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try getTrackDetail($0, kind: kind, id: id) })
    },
    "advanceEntry": { q, a in
        let (id, now): (String, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try advanceEntry($0, entryId: id, now: now) }
        return .null
    },
    "deleteTrack": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try deleteTrack($0, t) }; return .null },
    "renameTrack": { q, a in
        let (t, title): (TrackRef, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try renameTrack($0, t, title: title) }
        return .null
    },
    "returnTrackToBacklog": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try returnTrackToBacklog($0, t) }; return .null },
    "resumeTrack": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try resumeTrack($0, t) }; return .null },
    "setTrackPosition": { q, a in
        let (id, target, now): (String, Int, String) = (try arg(a, 0), try arg(a, 1), try arg(a, 2))
        try write(q) { try setTrackPosition($0, seriesId: id, targetOrdinal: target, now: now) }
        return .null
    },
    "completeTrack": { q, a in
        let (t, now): (TrackRef, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try completeTrack($0, t, now: now) }
        return .null
    },
]
