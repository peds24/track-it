import XCTest

/// I12: the app's screens and states, audited in light, dark and system AX5 —
/// on the `-IrisSeed demo` library and demo catalogue. `Self.screens` is the
/// declared walk; the test fails if it skipped one. Not walked: the states
/// that need a fault to reach (a track or rating that went missing, a library
/// that won't open) — they reuse IrisEmptyState, which every empty shelf audits.
final class AppAuditTests: XCTestCase {
    static let screens = [
        "Currently", "Backlog", "Done",
        "detail Severance", "detail Dune", "detail Saga", "detail Interstellar", "detail Project Hail Mary",
        "detail One Piece", "detail Arrival",
        "position editor", "complete dialog", "delete dialog", "move to backlog dialog", "rename sheet",
        "add categories", "add comic mode", "add search", "add confirm", "scanner unavailable", "ean5 prompt",
        "rate sentiment", "rate compare", "rate result", "rankings", "rankings empty", "rate prompt",
        "feedback", "data sources",
        "empty Currently", "empty Backlog", "empty Done",
    ]

    override func setUp() { continueAfterFailure = false }

    /// `.dynamicType` and `.textClipped` judge simulated sizes, not the real
    /// layout: they flagged rows, labels and toolbar buttons that render whole
    /// at every size (I7, and again in I12 — see DEVLOG). Dynamic Type is held
    /// by the no-fixed-fonts source scan (AccessibilitySourceTests); clipping
    /// by the AX5 screenshots of every screenful (screenshots.sh), read after
    /// every layout change.
    static let atDefaultSize: XCUIAccessibilityAuditType = XCUIAccessibilityAuditType.all.subtracting([.dynamicType, .textClipped])
    /// Contrast is size-independent and audited in light and dark; at AX5 it
    /// only re-measured large text against the bottom scroll-edge blur.
    static let atAX5: XCUIAccessibilityAuditType = XCUIAccessibilityAuditType.all.subtracting([.dynamicType, .textClipped, .contrast])

