import IrisCore
import SwiftUI

/// How far through a track you are (components.md § IrisProgress).
struct IrisProgress: View {
    enum Value: Equatable {
        case flat(done: Int, total: Int)
        case seasons([SeasonSegment])

        var fraction: Double {
            switch self {
            case let .flat(done, total): Self.clamped(done, total)
            case let .seasons(s): Self.clamped(s.reduce(0) { $0 + $1.done }, s.reduce(0) { $0 + $1.episodeCount })
            }
        }

        /// Each segment's flex weight (episode count, min 1) and fill (0…1).
        /// Empty for an empty season list.
        var segmentFractions: [(weight: Int, fill: Double)] {
            guard case let .seasons(s) = self else { return [(1, fraction)] }
            return s.map { (max($0.episodeCount, 1), Self.clamped($0.done, $0.episodeCount)) }
        }

        var accessibilityValue: String {
            switch self {
            case let .flat(done, total): return "\(done) of \(total)"
            case let .seasons(s):
                let done = s.reduce(0) { $0 + $1.done }, total = s.reduce(0) { $0 + $1.episodeCount }
                guard let current = s.first(where: { $0.done < $0.episodeCount }) ?? s.last else { return "0 of 0" }
                return "Season \(current.number), \(done) of \(total) episodes"
            }
        }

        private static func clamped(_ done: Int, _ total: Int) -> Double {
            total > 0 ? min(1, max(0, Double(done) / Double(total))) : 0
        }
    }

    let value: Value
    init(_ value: Value) { self.value = value }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let segments = value.segmentFractions
        GeometryReader { g in
            let gap = IrisTokens.Space.xxs
            let usable = max(0, g.size.width - gap * CGFloat(max(segments.count - 1, 0)))
            let totalWeight = CGFloat(segments.reduce(0) { $0 + $1.weight })
            if totalWeight == 0 {
                Capsule().fill(IrisTokens.Colors.fill)
            } else {
                HStack(spacing: gap) {
                    ForEach(Array(segments.enumerated()), id: \.offset) { _, seg in
                        let width = usable * CGFloat(seg.weight) / totalWeight
                        ZStack(alignment: .leading) {
                            Capsule().fill(IrisTokens.Colors.fill)
                            Capsule().fill(IrisTokens.Colors.accent).frame(width: width * seg.fill)
                        }
                        .frame(width: width)
                    }
                }
            }
        }
        .frame(height: 4)
        // Task 6 replaces this with IrisMotion.animation(IrisTokens.Motion.smooth, reduceMotion: reduceMotion).
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : IrisTokens.Motion.smooth, value: value)
        .accessibilityElement()
        .accessibilityLabel("Progress")
        .accessibilityValue(value.accessibilityValue)
    }
}
