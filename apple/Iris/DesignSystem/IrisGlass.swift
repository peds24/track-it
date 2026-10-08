import SwiftUI

/// Liquid Glass, or the token fallback under Reduce Transparency (§5.9).
enum IrisGlassStyle: Equatable {
    case regular, clear
    enum Resolved: Equatable { case glass(IrisGlassStyle), fallback(IrisGlassStyle) }
    func resolved(reduceTransparency: Bool) -> Resolved { reduceTransparency ? .fallback(self) : .glass(self) }

    var fallback: IrisTokens.GlassFallback { self == .regular ? IrisTokens.Glass.regular : IrisTokens.Glass.clear }
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
        // Opacity, not blur: Reduce Transparency asks for a solid surface.
        // The token's blur value is for platforms that composite their own.
        case let .fallback(s):
            content
                .background(s.fallback.tint, in: shape)
                .overlay(shape.stroke(s.fallback.border, lineWidth: 1))
        }
    }
}

extension View {
    func irisGlass(_ style: IrisGlassStyle = .regular, in shape: some Shape) -> some View {
        modifier(IrisGlassModifier(style: style, shape: shape))
    }
}