    @MainActor func testEveryScreenInLight() throws { try walk("light", ["-IrisColorScheme", "light"], types: Self.atDefaultSize) }
    @MainActor func testEveryScreenInDark() throws { try walk("dark", ["-IrisColorScheme", "dark"], types: Self.atDefaultSize) }
    @MainActor func testEveryScreenAtAX5() throws {
        try walk("ax5", ["-IrisColorScheme", "light", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"], types: Self.atAX5)
    }

    // MARK: The walk

    @MainActor private func walk(_ name: String, _ variant: [String], types: XCUIAccessibilityAuditType) throws {
        var app = launch(variant)
        let audit = Audit(app, types: types, tag: name)
        let detailExcuses: [Audit.Excuse] = [.underBars(pinned: "detail.primary"), .primaryContrast(identifier: "detail.primary"), .decorativeText]

        for tab in ["Currently", "Backlog", "Done"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5))
            try audit.check(tab, excusing: [.underBars(pinned: nil)], pages: true)
        }

        for (title, tab) in [("Severance", "Currently"), ("Dune", "Currently"), ("Saga", "Currently"),
                             ("Interstellar", "Done"), ("Project Hail Mary", "Done"),
                             ("One Piece", "Backlog"), ("Arrival", "Backlog")] {
            open(title, tab: tab, in: app)
            try audit.check("detail \(title)", excusing: detailExcuses, pages: true)
            app.navigationBars.buttons.element(boundBy: 0).tap()
        }

        open("Severance", tab: "Currently", in: app)
        action("Edit position", in: app)
        XCTAssertTrue(app.navigationBars["Edit track number"].waitForExistence(timeout: 5))
        try audit.check("position editor", excusing: [.decorativeText])
        app.buttons["Cancel"].firstMatch.tap()
        action("Complete…", in: app)
        try audit.check("complete dialog", excusing: [.systemDialog])
        dismissDialog(in: app)
        action("Delete…", in: app)
        try audit.check("delete dialog", excusing: [.systemDialog])
        dismissDialog(in: app)
        app.navigationBars.buttons.element(boundBy: 0).tap()

        open("Project Hail Mary", tab: "Done", in: app)
        action("Move to Backlog…", in: app)
        try audit.check("move to backlog dialog", excusing: [.systemDialog])
        dismissDialog(in: app)
        app.navigationBars.buttons.element(boundBy: 0).tap()

        app.tabBars.buttons["Backlog"].tap()
        let lotr = row("The Lord of the Rings", in: app)
        scrollTo(lotr, in: app)
        lotr.press(forDuration: 1.2)
        app.buttons["Rename…"].tap()
        XCTAssertTrue(app.navigationBars["Rename Track"].waitForExistence(timeout: 5))
        try audit.check("rename sheet", excusing: [.decorativeText])
        app.buttons["Cancel"].firstMatch.tap()

        // Add, from a fresh launch: its sheet is easier to leave by relaunching.
        app = relaunch(app, variant)
        audit.switchTo(app)
        app.tabBars.buttons["Currently"].tap()
        app.buttons["shelf.add"].tap()
        XCTAssertTrue(app.navigationBars["What are you adding?"].waitForExistence(timeout: 5))
        try audit.check("add categories", pages: true)
        tap(app.buttons["add.category.comic"], in: app)
        XCTAssertTrue(app.navigationBars["Comic"].waitForExistence(timeout: 5))
        try audit.check("add comic mode", excusing: [.systemControl(label: "Clear text")], pages: true)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tap(app.buttons["add.category.show"], in: app)
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText("Expanse")
        XCTAssertTrue(app.buttons["add.result.demo-expanse"].waitForExistence(timeout: 5))
        if app.keyboards.count > 0 { app.buttons["Search"].firstMatch.tap() }
        try audit.check("add search", excusing: [.systemControl(label: "Clear text")])
        app.buttons["add.result.demo-expanse"].tap()
        XCTAssertTrue(app.buttons["Start watching"].waitForExistence(timeout: 5))
        try audit.check("add confirm", pages: true)

        // The scanner, which a simulator can't run: its "not available" cover.
        app = relaunch(app, variant)
        audit.switchTo(app)
        app.buttons["shelf.add"].tap()
        tap(app.buttons["add.category.book"], in: app)
        tap(app.buttons["add.scan"], in: app)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"]
        if allow.waitForExistence(timeout: 3) { allow.tap() }
        XCTAssertTrue(app.navigationBars["Scan barcode"].waitForExistence(timeout: 5))
        try audit.check("scanner unavailable")
        app.buttons["Cancel"].firstMatch.tap()

        // A single-issue comic's scan asks for its 5-digit code (A9).
        app = relaunch(app, variant + ["-IrisScan", "0761941333509"])
        audit.switchTo(app)
        app.buttons["shelf.add"].tap()
        tap(app.buttons["add.category.comic"], in: app)
        tap(app.buttons["add.mode.single"], in: app)
        tap(app.buttons["add.scan"], in: app)
        XCTAssertTrue(app.staticTexts["5-digit issue code?"].waitForExistence(timeout: 5))
        try audit.check("ean5 prompt", excusing: [.systemDialog])
        app.buttons["Skip"].tap()

        // Rate, then Rankings.
        app = relaunch(app, variant)
        audit.switchTo(app)
        open("Interstellar", tab: "Done", in: app)
        let rate = app.buttons["detail.rate"]
        scrollTo(rate, in: app)
        rate.tap()
        XCTAssertTrue(app.staticTexts["How was it?"].waitForExistence(timeout: 5))
        try audit.check("rate sentiment", pages: true)
        tap(app.buttons["I liked it"], in: app)
        XCTAssertTrue(app.buttons["rate.candidate"].waitForExistence(timeout: 5))
        try audit.check("rate compare", pages: true)
        while app.buttons["rate.candidate"].exists { tap(app.buttons["rate.candidate"], in: app); sleep(1) }
        XCTAssertTrue(app.staticTexts["#1 of 4 movies"].waitForExistence(timeout: 5))
        try audit.check("rate result", excusing: [.primaryContrast(identifier: "rate.done")], pages: true)
        tap(app.buttons["See your movies"], in: app)
        XCTAssertTrue(app.navigationBars["Rankings"].waitForExistence(timeout: 5))
        try audit.check("rankings", excusing: [.underBars(pinned: nil)], pages: true)
        tap(app.buttons["Comics"].firstMatch, in: app)   // nothing rated yet; paging left it above
        try audit.check("rankings empty")

        // The finish prompt.
        app = relaunch(app, variant)
        audit.switchTo(app)
        open("Dune", tab: "Currently", in: app)
        app.buttons["detail.primary"].tap()
        XCTAssertTrue(app.alerts["Finished Dune"].waitForExistence(timeout: 5))
        try audit.check("rate prompt", excusing: [.systemDialog])

        // Done's More menu (I12).
        app = relaunch(app, variant)
        audit.switchTo(app)
        app.tabBars.buttons["Done"].tap()
        app.buttons["shelf.more"].tap()
        app.buttons["Send Feedback…"].tap()
        XCTAssertTrue(app.navigationBars["Send feedback"].waitForExistence(timeout: 5))
        try audit.check("feedback", pages: true)
        app.buttons["Cancel"].firstMatch.tap()
        app.buttons["shelf.more"].tap()
        app.buttons["Data Sources"].tap()
        XCTAssertTrue(app.navigationBars["Data sources"].waitForExistence(timeout: 5))
        try audit.check("data sources", pages: true)
        app.buttons["Close"].tap()

        // Empty shelves.
        app = relaunch(app, variant, seed: "empty")
        audit.switchTo(app)
        for tab in ["Currently", "Backlog", "Done"] {
            app.tabBars.buttons[tab].tap()
            XCTAssertTrue(app.navigationBars[tab].waitForExistence(timeout: 5))
            try audit.check("empty \(tab)")
        }

        XCTAssertEqual(audit.visited, Self.screens, "the walk skipped or reordered a screen")
        audit.assertClean()
    }

