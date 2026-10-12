import XCTest

/// I9: the Add sheet, on the seeded library and the demo catalogue (no network).
final class AddTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", "demo", "-IrisCatalogue", "demo"] + extra
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Currently"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor func row(_ title: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "\(title),")).firstMatch
    }

    @MainActor func openAdd(_ category: String, in app: XCUIApplication) {
        app.buttons["shelf.add"].tap()
        XCTAssertTrue(app.navigationBars["What are you adding?"].waitForExistence(timeout: 5))
        app.buttons["add.category.\(category)"].tap()
    }

    /// Taps a row once it is fully on screen, below the navigation bar (at AX5
    /// rows start off screen or tucked under the bar, where a tap hits the bar).
    @MainActor func tapRow(_ id: String, in app: XCUIApplication) {
        let element = app.buttons[id], list = app.collectionViews.firstMatch
        let barBottom = app.navigationBars.firstMatch.frame.maxY
        var tries = 0
        while tries < 10 {
            let f = element.frame
            if element.exists && f.minY >= barBottom && f.maxY <= app.windows.firstMatch.frame.maxY { break }
            f.minY < barBottom ? list.swipeDown(velocity: .slow) : list.swipeUp(velocity: .slow)
            tries += 1
        }
        element.tap()
    }

    @MainActor func search(_ text: String, in app: XCUIApplication) {
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap()
        field.typeText(text)
    }

    @MainActor func testAddABookFromTheDemoCatalogue() {
        let app = launch()
        openAdd("book", in: app)
        search("Hail Mary", in: app)
        let result = app.buttons["add.result.demo-hailmary"]
        XCTAssertTrue(result.waitForExistence(timeout: 5))
        result.tap()
        XCTAssertTrue(app.staticTexts["By Andy Weir"].waitForExistence(timeout: 5))
        app.buttons["Start reading"].tap()
        XCTAssertTrue(app.navigationBars["Currently"].waitForExistence(timeout: 5))
        XCTAssertTrue(row("Project Hail Mary", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAddAShowByHand() {
        let app = launch()
        openAdd("show", in: app)
        search("Pluribus", in: app)
        app.buttons["add.save.start"].tap()
        XCTAssertTrue(app.navigationBars["Currently"].waitForExistence(timeout: 5))
        XCTAssertTrue(row("Pluribus", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAMovieMarkedWatchedLandsOnDone() {
        let app = launch()
        openAdd("movie", in: app)
        search("Dune", in: app)
        app.buttons["add.result.demo-dune2"].tap()
        XCTAssertTrue(app.buttons["Watched"].waitForExistence(timeout: 5))
        app.buttons["Watched"].tap()
        XCTAssertTrue(app.navigationBars["Currently"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Done"].tap()
        XCTAssertTrue(row("Dune: Part Two", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAComicIssueByScanAsksForTheIssueCode() {
        let app = launch(["-IrisScan", "0761941333509"])
        openAdd("comic", in: app)
        app.buttons["add.mode.single"].tap()
        app.buttons["add.scan"].tap()
        XCTAssertTrue(app.staticTexts["5-digit issue code?"].waitForExistence(timeout: 5))
        app.buttons["Skip"].tap()
        let hit = app.buttons["add.result.metron-saga"]
        XCTAssertTrue(hit.waitForExistence(timeout: 5))
        hit.tap()
        XCTAssertTrue(app.buttons["Start reading"].waitForExistence(timeout: 5))
        app.buttons["Start reading"].tap()
        XCTAssertTrue(row("Saga", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAMangaScanStartsAtTheScannedVolume() {
        let app = launch(["-IrisScan", "9781612620244"])
        openAdd("manga", in: app)
        app.buttons["add.scan"].tap()
        let hit = app.buttons["add.result.demo-aot"]
        XCTAssertTrue(hit.waitForExistence(timeout: 5))
        hit.tap()
        XCTAssertTrue(app.buttons["Start reading"].waitForExistence(timeout: 5))
        app.buttons["Start reading"].tap()
        let aot = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Attack on Titan,' AND label CONTAINS 'Volume 30'")).firstMatch
        XCTAssertTrue(aot.waitForExistence(timeout: 5))
    }

    @MainActor func testBackFromConfirmKeepsTheSearch() {
        let app = launch()
        openAdd("book", in: app)
        search("Hail", in: app)
        app.buttons["add.result.demo-hailmary"].tap()
        XCTAssertTrue(app.buttons["Start reading"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertEqual(app.searchFields.firstMatch.value as? String, "Hail")
        XCTAssertTrue(app.buttons["add.result.demo-hailmary"].waitForExistence(timeout: 5))
    }

    @MainActor func testDismissingTheSheetSavesNothing() {
        let app = launch()
        openAdd("book", in: app)
        search("The Martian", in: app)
        XCTAssertTrue(app.buttons["add.result.demo-martian"].waitForExistence(timeout: 5))
        app.swipeDown(velocity: .fast)
        app.swipeDown(velocity: .fast)
        XCTAssertTrue(app.navigationBars["Currently"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Backlog"].tap()
        XCTAssertFalse(row("The Martian", in: app).waitForExistence(timeout: 2))
    }

    /// Review C1: a match whose hydrate fails returns to search with the note
    /// and the title in the box (A11), never a stuck "Checking…".
    @MainActor func testAMatchThatFailsToLoadFallsBackToTheSearch() {
        let app = launch()
        openAdd("show", in: app)
        search("Unreachable", in: app)
        let hit = app.buttons["add.result.demo-unreachable"]
        XCTAssertTrue(hit.waitForExistence(timeout: 5))
        hit.tap()
        XCTAssertTrue(app.staticTexts["Couldn’t load that match — it’ll be tracked as you go."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Checking…"].exists)
        XCTAssertEqual(app.searchFields.firstMatch.value as? String, "The Unreachable")
        app.buttons["add.save.backlog"].tap()
        XCTAssertTrue(app.navigationBars["Currently"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Backlog"].tap()
        XCTAssertTrue(row("The Unreachable", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAShowOffersNoScan() {
        let app = launch()
        openAdd("show", in: app)
        XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["add.scan"].exists)
    }

    /// Contrast, element descriptions and hit regions on each Add screen.
    @MainActor func testAddScreensPassTheAccessibilityAudit() throws {
        let app = launch()
        var found: [String] = []
        func audit(_ screen: String) throws {
            sleep(1)
            try app.performAccessibilityAudit(for: [.sufficientElementDescription, .hitRegion, .contrast]) { issue in
                let type = issue.element?.elementType
                // The search field's own clear button is Apple's control.
                let systemClear = issue.element?.label == "Clear text"
                if type != .navigationBar && type != .tabBar && type != .keyboard && !systemClear {
                    found.append("\(screen): \(issue.compactDescription) | \(issue.element.map { "\($0.label) \($0.frame)" } ?? "no element")")
                }
                return true
            }
        }
        app.buttons["shelf.add"].tap()
        XCTAssertTrue(app.navigationBars["What are you adding?"].waitForExistence(timeout: 5))
        try audit("categories")
        app.buttons["add.category.comic"].tap()
        try audit("comic mode")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["add.category.show"].tap()
        search("Expanse", in: app)
        XCTAssertTrue(app.buttons["add.result.demo-expanse"].waitForExistence(timeout: 5))
        app.buttons["Search"].firstMatch.tap() // dismiss the keyboard
        try audit("search")
        app.buttons["add.result.demo-expanse"].tap()
        XCTAssertTrue(app.buttons["Start watching"].waitForExistence(timeout: 5))
        try audit("confirm")
        XCTAssertEqual(found, [], found.joined(separator: "\n"))
    }

    // MARK: Screenshots

    /// Categories, comic mode, search with results, and confirm, in light,
    /// dark and system AX5 (every screenful at AX5). Written as PNGs when
    /// IRIS_ADD_SCREENSHOT_DIR is set; always attached.
    @MainActor func testCaptureAddScreenshots() throws {
        let dir = ProcessInfo.processInfo.environment["IRIS_ADD_SCREENSHOT_DIR"].map(URL.init(fileURLWithPath:))
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            ("ax5", ["-IrisColorScheme", "light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]),
        ]
        for variant in variants {
            let app = launch(variant.args)
            app.buttons["shelf.add"].tap()
            XCTAssertTrue(app.navigationBars["What are you adding?"].waitForExistence(timeout: 5))
            sleep(1); try capture("Add-Categories-\(variant.name)", app, scroll: variant.name == "ax5", to: dir)
            tapRow("add.category.comic", in: app)
            XCTAssertTrue(app.navigationBars["Comic"].waitForExistence(timeout: 5))
            sleep(1); try capture("Add-ComicMode-\(variant.name)", app, scroll: variant.name == "ax5", to: dir)
            app.navigationBars.buttons.element(boundBy: 0).tap()
            tapRow("add.category.show", in: app)
            search("Expanse", in: app)
            XCTAssertTrue(app.buttons["add.result.demo-expanse"].waitForExistence(timeout: 5))
            if app.keyboards.count > 0 { app.buttons["Search"].firstMatch.tap() }
            sleep(1); try capture("Add-Search-\(variant.name)", app, scroll: false, to: dir)
            app.buttons["add.result.demo-expanse"].tap()
            XCTAssertTrue(app.buttons["Start watching"].waitForExistence(timeout: 5))
            sleep(1); try capture("Add-Confirm-\(variant.name)", app, scroll: variant.name == "ax5", to: dir)
            app.terminate()
        }
    }

    @MainActor private func capture(_ name: String, _ app: XCUIApplication, scroll: Bool, to dir: URL?) throws {
        try save(name, to: dir)
        guard scroll else { return }
        let list = app.collectionViews.firstMatch
        for page in 2...6 {
            let before = list.cells.firstMatch.frame
            list.swipeUp(velocity: .slow)
            sleep(1)
            if list.cells.firstMatch.frame == before { return }
            try save("\(name)-p\(page)", to: dir)
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
}
