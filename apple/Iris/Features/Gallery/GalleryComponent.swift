#if DEBUG
/// One Gallery page per component in design/iris/components.md, same
/// order, same names (ComponentContractTests checks).
enum GalleryComponent: String, CaseIterable, Identifiable {
    case IrisShelfRow, IrisCover, IrisProgress, IrisCategoryChip, IrisPrimaryButton
    case IrisSheet, IrisEmptyState, IrisRatingBadge, IrisComparisonCard, IrisSymbol
    var id: String { rawValue }
}
#endif
