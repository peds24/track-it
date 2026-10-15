@testable import IrisCore

let aboutTextFixtures: [String: FixtureFn] = [
    "aboutCopy": { _ in try toJSON(aboutCopy()) },
    "noMailMessage": { _ in try toJSON(noMailMessage()) },
    "versionLine": { a in try toJSON(versionLine(arg(a, 0), arg(a, 1), arg(a, 2))) },
    "feedbackMailto": { a in try toJSON(feedbackMailto(arg(a, 0), app: arg(a, 1))) },
]
