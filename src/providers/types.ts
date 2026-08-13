import type { Category, SeriesMediaType, UnitLabel } from '@/domain/types';

export type EntryDraft = { ordinal: number; title: string };

export type SearchResult = {
  id: string;
  title: string;
  category: Category;
  /** How many units the track has. Supplied by the user in v1. */
  count: number;
};

export type SeriesDraft = {
  title: string;
  mediaType: SeriesMediaType;
  unitLabel: UnitLabel;
  entries: EntryDraft[];
  externalSource?: string;
  externalId?: string;
};

export interface MetadataProvider {
  readonly id: string;
  search(query: string): Promise<SearchResult[]>;
  hydrate(result: SearchResult): Promise<SeriesDraft>;
}
