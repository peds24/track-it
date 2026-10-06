import Foundation
import XCTest
@testable import IrisCore

/// Review Focus 1: the app passes Calendar.current; "late tonight → early
/// tomorrow" is one day on the *device's* calendar, which the UTC-pinned
/// fixtures can't show.
final class CalendarTests: XCTestCase {
    func testDaysBetweenUsesTheGivenCalendarsDay() {
        var denver = Calendar(identifier: .gregorian)
        denver.timeZone = TimeZone(identifier: "America/Denver")!
        // 23:30 and 00:30 Denver time (MDT, UTC−6) on Aug 12 → 13.
        let lateTonight = "2026-08-13T05:30:00.000Z"
        let earlyTomorrow = "2026-08-13T06:30:00.000Z"
        XCTAssertEqual(daysBetween(lateTonight, earlyTomorrow, calendar: denver), 1)
        XCTAssertEqual(daysBetween(lateTonight, earlyTomorrow, calendar: utc), 0)
        XCTAssertEqual(formatDate(lateTonight, calendar: denver), "Aug 12, 2026")
        XCTAssertEqual(formatDate(lateTonight, calendar: utc), "Aug 13, 2026")
    }
}
