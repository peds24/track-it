import XCTest

/// I7: the shelves on the `-IrisSeed demo` library (see DemoLibrary.swift).
final class ShelvesTests: XCTestCase {
    static let tabs = ["Currently", "Backlog", "Done"]

    override func setUp() { continueAfterFailure = false }

    @MainActor private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", "demo"] + extra
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Currently"].waitForExistence(timeout: 10))
        return app
    }

    /// A row is one accessibility element whose label starts with its title.
    @MainActor private func row(_ title: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "\(title),")).firstMatch
    }

    /// Swipes the row and, if the full swipe didn't fire, taps the revealed button.
    @MainActor private func swipe(_ element: XCUIElement, right: Bool, tapping label: String, in app: XCUIApplication) {
        right ? element.swipeRight(velocity: .fast) : element.swipeLeft()
        // The revealed swipe button comes first; each row's own button shares its label.
        let button = app.collectionViews.buttons.matching(identifier: label).firstMatch
        // A leading full swipe may already have fired (the row slides back); only a
        // row still pushed right is showing its button.
        let revealed = !right || element.frame.minX > 30
        if revealed, button.waitForExistence(timeout: 1), button.isHittable { button.tap() }
    }

    @MainActor private func waitFor(_ element: XCUIElement, value: String, timeout: TimeInterval = 5) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.value as? String == value { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.1))
        }
        return false
    }

    @MainActor func testALeadingSwipeAdvancesTheNextEpisode() {
        let app = launch()
        let severance = row("Severance", in: app)
        XCTAssertTrue(severance.waitForExistence(timeout: 5))
        XCTAssertEqual(severance.value as? String, "Season 2, 13 of 19 episodes")
        swipe(severance, right: true, tapping: "Done", in: app)
        XCTAssertTrue(waitFor(severance, value: "Season 2, 14 of 19 episodes"), "value is \(severance.value ?? "nil")")
    }

    @MainActor func testStartingABacklogMovieFinishesIt() {
        let app = launch()
        app.tabBars.buttons["Backlog"].tap()
        let arrival = row("Arrival", in: app)
        XCTAssertTrue(arrival.waitForExistence(timeout: 5))
        swipe(arrival, right: true, tapping: "Watched", in: app)
        XCTAssertTrue(arrival.waitForNonExistence(timeout: 5))
        app.tabBars.buttons["Done"].tap()
        XCTAssertTrue(row("Arrival", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testPauseMovesATrackToBacklog() {
        let app = launch()
        let dune = row("Dune", in: app)
        XCTAssertTrue(dune.waitForExistence(timeout: 5))
        swipe(dune, right: false, tapping: "Pause", in: app)
        XCTAssertTrue(dune.waitForNonExistence(timeout: 5))
        app.tabBars.buttons["Backlog"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Dune, Book, Paused'")).firstMatch.waitForExistence(timeout: 5))
    }

    @MainActor func testDeleteConfirmsWithTheAndroidCopy() {
        let app = launch()
        let saga = row("Saga", in: app)
        XCTAssertTrue(saga.waitForExistence(timeout: 5))
        swipe(saga, right: false, tapping: "Delete", in: app)
        XCTAssertTrue(app.staticTexts["Delete Saga?"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["This removes the track and every episode, issue or volume under it. It cannot be undone."].exists)
        XCTAssertTrue(saga.exists, "nothing is deleted before confirming")
        app.buttons.matching(NSPredicate(format: "label == 'Delete'")).allElementsBoundByIndex.last { $0.isHittable }?.tap()
        XCTAssertTrue(saga.waitForNonExistence(timeout: 5))
    }

    @MainActor func testRenameFromTheContextMenu() {
        let app = launch()
        let dune = row("Dune", in: app)
        XCTAssertTrue(dune.waitForExistence(timeout: 5))
        dune.press(forDuration: 1.2)
        app.buttons["Rename…"].tap()
        let field = app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.typeText(" Messiah")
        app.buttons["Save"].tap()
        XCTAssertTrue(row("Dune Messiah", in: app).waitForExistence(timeout: 5))
    }

    /// §5.6–5.7 and contrast: Apple's audit on every shelf. Only system chrome
    /// is excused. Issues are collected, not thrown one by one, so a run reports
    /// them all. Text size and clipping (§5.5) are checked by the AX5
    /// screenshots instead: the audit's simulated size change flagged whichever
    /// rows sat lowest on screen, differently each run, while the real AX5
    /// rendering wraps them in full.
    @MainActor func testEveryShelfPassesTheAccessibilityAudit() throws {
        let app = launch()
        var found: [String] = []
        for tab in Self.tabs {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5))
            try app.performAccessibilityAudit(for: [.sufficientElementDescription, .hitRegion, .contrast]) { issue in
                let type = issue.element?.elementType
                if type != .tabBar && type != .navigationBar {
                    found.append("\(tab): \(issue.compactDescription) | \(issue.element.map { "\($0.label) \($0.frame)" } ?? "no element")")
                }
                return true
            }
        }
        XCTAssertEqual(found, [], found.joined(separator: "\n"))
    }

    /// Light, dark and AX5 renderings of each tab. Always attached to the
    /// xcresult; written as PNGs when IRIS_SHELF_SCREENSHOT_DIR is set.
    @MainActor func testCaptureShelfScreenshots() throws {
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            ("ax5", ["-IrisColorScheme", "light", "-IrisDynamicType", "accessibility5"]),
        ]
        let dir = ProcessInfo.processInfo.environment["IRIS_SHELF_SCREENSHOT_DIR"].map(URL.init(fileURLWithPath:))
        for variant in variants {
            let app = launch(variant.args)
            for tab in Self.tabs {
                app.tabBars.buttons[tab].tap()
                XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5), tab)
                sleep(1)
                let shot = XCUIScreen.main.screenshot()
                let attachment = XCTAttachment(screenshot: shot)
                attachment.name = "\(tab)-\(variant.name)"
                attachment.lifetime = .keepAlways
                add(attachment)
                if let dir { try shot.pngRepresentation.write(to: dir.appendingPathComponent("\(tab)-\(variant.name).png")) }
            }
            app.terminate()
        }
    }
}
