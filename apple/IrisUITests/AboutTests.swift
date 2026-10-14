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

    /// The simulator has no mail account, so iOS rejects the mailto: draft —
    /// the real no-mail-app path, not a mock (Review Focus 3).
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
}
