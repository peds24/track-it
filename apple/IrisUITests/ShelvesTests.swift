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

    /// §5.6–5.7 and contrast: Apple's audit on every shelf at the default
    /// size. Only system chrome is excused. Text size (§5.5) is checked by the
    /// AX5 screenshots of every screenful instead: the audit's Dynamic Type and
    /// clipping checks flagged rows that render whole (I7 review). Issues are collected, not thrown
    /// one by one, so a run reports them all.
    @MainActor func testEveryShelfPassesTheAccessibilityAudit() throws {
        let app = launch()
        var found: [String] = []
        for tab in Self.tabs {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5))
            try app.performAccessibilityAudit(for: [.sufficientElementDescription, .hitRegion, .contrast]) { issue in
                let type = issue.element?.elementType
                if type != .tabBar && type != .navigationBar { found.append(Self.describe(tab, issue)) }
                return true
            }
        }
        XCTAssertEqual(found, [], found.joined(separator: "\n"))
    }

    private static func describe(_ where: String, _ issue: XCUIAccessibilityAuditIssue) -> String {
        "\(`where`): \(issue.compactDescription) | \(issue.element.map { "\($0.label) \($0.frame)" } ?? "no element")"
    }

    /// The rest of an AX5 list, one screenful at a time: <tab>-ax5-p2.png, p3…
    @MainActor private func capturePages(of tab: String, in app: XCUIApplication, to dir: URL?) throws {
        let list = app.collectionViews.firstMatch
        for page in 2...8 {
            let before = list.cells.firstMatch.frame
            list.swipeUp(velocity: .slow)
            sleep(1)
            if list.cells.firstMatch.frame == before { return } // the end
            try save("\(tab)-ax5-p\(page)", to: dir)
        }
    }

    /// Review Focus 4: a confirmation carrying the longest title, at AX5.
    @MainActor private func captureDeleteDialog(in app: XCUIApplication, to dir: URL?) throws {
        app.tabBars.buttons["Backlog"].tap()
        let lotr = row("The Lord of the Rings: The Fellowship of the Ring (Extended Edition)", in: app)
        Self.scrollUntilHittable(lotr, in: app)
        lotr.press(forDuration: 1.2)
        app.buttons["Delete…"].tap()
        XCTAssertTrue(app.staticTexts["Delete The Lord of the Rings: The Fellowship of the Ring (Extended Edition)?"].waitForExistence(timeout: 5))
        sleep(1)
        try save("Backlog-ax5-delete", to: dir)
    }

    @MainActor private static func scrollUntilHittable(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 10 {
            app.collectionViews.firstMatch.swipeUp(velocity: .slow)
            swipes += 1
        }
    }

    @MainActor private func save(_ name: String, to dir: URL?) throws {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir { try shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name).png")) }
    }

    /// Light, dark and AX5 renderings of each tab. Always attached to the
    /// xcresult; written as PNGs when IRIS_SHELF_SCREENSHOT_DIR is set.
    @MainActor func testCaptureShelfScreenshots() throws {
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            // The system text size, as a user who set AX5 in Settings has it.
            ("ax5", ["-IrisColorScheme", "light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]),
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
                // §5.5 evidence: at AX5, every screenful, not just the first rows.
                if variant.name == "ax5" { try capturePages(of: tab, in: app, to: dir) }
            }
            if variant.name == "ax5" { try captureDeleteDialog(in: app, to: dir) }
            app.terminate()
        }
    }
}
