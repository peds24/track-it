import type { addTrack } from '@/data/addTrack';
import type { TrackMetadata } from '@/domain/types';
import { parseSeriesTitle } from '@/domain/seriesTitle';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import type { MatchPreview, SearchResult, SeriesDraft } from '@/providers/types';

// The Add screen's decision rules, shared by app/add.tsx and (through
// shared/fixtures/addFlow.json) the Iris iOS Add sheet. No React imports.

export type ComicMode = 'single' | 'collection';

/** Which catalogue answers: the category's registry provider (D10), or
 * Google Books for a comic collection (A14), which the registry can't express. */
export type AddCatalogueKey = Category | 'comic-collection';

export function addCatalogueKey(category: Category, comicMode: ComicMode | null): AddCatalogueKey {
  return category === 'comic' && comicMode === 'collection' ? 'comic-collection' : category;
}

/** A16: tracked unit by unit — a unit label, and not a comic collection. */
export function addIsSeries(category: Category, comicMode: ComicMode | null): boolean {
  const isCollectionComic = category === 'comic' && comicMode === 'collection';
  return unitLabelFor(category) !== null && !isCollectionComic;
}

export type BarcodeKind = 'ean13' | 'ean8' | 'upc_a';
const ISBN_BARCODE_TYPES: BarcodeKind[] = ['ean13', 'ean8'];

/** A9/A14: book and manga are ISBN (EAN-13), a single-issue comic is UPC-A,
 * a comic collection is ISBN-barcoded like a book; show and movie have no
 * retail barcode (null: no scan button). A comic before its mode is chosen has none yet. */
export function addBarcodeTypes(category: Category, comicMode: ComicMode | null): BarcodeKind[] | null {
  if (category === 'comic') {
    if (comicMode === 'single') return ['upc_a'];
    if (comicMode === 'collection') return ISBN_BARCODE_TYPES;
    return null;
  }
  return category === 'book' || category === 'manga' ? ISBN_BARCODE_TYPES : null;
}

/** A11/A17: the confirm screen's main button. */
export function confirmPrimaryLabel(category: Category): string {
  if (category === 'movie') return 'Watched';
  if (category === 'show') return 'Start watching';
  return 'Start reading';
}

/** The no-match screen's main button (D2: a movie is "Watched", never "Start"). */
export function manualPrimaryLabel(category: Category): string {
  return category === 'movie' ? 'Watched' : 'Start';
}

/** A10/A24: the pick's own title plus a scanned "#N", or whatever was typed. */
export function addSaveTitle(picked: { title: string } | null, pickedOrdinal: number | null, typed: string): string {
  return picked ? (pickedOrdinal !== null ? `${picked.title} #${pickedOrdinal}` : picked.title) : typed;
}

export type AddTrackInput = Parameters<typeof addTrack>[1];

/** What handleSave passes to addTrack. */
export function addTrackInput(args: {
  category: Category;
  comicMode: ComicMode | null;
  saveTitle: string;
  picked: SearchResult | null;
  draft: SeriesDraft | null;
  previewMetadata: TrackMetadata | null;
}): AddTrackInput {
  const { category, comicMode, saveTitle, picked, draft, previewMetadata } = args;
  const isCollectionComic = category === 'comic' && comicMode === 'collection';
  const isSeries = addIsSeries(category, comicMode);
  const { title, ordinal } =
    (category === 'comic' && !isCollectionComic) || category === 'manga'
      ? parseSeriesTitle(saveTitle)
      : { title: saveTitle.trim(), ordinal: null };
  return {
    title,
    category,
    count: 1,
    ongoing: isSeries,
    match: picked ?? undefined,
    startAtOrdinal: ordinal ?? undefined,
    draft: isSeries && draft ? draft : undefined,
    standalone: isCollectionComic || undefined,
    externalSource: isCollectionComic ? 'google-books' : undefined,
    metadata: !isSeries ? (previewMetadata ?? undefined) : undefined,
  };
}

/** A17: the confirm screen's data — hydrate's for a series, preview's for a standalone. */
export function matchSummary(isSeries: boolean, draft: SeriesDraft | null, preview: MatchPreview | null): MatchPreview | null {
  if (!isSeries) return preview;
  return draft ? { title: draft.title, metaLine: draft.metaLine ?? [], blurb: draft.blurb ?? null, metadata: draft.metadata } : null;
}
