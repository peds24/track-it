import Foundation

/// Port of src/domain/formatters.ts (A22) — display text, pure. Functions that
/// read the calendar day take `calendar` (default `.current`) instead of a
/// global timezone, so tests can pin UTC and the app gets the device's day.

private let namedEntities: [String: String] = [
    "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
    "mdash": "—", "ndash": "–", "hellip": "…", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”",
    "copy": "©", "reg": "®", "trade": "™", "eacute": "é", "egrave": "è", "aacute": "á", "oacute": "ó",
    "uacute": "ú", "iacute": "í", "ntilde": "ñ", "uuml": "ü", "ouml": "ö", "auml": "ä", "ccedil": "ç",
]

/// Named and numeric entities; anything unknown or out of range is left as written.
/// (A lone surrogate code — JS produces a broken string — is also left as written.)
public func decodeEntities(_ text: String) -> String {
    text.replacing(jsRegex(#/&(#x[0-9a-f]+|#\d+|[a-z]+);/#).ignoresCase()) { match in
        let body = match.1
        if body.hasPrefix("#") {
            let hex = body.dropFirst().first.map { $0 == "x" || $0 == "X" } ?? false
            if let code = UInt32(body.dropFirst(hex ? 2 : 1), radix: hex ? 16 : 10), code > 0, let scalar = Unicode.Scalar(code) {
                return String(Character(scalar))
            }
            return String(match.0)
        }
        return namedEntities[body.lowercased()] ?? String(match.0)
    }
}

/// Catalogue descriptions arrive as HTML fragments.
public func cleanDescription(_ raw: String?) -> String? {
    guard let raw, !raw.isEmpty else { return nil }
    let tags = "a|abbr|b|big|blockquote|br|center|cite|code|dd|del|div|dl|dt|em|font|h[1-6]|hr|i|img|ins|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul"
    func re(_ pattern: String) -> Regex<AnyRegexOutput> {
        // swiftlint:disable:next force_try — the patterns are literals in this file.
        jsRegex(try! Regex(pattern)).ignoresCase()
    }
    let stripped = raw
        .replacing(re(#"<br(?:\s[^<>]*)?\s*/?\s*>"#), with: "\n")
        .replacing(re(#"</(p|div|li|h[1-6])\s*>"#), with: "\n\n")
        .replacing(re(#"</?(?:\#(tags))(?:\s[^<>]*)?/?>"#), with: "")
    let text = jsTrim(
        decodeEntities(stripped)
            .replacing(jsRegex(#/\r\n?/#), with: "\n")
            .replacing(jsRegex(#/[ \t ]+/#), with: " ")
            .replacing(jsRegex(#/ *\n */#), with: "\n")
            .replacing(jsRegex(#/\n{3,}/#), with: "\n\n")
    )
    return text.isEmpty ? nil : text
}

/// "2020-09-15" or "2018" → "2020"/"2018"; anything shorter is not a year.
public func yearOf(_ date: String?) -> String? {
    guard let date, let m = date.prefixMatch(of: jsRegex(#/\d{4}/#)) else { return nil }
    return String(m.0)
}

/// First letters of the first two words. JS takes the first UTF-16 unit, so
/// this takes the first unicode scalar (decomposed "é" → "E"), not the Character.
public func initialsOf(_ title: String) -> String {
    let words = jsTrim(title).split(whereSeparator: { $0.unicodeScalars.allSatisfy(\.properties.isWhitespace) })
    if words.isEmpty { return "?" }
    return words.prefix(2).map { String($0.unicodeScalars.first!).uppercased() }.joined()
}

public func creatorLine(_ category: Category, creator: String?) -> String? {
    guard let creator, !creator.isEmpty else { return nil }
    switch category {
    case .show: return "Created by \(creator)"
    case .movie: return "Directed by \(creator)"
    default: return "By \(creator)"
    }
}

/// The timestamps timelineOf reads from a unit (TS: Pick<Entry, …>).
public struct UnitTimes: Codable, Equatable, Sendable {
    public var status: Status
    public var startedAt: String?
    public var finishedAt: String?

    public init(status: Status, startedAt: String? = nil, finishedAt: String? = nil) {
        self.status = status; self.startedAt = startedAt; self.finishedAt = finishedAt
    }
}

extension Entry {
    public var times: UnitTimes { UnitTimes(status: status, startedAt: startedAt, finishedAt: finishedAt) }
}

public struct Timeline: Codable, Equatable, Sendable {
    public var addedAt: String
    public var startedAt: String?
    public var finishedAt: String?

    public init(addedAt: String, startedAt: String? = nil, finishedAt: String? = nil) {
        self.addedAt = addedAt; self.startedAt = startedAt; self.finishedAt = finishedAt
    }
}

/// Derived from unit timestamps at read time (D3).
public func timelineOf(addedAt: String, units: [UnitTimes]) -> Timeline {
    var startedAt: String?
    var finishedAt: String?
    for u in units {
        if let s = u.startedAt, startedAt.map({ s < $0 }) ?? true { startedAt = s }
        if let f = u.finishedAt, finishedAt.map({ f > $0 }) ?? true { finishedAt = f }
    }
    let allDone = !units.isEmpty && units.allSatisfy { $0.status == .done }
    return Timeline(addedAt: addedAt, startedAt: startedAt, finishedAt: allDone ? finishedAt : nil)
}

/// Whole calendar days between two instants on `calendar`'s days; round()
/// absorbs a 23- or 25-hour DST day. Unparseable input is out of contract
/// (writes are validated) and counts as 0.
public func daysBetween(_ fromIso: String, _ toIso: String, calendar: Calendar = .current) -> Int {
    guard let from = isoDate(fromIso, calendar: calendar), let to = isoDate(toIso, calendar: calendar) else { return 0 }
    let ms = (calendar.startOfDay(for: to).timeIntervalSince1970 - calendar.startOfDay(for: from).timeIntervalSince1970) * 1000
    return max(0, Int(jsRound(ms / 86_400_000)))
}

public func formatDuration(_ days: Int) -> String {
    func plural(_ n: Int, _ unit: String) -> String { "\(n) \(unit)\(n == 1 ? "" : "s")" }
    if days < 1 { return "less than a day" }
    if days < 14 { return plural(days, "day") }
    if days < 60 { return plural(Int(jsRound(Double(days) / 7)), "week") }
    if days < 730 { return plural(Int(jsRound(Double(days) / 30)), "month") }
    return plural(Int(jsRound(Double(days) / 365)), "year")
}

public func formatRelative(_ iso: String, now nowIso: String, calendar: Calendar = .current) -> String {
    let days = daysBetween(iso, nowIso, calendar: calendar)
    if days == 0 { return "today" }
    if days == 1 { return "yesterday" }
    return "\(formatDuration(days)) ago"
}

/// "Aug 12, 2026" on the day in `calendar`'s time zone. Always the Gregorian
/// calendar, as JS's Date getters are — a device set to the Hebrew, Buddhist
/// or Japanese calendar still reads "2026" (I3 review: Hebrew month 13 used
/// to index past the month names). Unparseable input is out of contract → "".
public func formatDate(_ iso: String, calendar: Calendar = .current) -> String {
    guard let date = isoDate(iso, calendar: calendar) else { return "" }
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    var gregorian = Calendar(identifier: .gregorian)
    gregorian.timeZone = calendar.timeZone
    let c = gregorian.dateComponents([.year, .month, .day], from: date)
    return "\(months[c.month! - 1]) \(c.day!), \(c.year!)"
}

public func activityLine(_ category: Category, timeline: Timeline, now nowIso: String, calendar: Calendar = .current) -> String? {
    if let finishedAt = timeline.finishedAt {
        return "Finished in \(formatDuration(daysBetween(timeline.startedAt ?? timeline.addedAt, finishedAt, calendar: calendar)))"
    }
    if let startedAt = timeline.startedAt {
        let verb = [.book, .comic, .manga].contains(category) ? "Reading" : "Watching"
        return "\(verb) for \(formatDuration(daysBetween(startedAt, nowIso, calendar: calendar)))"
    }
    return nil
}
