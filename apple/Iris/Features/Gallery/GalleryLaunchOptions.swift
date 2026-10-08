#if DEBUG
import SwiftUI

/// Launch arguments the screenshot test passes (`-IrisGallery YES
/// -IrisColorScheme dark -IrisDynamicType accessibility5`). They land in
/// UserDefaults' argument domain.
struct GalleryLaunchOptions: Equatable {
    var opensGallery: Bool
    var colorScheme: ColorScheme?
    var dynamicTypeSize: DynamicTypeSize?

    init(opensGallery: Bool, colorScheme: ColorScheme?, dynamicTypeSize: DynamicTypeSize?) {
        self.opensGallery = opensGallery; self.colorScheme = colorScheme; self.dynamicTypeSize = dynamicTypeSize
    }

    init(defaults: [String: Any]) {
        let gallery = defaults["IrisGallery"]
        opensGallery = (gallery as? Bool) ?? ["YES", "1", "true"].contains(gallery as? String ?? "")
        colorScheme = switch defaults["IrisColorScheme"] as? String {
        case "light": .light
        case "dark": .dark
        default: nil
        }
        dynamicTypeSize = Self.sizes[defaults["IrisDynamicType"] as? String ?? ""]
    }

    static var current: Self { Self(defaults: UserDefaults.standard.dictionaryRepresentation()) }

    private static let sizes: [String: DynamicTypeSize] = [
        "large": .large, "xxxLarge": .xxxLarge,
        "accessibility1": .accessibility1, "accessibility2": .accessibility2, "accessibility3": .accessibility3,
        "accessibility4": .accessibility4, "accessibility5": .accessibility5,
    ]
}

extension View {
    /// Applies a Dynamic Type size only when one was passed, so an ordinary
    /// debug run keeps the simulator's own text size.
    @ViewBuilder func irisLaunchOverrides(_ o: GalleryLaunchOptions) -> some View {
        if let size = o.dynamicTypeSize { preferredColorScheme(o.colorScheme).dynamicTypeSize(size) }
        else { preferredColorScheme(o.colorScheme) }
    }
}
#endif
