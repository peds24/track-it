import Foundation

/// The fields of an ISO-8601 string that passes validate.ts's regex AND that
/// V8's Date.parse accepts (probed 2026-10-06): month 1–12; day 1–31 in any
/// month (Feb 31 rolls over, as in JS); hour 0–23, or 24 only as exactly
/// 24:00:00.000; minute and second 0–59; offset hours 0–23, minutes 0–59.
struct ISOParts {
    var year, month, day: Int
    var hour = 0, minute = 0, second = 0, millisecond = 0
    var hasTime = false
    /// Seconds east of UTC; nil when the string carries no offset.
    var offsetSeconds: Int?
}

func isoParts(_ s: String) -> ISOParts? {
    let re = jsRegex(#/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/#)
    guard let m = s.wholeMatch(of: re) else { return nil }
    var p = ISOParts(year: Int(m.1)!, month: Int(m.2)!, day: Int(m.3)!)
    guard (1...12).contains(p.month), (1...31).contains(p.day) else { return nil }
    if let h = m.4, let mi = m.5 {
        p.hasTime = true
        p.hour = Int(h)!
        p.minute = Int(mi)!
        p.second = m.6.map { Int($0)! } ?? 0
        p.millisecond = m.7.map { Int(String($0.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0))! } ?? 0
        guard p.minute <= 59, p.second <= 59 else { return nil }
        guard p.hour <= 23 || (p.hour == 24 && p.minute == 0 && p.second == 0 && p.millisecond == 0) else { return nil }
        if let z = m.8, z != "Z" {
            let digits = z.dropFirst().filter { $0 != ":" }
            let oh = Int(digits.prefix(2))!, om = Int(digits.suffix(2))!
            guard oh <= 23, om <= 59 else { return nil }
            p.offsetSeconds = (z.first == "-" ? -1 : 1) * (oh * 3600 + om * 60)
        } else if m.8 != nil {
            p.offsetSeconds = 0
        }
    }
    return p
}

/// `new Date(iso)`: date-only strings are UTC, date-times without an offset
/// are local (the calendar's zone), and out-of-range fields roll over.
func isoDate(_ s: String, calendar: Calendar) -> Date? {
    guard let p = isoParts(s) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    if let offset = p.offsetSeconds {
        cal.timeZone = TimeZone(secondsFromGMT: offset)!
    } else if !p.hasTime {
        cal.timeZone = TimeZone(identifier: "UTC")!
    } else {
        cal.timeZone = calendar.timeZone
    }
    let comps = DateComponents(
        year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second,
        nanosecond: p.millisecond * 1_000_000
    )
    return cal.date(from: comps)
}
