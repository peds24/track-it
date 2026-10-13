import IrisCore
import SwiftUI

/// How a screen builds the models of the screens it opens (I10): set once at
/// the root, so a detail screen can open Rate and Rankings without threading
/// the library through every view.
struct IrisFactories {
    let detail: @MainActor (TrackRef) -> DetailModel
    let rate: @MainActor (TrackRef) -> RateModel
    let rankings: @MainActor (IrisCore.Category) -> RankingsModel
}

extension EnvironmentValues {
    @Entry var irisFactories: IrisFactories? = nil
}
