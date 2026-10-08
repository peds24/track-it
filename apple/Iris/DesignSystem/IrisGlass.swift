import SwiftUI
import UIKit

/// Liquid Glass, or the token fallback under Reduce Transparency (§5.9).
enum IrisGlassStyle: Equatable {
    case regular, clear
    enum Resolved: Equatable { case glass(IrisGlassStyle), fallback(IrisGlassStyle) }
    func resolved(reduceTransparency: Bool) -> Resolved { reduceTransparency ? .fallback(self) : .glass(self) }

    var fallback: IrisTokens.GlassFallback { self == .regular ? IrisTokens.Glass.regular : IrisTokens.Glass.clear }

    /// The fallback tint composited over the grouped secondary background,
    /// so it is opaque: Reduce Transparency asks for a solid surface, not a
    /// see-through wash.
    var solidFallback: Color {
        let tint = UIColor(fallback.tint), base = UIColor(IrisTokens.Colors.secondaryGroupedBackground)
        return Color(uiColor: UIColor { traits in
            var (tr, tg, tb, ta): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
            var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
            tint.resolvedColor(with: traits).getRed(&tr, green: &tg, blue: &tb, alpha: &ta)
            base.resolvedColor(with: traits).getRed(&br, green: &bg, blue: &bb, alpha: &ba)
            return UIColor(red: tr * ta + br * (1 - ta), green: tg * ta + bg * (1 - ta), blue: tb * ta + bb * (1 - ta), alpha: 1)
        })
    }
}

enum IrisMotion {
    /// Springs become a short fade under Reduce Motion (§5.9).
    static func animation(_ spring: Animation, reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : spring
    }
}

private struct IrisGlassModifier<S: Shape>: ViewModifier {
    let style: IrisGlassStyle
    let shape: S
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        switch style.resolved(reduceTransparency: reduceTransparency) {
        case .glass(.regular): content.glassEffect(.regular, in: shape)
        case .glass(.clear): content.glassEffect(.clear, in: shape)
        // Solid, not blur: Reduce Transparency asks for an opaque surface.
        // The token's blur value is for platforms that composite their own.
        case let .fallback(s):
            content
                .background(s.solidFallback, in: shape)
                .overlay(shape.stroke(s.fallback.border, lineWidth: 1))
        }
    }
}

extension View {
    func irisGlass(_ style: IrisGlassStyle = .regular, in shape: some Shape) -> some View {
        modifier(IrisGlassModifier(style: style, shape: shape))
    }
}
