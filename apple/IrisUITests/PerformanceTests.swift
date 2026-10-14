import XCTest

/// I12: the app on a 1,000-track library (DEBUG `-IrisSeed perf`, see
/// PerformanceSeed.swift). Simulator timings swing, so only the coarse
/// budget is asserted; the metrics are recorded in the xcresult and DEVLOG.
final class PerformanceTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor private func launchBig() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", "perf"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Currently"].waitForExistence(timeout: 30))
        return app
    }

    /// 530 rows switch in within half a second of the demo library's three —
    /// both timings carry the tab animation and XCUITest's own idle wait, so
    /// only the difference is the library's (I12: 2.04 s vs 1.73 s on an
    /// iPhone 17 simulator). And the list is whole: its last (oldest) row
    /// can be scrolled to.
    @MainActor func testABigBacklogSwitchesInNearlyAsFastAsASmallOneAndScrollsToItsEnd() {
        let small = XCUIApplication()
        small.launchArguments = ["-IrisSeed", "demo"]
        small.launch()
        XCTAssertTrue(small.tabBars.buttons["Currently"].waitForExistence(timeout: 10))
        let baseline = tabSwitchTime("Backlog", firstRow: "Arrival,", in: small)
        small.terminate()

        let app = launchBig()
        XCTAssertTrue(app.collectionViews.cells.firstMatch.waitForExistence(timeout: 10), "Currently has rows")
        let big = tabSwitchTime("Backlog", firstRow: "Manga 93,", in: app)
        print("PERF backlog tab switch: 3 rows \(Int(baseline * 1000)) ms, 530 rows \(Int(big * 1000)) ms")
        XCTAssertLessThan(big - baseline, 0.5, "530 rows cost \(Int((big - baseline) * 1000)) ms more than 3")

        let last = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Show 4,'")).firstMatch
        let list = app.collectionViews.firstMatch
        let scrolled = Date()
        var swipes = 0
        // Drags that hold at the end: no momentum to wait out before XCUITest
        // sees the app idle (a fast swipe cost ~3 s each).
        let top = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12))
        let bottom = list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.88))
        // Looking for the row is the slow part (a whole-tree query each time),
        // so look once every ten drags.
        while !(last.exists && last.isHittable) && swipes < 150 {
            for _ in 0..<10 { bottom.press(forDuration: 0.01, thenDragTo: top, withVelocity: XCUIGestureVelocity(4000), thenHoldForDuration: 0.05) }
            swipes += 10
        }
        print("PERF backlog to the last row: \(swipes) swipes, \(Int(Date().timeIntervalSince(scrolled) * 1000)) ms")
        XCTAssertTrue(last.isHittable, "the oldest backlog track is the last row")
    }

    /// Tap to the first query that sees the row: XCUITest waits for the app
    /// to go idle before every query, so this is "busy until settled", without
    /// waitForExistence's own polling interval.
    @MainActor private func tabSwitchTime(_ tab: String, firstRow: String, in app: XCUIApplication) -> TimeInterval {
        let row = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", firstRow)).firstMatch
        let start = Date()
        app.tabBars.buttons[tab].tap()
        while !row.exists && Date().timeIntervalSince(start) < 10 {}
        return Date().timeIntervalSince(start)
    }

    /// Recorded, not asserted: launch on the real (empty) library.
    @MainActor func testLaunchTime() {
        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTApplicationLaunchMetric()], options: options) { XCUIApplication().launch() }
    }
}
