import XCTest

/// I12: Done's More menu — Send Feedback… and Data Sources (A25, A27).
final class AboutTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    @MainActor private func launchOnDone() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", "demo"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Done"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Done"].tap()
        return app
    }

    @MainActor private func openMore(_ item: String, in app: XCUIApplication) {
        let more = app.buttons["shelf.more"]
        XCTAssertTrue(more.waitForExistence(timeout: 5), "Done's More menu")
        more.tap()
        app.buttons[item].tap()
    }

    /// The simulator has no Mail app, so iOS rejects the mailto: draft — the
    /// real no-handler path, not a mock (Review Focus 3). Mail installed with
    /// no account is FeedbackSheet.outcome's job (AboutSheetsTests).
    @MainActor func testFeedbackNeedsTextThenSaysWhereToWriteWithoutAMailApp() {
        let app = launchOnDone()
        openMore("Send Feedback…", in: app)
        XCTAssertTrue(app.navigationBars["Send feedback"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["feedback.send"].isEnabled, "nothing to send yet")
        let field = app.textFields["feedback.text"].exists ? app.textFields["feedback.text"] : app.textViews["feedback.text"]
        field.tap()
        field.typeText("   ")
        XCTAssertFalse(app.buttons["feedback.send"].isEnabled, "blank is nothing")
        field.typeText("Love the rankings")
        XCTAssertTrue(app.buttons["feedback.send"].isEnabled)
        app.buttons["feedback.send"].tap()
        let alert = app.alerts["No mail app found"]
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts["You can email your feedback to serdiopedro@gmail.com."].exists)
        alert.buttons["OK"].tap()
        XCTAssertTrue(app.navigationBars["Send feedback"].exists, "the draft stays for another try")
    }

    @MainActor func testDataSourcesNamesTMDBAndTheBuild() {
        let app = launchOnDone()
        openMore("Data Sources", in: app)
        XCTAssertTrue(app.navigationBars["Data sources"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["This product uses the TMDB API but is not endorsed or certified by TMDB."].exists)
        XCTAssertTrue(app.staticTexts["Iris v2.0.0 · iOS"].exists)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.navigationBars["Done"].waitForExistence(timeout: 5))
    }

    // MARK: Screenshots

    /// Feedback and Data Sources, and the rename sheet, in light, dark and
    /// system AX5 (every screenful at AX5). PNGs when IRIS_ABOUT_SCREENSHOT_DIR is set.
    @MainActor func testCaptureAboutScreenshots() throws {
        let dir = ProcessInfo.processInfo.environment["IRIS_ABOUT_SCREENSHOT_DIR"].map(URL.init(fileURLWithPath:))
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            ("ax5", ["-IrisColorScheme", "light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]),
        ]
        for variant in variants {
            let app = XCUIApplication()
            app.launchArguments = ["-IrisSeed", "demo"] + variant.args
            app.launch()
            XCTAssertTrue(app.tabBars.buttons["Done"].waitForExistence(timeout: 10))
            app.tabBars.buttons["Done"].tap()
            openMore("Send Feedback…", in: app)
            XCTAssertTrue(app.navigationBars["Send feedback"].waitForExistence(timeout: 5))
            sleep(1); try capture("Feedback-\(variant.name)", app, scroll: variant.name == "ax5", to: dir)
            app.buttons["Cancel"].firstMatch.tap()
            openMore("Data Sources", in: app)
            XCTAssertTrue(app.navigationBars["Data sources"].waitForExistence(timeout: 5))
            sleep(1); try capture("DataSources-\(variant.name)", app, scroll: variant.name == "ax5", to: dir)
            app.buttons["Close"].tap()
            app.tabBars.buttons["Backlog"].tap()
            let row = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Arrival,'")).firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 5))
            row.press(forDuration: 1.2)
            app.buttons["Rename…"].tap()
            XCTAssertTrue(app.navigationBars["Rename Track"].waitForExistence(timeout: 5))
            sleep(1); try capture("Rename-\(variant.name)", app, scroll: false, to: dir)
            app.terminate()
        }
    }

    @MainActor private func capture(_ name: String, _ app: XCUIApplication, scroll: Bool, to dir: URL?) throws {
        try save(name, to: dir)
        guard scroll else { return }
        let list = app.collectionViews.firstMatch
        for page in 2...6 {
            let anchor = list.staticTexts.firstMatch
            guard anchor.exists else { return }
            let before = anchor.frame
            list.swipeUp(velocity: .slow)
            sleep(1)
            if !anchor.exists || anchor.frame == before { return }
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
