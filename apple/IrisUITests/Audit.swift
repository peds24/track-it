import XCTest

/// The one accessibility audit every UI suite uses (I12). Issues are
/// collected, not thrown one by one, so a run reports them all; `assertClean`
/// fails once at the end. Every excuse lives here, each with its reason.
@MainActor
final class Audit {
    enum Excuse: Equatable {
        /// Content scrolled under the pinned bottom button (by identifier) or the
        /// tab bar sits on glass, and iOS 26 blurs a band above it and under the
        /// navigation bar (the scroll edge effect): its contrast isn't judged.
        case underBars(pinned: String?)
        /// A primary button's white-on-accentFill 4.7:1 is proven by
        /// IrisTokensTests in both appearances; the audit reads it as "nearly
        /// passed" on some screens with identical pixels (I8, I10).
        case primaryContrast(identifier: String)
        /// A control iOS draws, not the app (the search field's clear button).
        case systemControl(label: String)
        /// A dialog or alert iOS draws: its element-less "potentially
        /// inaccessible" findings point at UIKit's own views, not ours.
        case systemDialog
        /// Visible text that is deliberately not its own element: a cover's
        /// initials (inside the "Cover of …" element) and a number field's
        /// placeholder digit (the field's placeholder). Element-less only.
        case decorativeText
    }

    private var app: XCUIApplication
    private let types: XCUIAccessibilityAuditType
    private(set) var found: [String] = []
    private(set) var visited: [String] = []

    /// Prefixes every finding (the appearance, in AppAuditTests).
    private let tag: String
    /// With TEST_RUNNER_IRIS_AUDIT_DIR set, each finding saves a screenshot there.
    private let shots = ProcessInfo.processInfo.environment["IRIS_AUDIT_DIR"].map(URL.init(fileURLWithPath:))

    init(_ app: XCUIApplication, types: XCUIAccessibilityAuditType = .all, tag: String = "") {
        self.app = app
        self.types = types
        self.tag = tag.isEmpty ? "" : "\(tag) "
    }

    /// Audits the current screen; with `pages`, every screenful of its
    /// frontmost list or scroll view, top to bottom.
    func check(_ screen: String, excusing excuses: [Excuse] = [], pages: Bool = false) throws {
        visited.append(screen)
        sleep(1) // mid-transition colours read as failures
        for page in 0..<(pages ? 10 : 1) {
            let label = tag + (pages ? "\(screen) p\(page + 1)" : screen)
            let bands = Bands(app, excuses)
            try app.performAccessibilityAudit(for: types) { [self] issue in
                if !Self.excused(issue, excuses, bands) {
                    defer {
                        print("AUDIT FINDING \(found.last ?? "")")
                        if let shots {
                            let name = "\(label) \(found.count)".replacingOccurrences(of: " ", with: "-") + ".png"
                            try? app.screenshot().pngRepresentation.write(to: shots.appendingPathComponent(name))
                        }
                    }
                    found.append("\(label): \(issue.compactDescription) | " + (issue.element.map {
                        "\($0.label) \($0.frame) type=\($0.elementType.rawValue) id=\($0.identifier)"
                    } ?? "no element"))
                }
                return true
            }
            guard pages, scrollOnePage() else { break }
        }
    }

    /// After a relaunch: keep the findings, audit the new process.
    func switchTo(_ app: XCUIApplication) { self.app = app }

    func assertClean(file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(found, [], found.joined(separator: "\n"), file: file, line: line)
    }

    /// The bands where `underBars` excuses contrast issues, measured per page.
    private struct Bands {
        var pinnedTop = CGFloat.infinity, barBottom = -CGFloat.infinity
        /// Every navigation bar and tab bar on screen, sheets' included.
        var bars: [CGRect] = []
        init(_ app: XCUIApplication, _ excuses: [Excuse]) {
            bars = (app.navigationBars.allElementsBoundByIndex + app.tabBars.allElementsBoundByIndex).map { $0.frame }
            for case let .underBars(pinned) in excuses {
                let button = pinned.map { app.buttons[$0] }
                let top = (button?.exists == true ? button!.frame.minY : app.tabBars.firstMatch.frame.minY)
                pinnedTop = top - 48
                barBottom = app.navigationBars.firstMatch.frame.maxY + 24
            }
        }
    }

    private static func excused(_ issue: XCUIAccessibilityAuditIssue, _ excuses: [Excuse], _ bands: Bands) -> Bool {
        let element = issue.element
        // System chrome: Apple's bars and keyboard, and whatever sits in a bar
        // (a sheet's toolbar buttons are drawn by iOS, glass and all).
        if let type = element?.elementType, [.tabBar, .navigationBar, .keyboard].contains(type) { return true }
        if let frame = element?.frame, bands.bars.contains(where: { $0.contains(CGPoint(x: frame.midX, y: frame.midY)) }) { return true }
        // Element-less clipping is text cut by the scroll viewport's edge: a
        // truncated label always has an element to blame.
        if issue.auditType == .textClipped, element == nil { return true }
        // WCAG 1.4.3 exempts inactive controls from contrast.
        if issue.auditType == .contrast, element?.isEnabled == false { return true }
        for excuse in excuses {
            switch excuse {
            case let .underBars(pinned):
                // Anything under the bands, except the pinned button itself: its
                // colours are blurred glass, and its text runs under the bar.
                let frame = element?.frame ?? .zero
                if [.contrast, .textClipped].contains(issue.auditType), pinned == nil || element?.identifier != pinned,
                   frame.maxY > bands.pinnedTop || frame.minY < bands.barBottom { return true }
            case let .primaryContrast(id):
                if issue.auditType == .contrast, element?.identifier == id { return true }
            case let .systemControl(label):
                if element?.label == label { return true }
            case .systemDialog, .decorativeText:
                if element == nil, issue.auditType == .elementDetection { return true }
            }
        }
        return false
    }

    /// Scrolls the frontmost list (or scroll view) one page; false at the end.
    private func scrollOnePage() -> Bool {
        let list = app.collectionViews.firstMatch.exists ? app.collectionViews.firstMatch : app.scrollViews.firstMatch
        guard list.exists else { return false }
        let anchor = list.cells.firstMatch.exists ? list.cells.firstMatch : list.staticTexts.firstMatch
        guard anchor.exists else { return false }
        let before = anchor.frame
        list.swipeUp(velocity: .slow)
        sleep(1)
        return anchor.exists && anchor.frame != before
    }
}
