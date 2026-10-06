@testable import IrisCore

let whatsNewFixtures: [String: FixtureFn] = [
    "announcementFor": { a in
        try toJSON(announcementFor(current: arg(a, 0), lastSeen: arg(a, 1), hasLibrary: arg(a, 2), notes: arg(a, 3)))
    },
]
