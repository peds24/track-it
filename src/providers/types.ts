import type { Category, SeasonBoundary, SeriesMediaType, TrackMetadata, UnitLabel } from '@/domain/types';

export type EntryDraft = { ordinal: number; title: string };

export type SearchResult = {
  id: string;
  title: string;
  category: Category;
  /** How many units the track has. Supplied by the user in v1. */
  count: number;
  /** When true, `count` is ignored and one entry is generated. */
  ongoing?: boolean;
  /** A24: disambiguation shown under the title in search results — filled
   * only from what the search call itself returns, never a per-hit fetch. */
  creator?: string;
  year?: string;
  thumbnailUrl?: string;
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
  /** A22: stored on the series row at save time — no second fetch. */
  metadata?: TrackMetadata;
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
  /** A22: stored on the standalone entry at save time. Absent on a fallback. */
  metadata?: TrackMetadata;
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
  /**
   * A22: display metadata for a known catalogue id — what the first-launch
   * backfill calls for a track added before metadata was stored. Never
   * throws; `null` means the lookup itself failed (network, missing key) and
   * should be retried later, as opposed to a found record with empty fields.
   */
  details?(externalId: string): Promise<TrackMetadata | null>;
  /**
   * A25: the catalogue record for unit `ordinal` of the same series as
   * `externalId` — Longbox's next-issue lookup, used to move a comic's cover
   * and issue number along as it is read. Only Metron has per-issue records;
   * `null` means no such unit (yet) or a failed lookup. Never throws.
   */
  unitAt?(externalId: string, ordinal: number): Promise<UnitRecord | null>;
}

/** A25: one unit of a catalogued series — a single comic issue. */
export type UnitRecord = { externalId: string; number: string; coverUrl: string | null };
