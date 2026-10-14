import SwiftUI
import UIKit
import XCTest
@testable import Iris

/// I11: the spectrum-iris icon, launch screen and identity ship in the app.
final class BrandTests: XCTestCase {
    /// A point inside blade 0 (the blue one), in the mark's 1024 × 1024 space.
    private static let bladeZero = CGPoint(x: 677, y: 226)

    func testLaunchMarkShipsLightAndDarkInTheTokenBlues() throws {
        let light = try XCTUnwrap(UIImage(named: "LaunchMark", in: .main, compatibleWith: UITraitCollection(userInterfaceStyle: .light)))
        let dark = try XCTUnwrap(UIImage(named: "LaunchMark", in: .main, compatibleWith: UITraitCollection(userInterfaceStyle: .dark)))
        XCTAssertEqual(light.size.width, 200, accuracy: 0.5, "the launch mark is 200 pt wide")
        assertColour(try probe(light, Self.bladeZero), UIColor(IrisTokens.Colors.accentFill), style: .light)
        assertColour(try probe(dark, Self.bladeZero), UIColor(IrisTokens.Colors.accent), style: .dark)
        // The aperture's centre is open: the launch background shows through.
        XCTAssertEqual(try probe(light, CGPoint(x: 512, y: 512)).alpha, 0, accuracy: 0.01)
    }

    func testLaunchBackgroundIsWhiteInLightAndBlackInDark() throws {
        let colour = try XCTUnwrap(UIColor(named: "LaunchBackground", in: .main, compatibleWith: nil))
        assertColour(colour.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)), .white, style: .light)
        assertColour(colour.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)), .black, style: .dark)
    }

    func testTheAppIconIsTheAssetCatalogueAppIcon() throws {
        let icons = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any])
        let primary = try XCTUnwrap(icons["CFBundlePrimaryIcon"] as? [String: Any])
        XCTAssertEqual(primary["CFBundleIconName"] as? String, "AppIcon")
    }

    // MARK: - Helpers

    private struct RGBA { var red, green, blue, alpha: CGFloat }

    /// The colour of one pixel, `point` given in the 1024-unit mark space.
    private func probe(_ image: UIImage, _ point: CGPoint) throws -> RGBA {
        let cg = try XCTUnwrap(image.cgImage)
        let x = Int(point.x / 1024 * CGFloat(cg.width)), y = Int(point.y / 1024 * CGFloat(cg.height))
        var pixel = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(cg, in: CGRect(x: -x, y: y - cg.height + 1, width: cg.width, height: cg.height))
        let a = CGFloat(pixel[3]) / 255
        guard a > 0 else { return RGBA(red: 0, green: 0, blue: 0, alpha: 0) }
        return RGBA(red: CGFloat(pixel[0]) / 255 / a, green: CGFloat(pixel[1]) / 255 / a, blue: CGFloat(pixel[2]) / 255 / a, alpha: a)
    }

    private func assertColour(_ got: RGBA, _ want: UIColor, style: UIUserInterfaceStyle, line: UInt = #line) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        want.resolvedColor(with: UITraitCollection(userInterfaceStyle: style)).getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(got.alpha, 1, accuracy: 0.02, line: line)
        XCTAssertEqual(got.red, r, accuracy: 0.03, line: line)
        XCTAssertEqual(got.green, g, accuracy: 0.03, line: line)
        XCTAssertEqual(got.blue, b, accuracy: 0.03, line: line)
    }

    private func assertColour(_ got: UIColor, _ want: UIColor, style: UIUserInterfaceStyle, line: UInt = #line) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        got.getRed(&r, green: &g, blue: &b, alpha: &a)
        assertColour(RGBA(red: r, green: g, blue: b, alpha: a), want, style: style, line: line)
    }
}
