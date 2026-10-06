@testable import IrisCore

let formattersFixtures: [String: FixtureFn] = [
    "decodeEntities": { a in try toJSON(decodeEntities(arg(a, 0))) },
    "cleanDescription": { a in try toJSON(cleanDescription(arg(a, 0))) },
    "yearOf": { a in try toJSON(yearOf(arg(a, 0))) },
    "initialsOf": { a in try toJSON(initialsOf(arg(a, 0))) },
    "creatorLine": { a in try toJSON(creatorLine(arg(a, 0), creator: arg(a, 1))) },
    "timelineOf": { a in try toJSON(timelineOf(addedAt: arg(a, 0), units: arg(a, 1))) },
    "daysBetween": { a in try toJSON(daysBetween(arg(a, 0), arg(a, 1), calendar: utc)) },
    "formatDuration": { a in try toJSON(formatDuration(arg(a, 0))) },
    "formatRelative": { a in try toJSON(formatRelative(arg(a, 0), now: arg(a, 1), calendar: utc)) },
    "formatDate": { a in try toJSON(formatDate(arg(a, 0), calendar: utc)) },
    "activityLine": { a in try toJSON(activityLine(arg(a, 0), timeline: arg(a, 1), now: arg(a, 2), calendar: utc)) },
]
