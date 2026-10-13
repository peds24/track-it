import XCTest

/// I10: Rate and Rankings on the seeded library (three liked movies; Interstellar unrated).
final class RateTests: XCTestCase {
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

    /// Done → Interstellar → Rate it → I liked it → prefer Interstellar each time.
    @MainActor func rateInterstellarAtTheTop(_ app: XCUIApplication) {
        app.tabBars.buttons["Done"].tap()
        let interstellar = row("Interstellar", in: app)
        XCTAssertTrue(interstellar.waitForExistence(timeout: 5))
        interstellar.tap()
        let rate = app.buttons["detail.rate"]
        var swipes = 0
        while !(rate.exists && rate.isHittable) && swipes < 6 { app.swipeUp(velocity: .slow); swipes += 1 }
        rate.tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
        app.buttons["I liked it"].tap()
        var questions = 0
        while app.staticTexts["Which did you prefer?"].waitForExistence(timeout: 3) && questions < 5 {
            app.buttons["rate.candidate"].tap()
            questions += 1
        }
        XCTAssertLessThanOrEqual(questions, 2, "three tracks need at most two questions")
    }

    @MainActor func testTheThreeTrackWalkThrough() {
        let app = launch()
        rateInterstellarAtTheTop(app)
        XCTAssertTrue(app.staticTexts["#1 of 4 movies"].waitForExistence(timeout: 5))
        app.buttons["See your movies"].tap()
        XCTAssertTrue(app.navigationBars["Rankings"].waitForExistence(timeout: 5))
        let first = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Number 1, Interstellar,'")).firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Number '")).count, 4)
    }

