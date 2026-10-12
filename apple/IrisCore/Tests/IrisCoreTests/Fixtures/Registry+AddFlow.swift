@testable import IrisCore

private struct PickedTitle: Decodable { let title: String }
private struct InputArgs: Decodable {
    let category: Category
    let comicMode: ComicMode?
    let saveTitle: String
    let picked: SearchResult?
    let draft: SeriesDraft?
    let previewMetadata: TrackMetadata?
}

let addFlowFixtures: [String: FixtureFn] = [
    "addCatalogueKey": { a in try toJSON(addCatalogueKey(arg(a, 0), comicMode: arg(a, 1)).rawValue) },
    "addIsSeries": { a in try toJSON(addIsSeries(arg(a, 0), comicMode: arg(a, 1))) },
    "addBarcodeTypes": { a in try toJSON(addBarcodeTypes(arg(a, 0), comicMode: arg(a, 1))) },
    "confirmPrimaryLabel": { a in try toJSON(confirmPrimaryLabel(arg(a, 0))) },
    "manualPrimaryLabel": { a in try toJSON(manualPrimaryLabel(arg(a, 0))) },
    "addSaveTitle": { a in
        let picked: PickedTitle? = try arg(a, 0)
        return try toJSON(addSaveTitle(pickedTitle: picked?.title, pickedOrdinal: arg(a, 1), typed: arg(a, 2)))
    },
    "addTrackInput": { a in
        let i: InputArgs = try arg(a, 0)
        return try toJSON(addTrackInput(category: i.category, comicMode: i.comicMode, saveTitle: i.saveTitle,
                                        picked: i.picked, draft: i.draft, previewMetadata: i.previewMetadata))
    },
    "matchSummary": { a in try toJSON(matchSummary(isSeries: arg(a, 0), draft: arg(a, 1), preview: arg(a, 2))) },
]
