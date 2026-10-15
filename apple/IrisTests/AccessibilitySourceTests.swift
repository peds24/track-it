import XCTest

/// §5.5 and §5.9 across the app (I12), as source scans — SwiftUI's
/// accessibility environment can't be forced from a test, and the audit's
/// Dynamic Type check simulates rather than relays out:
/// - every animation honours Reduce Motion by going through `IrisMotion`;
/// - every custom glass surface honours Reduce Transparency through `irisGlass`;
/// - every font scales with Dynamic Type (text styles, never fixed sizes).
/// System chrome (tab bar, toolbars, sheets) does all three itself.
final class AccessibilitySourceTests: XCTestCase {
    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("Iris")

    private func sources() throws -> [(name: String, lines: [Substring])] {
        let files = FileManager.default.enumerator(at: Self.appRoot, includingPropertiesForKeys: nil)!
        return try files.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }.map {
            ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: false))
        }
    }

    func testEveryAnimationGoesThroughIrisMotion() throws {
        var offenders: [String] = []
        for (name, lines) in try sources() where name != "IrisTokens.swift" {
            for (i, line) in lines.enumerated() where line.contains("withAnimation(") || line.contains(".animation(") {
                if !line.contains("IrisMotion.animation(") { offenders.append("\(name):\(i + 1): \(line.trimmingCharacters(in: .whitespaces))") }
            }
        }
        XCTAssertEqual(offenders, [], offenders.joined(separator: "\n"))
    }

    func testEveryGlassSurfaceGoesThroughIrisGlass() throws {
        var offenders: [String] = []
        for (name, lines) in try sources() where name != "IrisGlass.swift" {
            for (i, line) in lines.enumerated() where line.contains(".glassEffect(") { offenders.append("\(name):\(i + 1)") }
        }
        XCTAssertEqual(offenders, [], offenders.joined(separator: "\n"))
    }

    func testNoFixedSizeFonts() throws {
        var offenders: [String] = []
        let fixed = [".system(size:", "Font.system(size:", ".custom(", "UIFont.systemFont(ofSize:"]
        for (name, lines) in try sources() {
            for (i, line) in lines.enumerated() where fixed.contains(where: line.contains) {
                // .custom(_:size:relativeTo:) scales; anything else doesn't.
                if !line.contains("relativeTo:") { offenders.append("\(name):\(i + 1): \(line.trimmingCharacters(in: .whitespaces))") }
            }
        }
        XCTAssertEqual(offenders, [], offenders.joined(separator: "\n"))
    }
}
