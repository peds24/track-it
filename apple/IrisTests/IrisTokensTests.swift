import CryptoKit
import SwiftUI
import UIKit
import XCTest
@testable import Iris

final class IrisTokensTests: XCTestCase {
    /// spec §4.1: generated Swift must match tokens.json. The Node generator
    /// can't run here, so compare the embedded hash (plan I1 ruling).
    func testGeneratedSwiftMatchesTokensJSON() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // IrisTests/
            .deletingLastPathComponent() // apple/
            .deletingLastPathComponent() // repo root
        let data = try Data(contentsOf: root.appendingPathComponent("design/iris/tokens.json"))
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(IrisTokens.sourceSHA256, hash, "IrisTokens.swift is stale — run `npm run tokens`")
    }

    /// A dynamic token must really change with the appearance, alpha intact.
    func testDynamicColourResolvesPerAppearance() {
        let tint = UIColor(IrisTokens.Glass.regular.tint)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0

        tint.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 1, accuracy: 0.01)
        XCTAssertEqual(a, 0.702, accuracy: 0.01)

        tint.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)).getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 30.0 / 255, accuracy: 0.01)
        XCTAssertEqual(a, 0.6, accuracy: 0.01)
    }

    /// iOS-mapped neutrals are the system colours themselves (spec §4.1).
    /// Compared by components: UIColor equality also compares colour spaces.
    func testMappedNeutralIsTheSystemColour() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(
                rgba(UIColor(IrisTokens.Colors.label).resolvedColor(with: traits)),
                rgba(UIColor.label.resolvedColor(with: traits)),
                "label differs in \(style == .dark ? "dark" : "light")"
            )
        }
    }

    private func rgba(_ c: UIColor) -> [Double] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a].map { (Double($0) * 1000).rounded() / 1000 }
    }
}
