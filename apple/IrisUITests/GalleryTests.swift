import XCTest

final class GalleryTests: XCTestCase {
    static let components = [
        "IrisShelfRow", "IrisCover", "IrisProgress", "IrisCategoryChip", "IrisPrimaryButton",
        "IrisSheet", "IrisEmptyState", "IrisRatingBadge", "IrisComparisonCard", "IrisSymbol",
    ]

    override func setUp() { continueAfterFailure = false }

    @MainActor
    func testGalleryOpensFromRootAndReachesEveryPage() {
        let app = XCUIApplication()
        app.launch()
        app.buttons["gallery.open"].tap()
        for name in Self.components {
            let link = app.buttons["gallery.\(name)"]
            Self.scrollTo(link, in: app)
            link.tap()
            XCTAssertTrue(Self.page(name, in: app).waitForExistence(timeout: 5), name)
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }
    }

    /// A Gallery page's root, whatever element type SwiftUI gives it (a scroll view, usually).
    @MainActor
    static func page(_ name: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "page.\(name)").firstMatch
    }

    /// Lists don't scroll a cell into view on lookup; swipe until it's hittable.
    @MainActor
    static func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 12 {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
    }
}
