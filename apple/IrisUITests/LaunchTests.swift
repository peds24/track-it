import XCTest

final class LaunchTests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    /// I0's "done when": the app launches in the simulator.
    @MainActor
    func testLaunchShowsIrisNavigationBar() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars["Iris"].waitForExistence(timeout: 10))
    }
}
