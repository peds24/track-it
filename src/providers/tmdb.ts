import type { Category, SeasonBoundary } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import type { MatchPreview, MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

type TmdbSearchHit = { id: number; title?: string; name?: string };
type TmdbSearchResponse = { results?: TmdbSearchHit[] };
type TmdbSeason = { season_number: number; episode_count?: number };
type TmdbShowDetail = {
  seasons?: TmdbSeason[];
  status?: string;
  overview?: string;
  first_air_date?: string;
  last_air_date?: string;
};
type TmdbMovieDetail = { overview?: string; release_date?: string };

/** "2026-08-16" -> "2026". `undefined`/too-short is not a year worth showing. */
function yearOf(date: string | undefined): string | null {
  return date && date.length >= 4 ? date.slice(0, 4) : null;
}

/**
 * Season 0 is specials, not part of the main run — excluded from the sum.
 * Exported standalone so the summation itself is testable without mocking a
 * fetch. The schema has no seasons concept for `Entry` (D1): this is still a
 * flat count for "Episode 1".."Episode N", not a per-season structure.
 */
export function sumEpisodeCount(seasons: readonly TmdbSeason[]): number {
  return seasons
    .filter((s) => s.season_number !== 0)
    .reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
}

/**
 * A11: the per-season breakdown `sumEpisodeCount` discards. Display
 * metadata for the segmented progress bar — `Series`/`SeriesDraft.seasons`,
 * never a new source of truth for progress.
 */
export function seasonBreakdown(seasons: readonly TmdbSeason[]): SeasonBoundary[] {
  return seasons
    .filter((s) => s.season_number !== 0)
    .map((s) => ({ number: s.season_number, episodeCount: s.episode_count ?? 0 }));
}

/**
 * TMDB, spanning `show` and `movie` (D5). No scan entry point calls this —
 * movies and shows have no retail barcodes — search is by title only. One
 * instance answers for exactly one category, fixed at construction, same
 * reasoning as `GoogleBooksProvider`.
 */
export class TmdbProvider implements MetadataProvider {
  readonly id = 'tmdb';

  constructor(private readonly category: Extract<Category, 'show' | 'movie'>) {}

  private endpoint(): 'tv' | 'movie' {
    return this.category === 'show' ? 'tv' : 'movie';
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) throw new Error('TMDB search needs EXPO_PUBLIC_TMDB_API_KEY');

    const url = `https://api.themoviedb.org/3/search/${this.endpoint()}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB search failed: ${response.status}`);
    const body = (await response.json()) as TmdbSearchResponse;

    const titleOf = (hit: TmdbSearchHit): string | undefined =>
      this.category === 'show' ? hit.name : hit.title;

    return (body.results ?? [])
      .filter((hit): hit is TmdbSearchHit => typeof titleOf(hit) === 'string')
      .map((hit) => ({
        id: String(hit.id),
        title: titleOf(hit)!,
        category: this.category,
        count: 1,
      }));
  }

  /**
   * Movie is standalone (D1) — `addTrack` never calls this for one; the guard
   * below only matches `ManualProvider`'s for a caller that does anyway.
   *
   * A11: a matched show's `ongoing` is no longer trusted from the caller —
   * it comes straight from TMDB's own `status` field. The manual "ongoing"
   * toggle only still matters for an unmatched, hand-typed title (the early
   * return below), which never reaches this branch.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    const matched = result.id !== this.id;

    if (this.category !== 'show' || !matched) {
      const draft = generateEntries(result);
      return matched ? { ...draft, externalSource: this.id, externalId: result.id } : draft;
    }

    const detail = await this.fetchShowDetail(result.id);
    const draft = generateEntries(
      detail === null ? result : { ...result, count: detail.total ?? result.count, ongoing: detail.ongoing },
    );
    const withSeasons = detail && detail.seasons.length > 0 ? { ...draft, seasons: detail.seasons } : draft;
    // A17: the confirm screen's meta line/blurb ride along on the exact
    // same fetch — never a second round trip for data already in hand.
    const withPreview = detail
      ? { ...withSeasons, metaLine: detail.metaLine, blurb: detail.blurb }
      : withSeasons;
    return { ...withPreview, externalSource: this.id, externalId: result.id };
  }

  /**
   * A17: movie has no series draft to carry `metaLine`/`blurb` on — this is
   * its whole confirm-screen answer, a single new fetch standing in for
   * what `hydrate` never needed to do for a standalone category (D1).
   * Never throws, matching this file's own established pattern for a
   * failed/unconfigured lookup: fall back to just the picked title.
   */
  async preview(result: SearchResult): Promise<MatchPreview> {
    const fallback: MatchPreview = { title: result.title, metaLine: [], blurb: null };
    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) return fallback;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/${encodeURIComponent(result.id)}?api_key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return fallback;
      const body = (await response.json()) as TmdbMovieDetail;
      const year = yearOf(body.release_date);
      return { title: result.title, metaLine: year ? [year] : [], blurb: body.overview ?? null };
    } catch {
      return fallback;
    }
  }

  /** Never throws — a failed or unconfigured lookup just falls back to the
   * count/ongoing the Add screen already collected, the same as no match at all. */
  private async fetchShowDetail(showId: string): Promise<{
    total: number | null;
    ongoing: boolean;
    seasons: SeasonBoundary[];
    metaLine: string[];
    blurb: string | null;
  } | null> {
    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) return null;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}?api_key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as TmdbShowDetail;
      const seasons = body.seasons ?? [];
      const breakdown = seasonBreakdown(seasons);
      const total = sumEpisodeCount(seasons);
      // "Ended"/"Canceled" both mean no more episodes are coming; anything
      // else ("Returning Series", "In Production", "Planned") means there is
      // a next one still to air.
      const ongoing = body.status !== 'Ended' && body.status !== 'Canceled';
      const startYear = yearOf(body.first_air_date);
      const endYear = yearOf(body.last_air_date);
      const yearRange = startYear
        ? ongoing
          ? `${startYear}–present`
          : endYear && endYear !== startYear
            ? `${startYear}–${endYear}`
            : startYear
        : null;
      const metaLine = [
        yearRange,
        breakdown.length > 0 ? `${breakdown.length} season${breakdown.length === 1 ? '' : 's'}` : null,
        total > 0 ? `${total} episode${total === 1 ? '' : 's'}` : null,
        ongoing ? 'Ongoing' : (body.status ?? null),
      ].filter((s): s is string => s !== null);
      return {
        total: total > 0 ? total : null,
        ongoing,
        seasons: breakdown,
        metaLine,
        blurb: body.overview ?? null,
      };
    } catch {
      return null;
    }
  }
}
