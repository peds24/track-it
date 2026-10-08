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

    @MainActor
    func testPrimaryButtonsMeetTheHitTarget() {
        let app = XCUIApplication()
        app.launchArguments += ["-IrisGallery", "YES"]
        app.launch()
        app.buttons["gallery.IrisPrimaryButton"].tap()
        XCTAssertTrue(Self.page("IrisPrimaryButton", in: app).waitForExistence(timeout: 5))
        let buttons = app.buttons.matching(identifier: "primary").allElementsBoundByIndex
        XCTAssertEqual(buttons.count, 4)
        for b in buttons {
            XCTAssertGreaterThanOrEqual(b.frame.height, 44, b.label)
            XCTAssertGreaterThanOrEqual(b.frame.width, 44, b.label)
        }
    }

    @MainActor
    func testSheetPresentsAndDismisses() {
        let app = XCUIApplication()
        app.launchArguments += ["-IrisGallery", "YES"]
        app.launch()
        app.buttons["gallery.IrisSheet"].tap()
        app.buttons["sheet.present"].tap()
        XCTAssertTrue(app.staticTexts["sheet.body"].waitForExistence(timeout: 5))
        app.swipeDown(velocity: .fast)
        XCTAssertTrue(app.staticTexts["sheet.body"].waitForNonExistence(timeout: 5))
    }

    /// §5.7 / contract: a tap anywhere in the accessory's 44 pt target runs
    /// the accessory — just above its smaller capsule too — and never opens the row.
    @MainActor
    func testRowAccessoryHitTargetNeverOpensTheRow() {
        let app = XCUIApplication()
        app.launchArguments += ["-IrisGallery", "YES"]
        app.launch()
        app.buttons["gallery.IrisShelfRow"].tap()
        let row = app.descendants(matching: .any).matching(identifier: "row.interactive").firstMatch
        Self.scrollTo(app.staticTexts["row.counts"], in: app)
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        // The accessory sits at the trailing edge, vertically centred; 19 pt
        // above centre is inside a 44 pt target but outside a ~32 pt capsule.
        let f = row.frame
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: f.maxX - 30, dy: f.midY - 19)).tap()
        XCTAssertTrue(app.staticTexts["row.counts"].waitForExistence(timeout: 2))
        XCTAssertEqual(app.staticTexts["row.counts"].label, "accessory 1 · open 0")
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

    /// spec §8 I6: light, dark and AX5 renderings of every component. Always
    /// attaches to the .xcresult; also writes PNGs when the runner has
    /// IRIS_SCREENSHOT_DIR (set it with TEST_RUNNER_IRIS_SCREENSHOT_DIR).
    /// IRIS_SCREENSHOT_ONLY (comma-separated names) narrows the run.
    @MainActor
    func testCaptureGalleryScreenshots() throws {
        let variants: [(name: String, args: [String])] = [
            ("light", ["-IrisColorScheme", "light"]),
            ("dark", ["-IrisColorScheme", "dark"]),
            ("ax5", ["-IrisColorScheme", "light", "-IrisDynamicType", "accessibility5"]),
        ]
        let env = ProcessInfo.processInfo.environment
        let dir = env["IRIS_SCREENSHOT_DIR"].map(URL.init(fileURLWithPath:))
        let only = env["IRIS_SCREENSHOT_ONLY"].flatMap { $0.isEmpty ? nil : Set($0.split(separator: ",").map(String.init)) }
        for variant in variants {
            let app = XCUIApplication()
            app.launchArguments = ["-IrisGallery", "YES"] + variant.args
            app.launch()
            for name in Self.components where only?.contains(name) ?? true {
                let link = app.buttons["gallery.\(name)"]
                Self.scrollTo(link, in: app)
                link.tap()
                XCTAssertTrue(Self.page(name, in: app).waitForExistence(timeout: 5), name)
                if name == "IrisSheet" {
                    app.buttons["sheet.present"].tap()
                    _ = app.staticTexts["sheet.body"].waitForExistence(timeout: 5)
                }
                sleep(1) // let images render and sheets settle
                let shot = XCUIScreen.main.screenshot()
                let attachment = XCTAttachment(screenshot: shot)
                attachment.name = "\(name)-\(variant.name)"
                attachment.lifetime = .keepAlways
                add(attachment)
                if let dir { try shot.pngRepresentation.write(to: dir.appendingPathComponent("\(name)-\(variant.name).png")) }
                if name == "IrisSheet" {
                    app.swipeDown(velocity: .fast)
                    _ = app.staticTexts["sheet.body"].waitForNonExistence(timeout: 5)
                }
                app.navigationBars.buttons.element(boundBy: 0).tap()
            }
            app.terminate()
        }
    }
}