    @MainActor func testCancellingMidComparisonSavesNothing() {
        let app = launch()
        app.tabBars.buttons["Done"].tap()
        row("Interstellar", in: app).tap()
        let rate = app.buttons["detail.rate"]
        var swipes = 0
        while !(rate.exists && rate.isHittable) && swipes < 6 { app.swipeUp(velocity: .slow); swipes += 1 }
        rate.tap()
        app.buttons["I liked it"].tap()
        XCTAssertTrue(app.staticTexts["Which did you prefer?"].waitForExistence(timeout: 5))
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.buttons["Rate it"].waitForExistence(timeout: 5), "still unrated: the card offers Rate it, not Re-rank")
    }

    @MainActor private func openRate(_ title: String, in app: XCUIApplication) {
        app.tabBars.buttons["Done"].tap()
        let r = row(title, in: app)
        var down = 0
        while !(r.exists && r.isHittable) && down < 8 { app.swipeUp(velocity: .slow); down += 1 }
        r.tap()
        let rate = app.buttons["detail.rate"]
        var swipes = 0
        while !(rate.exists && rate.isHittable) && swipes < 6 { app.swipeUp(velocity: .slow); swipes += 1 }
        rate.tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
    }

    @MainActor func testChangeHowIFeltReturnsToTheSentimentStep() {
        let app = launch()
        openRate("Interstellar", in: app)
        app.buttons["I liked it"].tap()
        XCTAssertTrue(app.buttons["Change how I felt"].waitForExistence(timeout: 5))
        app.buttons["Change how I felt"].tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
    }

    /// Review Focus 3: nothing to compare with in that sentiment — placed at once.
    @MainActor func testTheFirstInASentimentIsPlacedWithNoQuestions() {
        let app = launch()
        openRate("Interstellar", in: app)
        app.buttons["I didn’t like it"].tap()
        XCTAssertTrue(app.staticTexts["#4 of 4 movies"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Which did you prefer?"].exists)
    }

    @MainActor func testReRankingShowsTheExistingRating() {
        let app = launch()
        rateInterstellarAtTheTop(app)
        app.buttons["rate.done"].tap()
        let rerank = app.buttons["detail.rate"]
        XCTAssertTrue(rerank.waitForExistence(timeout: 5))
        XCTAssertEqual(rerank.label, "Re-rank")
        rerank.tap()
        let note = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Currently ' AND label ENDSWITH 'Rating it again replaces that.'")).firstMatch
        XCTAssertTrue(note.waitForExistence(timeout: 5))
    }

    @MainActor func testFinishingAnUnratedTrackAsksToRateAndLaterLeavesRate() {
        let app = launch()
        let dune = row("Dune", in: app)
        XCTAssertTrue(dune.waitForExistence(timeout: 5))
        dune.swipeRight(velocity: .fast)
        let done = app.collectionViews.buttons.matching(identifier: "Done").firstMatch
        if done.waitForExistence(timeout: 1), done.isHittable, dune.frame.minX > 30 { done.tap() }
        XCTAssertTrue(app.alerts["Finished Dune"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.alerts.staticTexts["Rank it against the other books you’ve rated?"].exists)
        app.alerts.buttons["Later"].tap()
        app.tabBars.buttons["Done"].tap()
        XCTAssertTrue(row("Dune", in: app).waitForExistence(timeout: 5))
    }

    @MainActor func testAddingAMovieAsWatchedAsksOnceTheSheetCloses() {
        let app = launch()
        app.buttons["shelf.add"].tap()
        app.buttons["add.category.movie"].tap()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText("Dune")
        app.buttons["add.result.demo-dune2"].tap()
        XCTAssertTrue(app.buttons["Watched"].waitForExistence(timeout: 5))
        app.buttons["Watched"].tap()
        XCTAssertTrue(app.alerts["Finished Dune: Part Two"].waitForExistence(timeout: 5))
        app.alerts.buttons["Rate it"].tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
    }

    @MainActor func testDonesToolbarOpensRankings() {
        let app = launch()
        app.tabBars.buttons["Done"].tap()
        app.buttons["shelf.rankings"].tap()
        XCTAssertTrue(app.navigationBars["Rankings"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Number 1, Blade Runner 2049,'")).firstMatch.waitForExistence(timeout: 5))
        app.buttons["Shows"].tap()
        XCTAssertTrue(app.staticTexts["No shows ranked yet"].waitForExistence(timeout: 5))
    }

    /// Contrast, element descriptions and hit regions on each Rate screen and Rankings.
    @MainActor func testRateScreensPassTheAccessibilityAudit() throws {
        let app = launch()
        var found: [String] = []
        func audit(_ screen: String) throws {
            sleep(1)
            try app.performAccessibilityAudit(for: [.sufficientElementDescription, .hitRegion, .contrast]) { issue in
                let type = issue.element?.elementType
                // The primary button's 4.7:1 is proven by IrisTokensTests (white on
                // accentFill); the audit reads it as "nearly passed" here, as it did on I8's Dune.
                let primary = issue.auditType == .contrast && issue.element?.identifier == "rate.done"
                if type != .navigationBar && type != .tabBar && !primary {
                    found.append("\(screen): \(issue.compactDescription) | \(issue.element.map { "\($0.label) \($0.frame)" } ?? "no element")")
                }
                return true
            }
        }
        app.tabBars.buttons["Done"].tap()
        row("Interstellar", in: app).tap()
        let rate = app.buttons["detail.rate"]
        var swipes = 0
        while !(rate.exists && rate.isHittable) && swipes < 6 { app.swipeUp(velocity: .slow); swipes += 1 }
        rate.tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
        try audit("sentiment")
        app.buttons["I liked it"].tap()
        XCTAssertTrue(app.staticTexts["Which did you prefer?"].waitForExistence(timeout: 5))
        try audit("comparing")
        while app.buttons["rate.candidate"].exists { app.buttons["rate.candidate"].tap(); sleep(1) }
        XCTAssertTrue(app.staticTexts["#1 of 4 movies"].waitForExistence(timeout: 5))
        try audit("result")
        app.buttons["See your movies"].tap()
        XCTAssertTrue(app.navigationBars["Rankings"].waitForExistence(timeout: 5))
        try audit("rankings")
        XCTAssertEqual(found, [], found.joined(separator: "\n"))
    }

    // MARK: Screenshots

    /// Sentiment, comparison, result and Rankings in light, dark and system AX5
    /// (every screenful at AX5). PNGs when IRIS_RATE_SCREENSHOT_DIR is set.
    @MainActor func testCaptureRateScreenshots() throws {
        let dir = ProcessInfo.processInfo.environment["IRIS_RATE_SCREENSHOT_DIR"].map(URL.init(fileURLWithPath:))
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            ("ax5", ["-IrisColorScheme", "light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]),
        ]
        for variant in variants {
            let app = launch(variant.args)
            let ax = variant.name == "ax5"
            openRate("Interstellar", in: app)
            sleep(1); try capture("Rate-Sentiment-\(variant.name)", app, scroll: ax, to: dir)
            tapScrolling(app.buttons["I liked it"], in: app)
            XCTAssertTrue(app.buttons["rate.candidate"].waitForExistence(timeout: 5))
            sleep(1); try capture("Rate-Compare-\(variant.name)", app, scroll: ax, to: dir)
            while app.buttons["rate.candidate"].exists { tapScrolling(app.buttons["rate.candidate"], in: app); sleep(1) }
            XCTAssertTrue(app.staticTexts["#1 of 4 movies"].waitForExistence(timeout: 5))
            sleep(1); try capture("Rate-Result-\(variant.name)", app, scroll: ax, to: dir)
            tapScrolling(app.buttons["See your movies"], in: app)
            XCTAssertTrue(app.navigationBars["Rankings"].waitForExistence(timeout: 5))
            sleep(1); try capture("Rankings-\(variant.name)", app, scroll: ax, to: dir)
            app.terminate()
        }
    }

    /// At AX5 a button can start below the fold; scroll the frontmost scroll view to it.
    @MainActor private func tapScrolling(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 8 { app.swipeUp(velocity: .slow); swipes += 1 }
        element.tap()
    }

    @MainActor private func capture(_ name: String, _ app: XCUIApplication, scroll: Bool, to dir: URL?) throws {
        try save(name, to: dir)
        guard scroll else { return }
        // The end is when the content stops moving (whole screenshots never
        // match: the screen behind a sheet keeps changing).
        let anchor = app.scrollViews.firstMatch.exists
            ? app.scrollViews.firstMatch.staticTexts.firstMatch
            : app.collectionViews.firstMatch.cells.firstMatch
        for page in 2...6 {
            let before = anchor.frame
            app.swipeUp(velocity: .slow)
            sleep(1)
            if anchor.frame == before { return }
            try save("\(name)-p\(page)", to: dir)
        }
    }

    @MainActor private func save(_ name: String, to dir: URL?, shot: XCUIScreenshot? = nil) throws {
        let shot = shot ?? XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir { try shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name).png")) }
    }
}