    // MARK: Helpers

    @MainActor private func launch(_ variant: [String], seed: String = "demo") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-IrisSeed", seed, "-IrisCatalogue", "demo"] + variant
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["Currently"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor private func relaunch(_ app: XCUIApplication, _ variant: [String], seed: String = "demo") -> XCUIApplication {
        app.terminate()
        return launch(variant, seed: seed)
    }

    @MainActor private func row(_ title: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    @MainActor private func open(_ title: String, tab: String, in app: XCUIApplication) {
        app.tabBars.buttons[tab].tap()
        let r = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "\(title),")).firstMatch
        scrollTo(r, in: app)
        XCTAssertTrue(r.waitForExistence(timeout: 5), title)
        r.tap()
        XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 5), "\(title) detail")
    }

    @MainActor private func action(_ name: String, in app: XCUIApplication) {
        app.buttons["detail.actions"].tap()
        let button = app.buttons[name]
        XCTAssertTrue(button.waitForExistence(timeout: 5), name)
        button.tap()
    }

    /// iOS 26 confirmation dialogs have no Cancel button: tap outside them.
    @MainActor private func dismissDialog(in app: XCUIApplication) {
        let cancel = app.buttons["Cancel"].firstMatch
        if cancel.exists && cancel.isHittable { cancel.tap(); return }
        let region = app.otherElements["PopoverDismissRegion"].firstMatch
        if region.exists { region.tap(); return }
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
    }

    /// At AX5 an element can start below the fold — or above it, when an
    /// earlier visit left the list scrolled: look up first, then down.
    @MainActor private func scrollTo(_ element: XCUIElement, in app: XCUIApplication) {
        let list = { app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch }
        var swipes = 0
        while !(element.exists && element.isHittable) && swipes < 6 { list().swipeDown(velocity: .fast); swipes += 1 }
        swipes = 0
        while !(element.exists && element.isHittable) && swipes < 12 { list().swipeUp(velocity: .slow); swipes += 1 }
    }

    /// Taps once the element is fully below the navigation bar: at AX5 a row
    /// can sit tucked under it, where a tap hits the bar (AddTests.tapRow).
    @MainActor private func tap(_ element: XCUIElement, in app: XCUIApplication) {
        scrollTo(element, in: app)
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
        var tries = 0
        while element.exists, element.frame.minY < app.navigationBars.firstMatch.frame.maxY, tries < 4 {
            list.swipeDown(velocity: .slow)
            tries += 1
        }
        element.tap()
    }
}
