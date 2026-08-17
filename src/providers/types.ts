import type { Category, SeasonBoundary, SeriesMediaType, UnitLabel } from '@/domain/types';

export type EntryDraft = { ordinal: number; title: string };

export type SearchResult = {
  id: string;
  title: string;
  category: Category;
  /** How many units the track has. Supplied by the user in v1. */
  count: number;
  /** When true, `count` is ignored and one entry is generated. */
  ongoing?: boolean;
};

export type SeriesDraft = {
  title: string;
  mediaType: SeriesMediaType;
  unitLabel: UnitLabel;
  entries: EntryDraft[];
  /** A4: no known total; the list grows as you finish each entry. */
  ongoing?: boolean;
  externalSource?: string;
  externalId?: string;
  /** A11: TMDB only. */
  seasons?: readonly SeasonBoundary[];
};

export interface MetadataProvider {
  readonly id: string;
  search(query: string): Promise<SearchResult[]>;
  hydrate(result: SearchResult): Promise<SeriesDraft>;
}
