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

    /// spec §4.1: tokens.json publishes the light/dark values of every
    /// iOS-mapped colour "so other platforms can match". They must be what
    /// this iOS actually renders, or web/Android drift from the iOS reference.
    func testPublishedValuesMatchTheIOSSystemColours() throws {
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: Self.tokensURL)) as! [String: Any]
        let colors = json["color"] as! [String: [String: String]]
        var mismatches: [String] = []
        for (name, token) in colors.sorted(by: { $0.key < $1.key }) {
            guard let ios = token["ios"] else { continue }
            let system = try XCTUnwrap(
                UIColor.perform(NSSelectorFromString(ios + "Color"))?.takeUnretainedValue() as? UIColor,
                "color.\(name).ios: UIColor has no \(ios)"
            )
            for style in [UIUserInterfaceStyle.light, .dark] {
                let key = style == .dark ? "dark" : "light"
                let actual = rgba(system.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)))
                let published = try XCTUnwrap(Self.hexRGBA(token[key] ?? ""), "color.\(name).\(key) is not hex")
                if zip(actual, published).contains(where: { abs($0 - $1) > 1.5 / 255 }) {
                    mismatches.append("color.\(name).\(key): published \(token[key]!) but iOS renders \(Self.hex(actual))")
                }
            }
        }
        XCTAssertEqual(mismatches, [], "Update design/iris/tokens.json, then `npm run tokens`")
    }

    private static let tokensURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("design/iris/tokens.json")

    /// "#RRGGBB" or "#RRGGBBAA" → [r, g, b, a] in 0...1.
    private static func hexRGBA(_ s: String) -> [Double]? {
        guard s.hasPrefix("#"), s.count == 7 || s.count == 9, let n = UInt64(s.dropFirst(), radix: 16) else { return nil }
        let v = s.count == 7 ? (n << 8) | 0xFF : n
        return [24, 16, 8, 0].map { Double((v >> UInt64($0)) & 0xFF) / 255 }
    }

    private static func hex(_ c: [Double]) -> String {
        let b = c.map { Int((min(max($0, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", b[0], b[1], b[2]) + (b[3] == 255 ? "" : String(format: "%02X", b[3]))
    }

    private func rgba(_ c: UIColor) -> [Double] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a].map { (Double($0) * 1000).rounded() / 1000 }
    }

    /// I8: white text on a prominent fill must reach 4.5:1 in both appearances
    /// (the iOS 26 system blue reaches ~3.5:1, which Apple's audit fails).
    func testWhiteOnTheAccentFillPassesContrast() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let fill = rgba(UIColor(IrisTokens.Colors.accentFill).resolvedColor(with: UITraitCollection(userInterfaceStyle: style)))
            let ratio = Self.contrast(white: 1.0, against: fill)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "white on accentFill (\(style == .dark ? "dark" : "light")) is \(ratio):1")
        }
    }

    private static func contrast(white: Double, against c: [Double]) -> Double {
        func lin(_ v: Double) -> Double { v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
        let l = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
        return (white + 0.05) / (l + 0.05)
    }
}
