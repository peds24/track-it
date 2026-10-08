import SwiftUI

@main
struct IrisApp: App {
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            RootView().irisLaunchOverrides(GalleryLaunchOptions.current)
            #else
            RootView()
            #endif
        }
    }
}
