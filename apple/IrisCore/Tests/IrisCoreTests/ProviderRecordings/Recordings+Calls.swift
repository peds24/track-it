import Foundation
@testable import IrisCore

private func require<P>(_ p: (any MetadataProvider)?, _ type: P.Type) throws -> P {
    guard let typed = p as? P else { throw FixtureError("provider lacks \(type)") }
    return typed
}

/// What shared/providers/registry.ts records for a resolved provider.
private func describe(_ p: (any MetadataProvider)?) -> JSON {
    guard let p else { return .null }
    return .object(["id": .string(p.id), "category": p.category.map { .string($0.rawValue) } ?? .null])
}

private let noNetwork = ProviderRegistry(keys: ProviderKeys(), http: FakeHTTP([]))

/// Every call a provider recording may make; provider methods dispatch on capability.
let providerCalls: [String: RecordingCall] = [
    "search": { p, a in try toJSON(await require(p, (any MetadataProvider).self).search(arg(a, 0))) },
    "hydrate": { p, a in try toJSON(await require(p, (any MetadataProvider).self).hydrate(arg(a, 0))) },
    "preview": { p, a in try toJSON(await require(p, (any PreviewingProvider).self).preview(arg(a, 0))) },
    "details": { p, a in try toJSON(await require(p, (any DetailsProvider).self).details(arg(a, 0))) },
    "unitAt": { p, a in try toJSON(await require(p, (any UnitProvider).self).unitAt(arg(a, 0), ordinal: arg(a, 1))) },
    "searchByUpc": { p, a in try toJSON(await require(p, MetronProvider.self).searchByUpc(arg(a, 0), ean5: arg(a, 1))) },
    "sumEpisodeCount": { _, a in try toJSON(sumEpisodeCount(arg(a, 0))) },
    "seasonBreakdown": { _, a in try toJSON(seasonBreakdown(arg(a, 0))) },
    "httpsUrl": { _, a in try toJSON(httpsUrl(arg(a, 0))) },
    "tmdbImage": { _, a in try toJSON(tmdbImage(arg(a, 0), size: arg(a, 1))) },
    "googleBooksImage": { _, a in try toJSON(googleBooksImage(arg(a, 0), width: arg(a, 1))) },
    "sharpCoverUrl": { _, a in try toJSON(sharpCoverUrl(arg(a, 0))) },
    "unitLabelFor": { _, a in try toJSON(unitLabelFor(arg(a, 0))) },
    "generateEntries": { _, a in try toJSON(generateEntries(arg(a, 0))) },
    "providerFor": { _, a in describe(noNetwork.provider(for: try arg(a, 0) as IrisCore.Category)) },
    "providerForSource": { _, a in
        describe(noNetwork.provider(forSource: try arg(a, 0), category: try arg(a, 1) as IrisCore.Category))
    },
]
