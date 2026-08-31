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
  /**
   * A17: the confirm screen's meta line and blurb, fetched by the same
   * call that already produces the rest of this draft — never a second
   * network round trip. `undefined` (not an empty array) when a provider
   * has nothing more to say than the entry count already shows.
   */
  metaLine?: readonly string[];
  blurb?: string | null;
};

/**
 * A17: what the confirm screen shows for a real match — title, a joined
 * meta line (year range, count/status, whatever else a provider has), and
 * a blurb where one exists. Used two ways: a series category reads it off
 * the same `SeriesDraft` `hydrate()` already returns (no separate fetch);
 * a standalone category (book, movie, a comic collection) has no
 * equivalent draft to read it from, so its provider implements `preview`
 * directly instead.
 */
export type MatchPreview = {
  title: string;
  metaLine: readonly string[];
  blurb: string | null;
};

export interface MetadataProvider {
  readonly id: string;
  search(query: string): Promise<SearchResult[]>;
  hydrate(result: SearchResult): Promise<SeriesDraft>;
  /**
   * A17: only implemented by a provider that also answers a *standalone*
   * category (TMDB for movie, Google Books for book and a comic
   * collection) — a series category's confirm data comes from `hydrate`'s
   * own `metaLine`/`blurb` instead, so implementing this for TMDB/Metron/
   * AniList's series side would just be a second fetch for data `hydrate`
   * already has.
   */
  preview?(result: SearchResult): Promise<MatchPreview>;
}
