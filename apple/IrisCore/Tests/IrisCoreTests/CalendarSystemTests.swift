import Foundation
import XCTest
@testable import IrisCore

/// I3 review: the device may use a non-Gregorian calendar (a Settings
/// choice). Dates still print on the Gregorian calendar, as JS does —
/// only the time zone comes from the device.
final class CalendarSystemTests: XCTestCase {
    private func calendar(_ id: Calendar.Identifier) -> Calendar {
        var c = Calendar(identifier: id)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }

    func testFormatDateIsGregorianOnBuddhistAndJapaneseDevices() {
        XCTAssertEqual(formatDate("2026-08-12T12:00:00.000Z", calendar: calendar(.buddhist)), "Aug 12, 2026")
        XCTAssertEqual(formatDate("2026-08-12T12:00:00.000Z", calendar: calendar(.japanese)), "Aug 12, 2026")
    }

    /// Hebrew month 13 (Elul) used to index past the month-name table and trap.
    func testFormatDateSurvivesAHebrewDeviceInElul() {
        XCTAssertEqual(formatDate("2026-09-01", calendar: calendar(.hebrew)), "Sep 1, 2026")
    }

    func testDaysBetweenOnAHebrewDevice() {
        XCTAssertEqual(daysBetween("2026-09-01", "2026-09-03", calendar: calendar(.hebrew)), 2)
    }
}
