import XCTest

final class LaunchTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// I7: the app opens on the three shelves, Currently first.
    @MainActor
    func testLaunchShowsTheThreeShelves() {
        let app = XCUIApplication()
        app.launch()
        for tab in ["Currently", "Backlog", "Done"] {
            XCTAssertTrue(app.tabBars.buttons[tab].waitForExistence(timeout: 10), tab)
        }
        XCTAssertTrue(app.navigationBars["Currently"].exists)
    }
}
