import type { Category } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

type TmdbSearchHit = { id: number; title?: string; name?: string };
type TmdbSearchResponse = { results?: TmdbSearchHit[] };
type TmdbSeason = { season_number: number; episode_count?: number };
type TmdbShowDetail = { seasons?: TmdbSeason[] };

/**
 * Season 0 is specials, not part of the main run — excluded from the sum.
 * Exported standalone so the summation itself is testable without mocking a
 * fetch. The schema has no seasons concept (D1): the result is still a flat
 * count for "Episode 1".."Episode N", not a per-season structure.
 */
export function sumEpisodeCount(seasons: readonly TmdbSeason[]): number {
  return seasons
    .filter((s) => s.season_number !== 0)
    .reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
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
   * below only matches `ManualProvider`'s for a caller that does anyway. Show
   * can do better than a guessed count (A9): a real match's `/tv/{id}` total
   * episode count replaces it, unless the series is marked ongoing (A4) —
   * that flag means "no known total", which a snapshot of aired seasons must
   * not silently override.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    const matched = result.id !== this.id;

    if (this.category !== 'show' || result.ongoing || !matched) {
      const draft = generateEntries(result);
      return matched ? { ...draft, externalSource: this.id, externalId: result.id } : draft;
    }

    const total = await this.fetchEpisodeTotal(result.id);
    const draft = generateEntries(total === null ? result : { ...result, count: total });
    return { ...draft, externalSource: this.id, externalId: result.id };
  }

  /** Never throws — a failed or unconfigured lookup just falls back to the
   * count the Add screen already collected, the same as no match at all. */
  private async fetchEpisodeTotal(showId: string): Promise<number | null> {
    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) return null;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}?api_key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as TmdbShowDetail;
      const total = sumEpisodeCount(body.seasons ?? []);
      return total > 0 ? total : null;
    } catch {
      return null;
    }
  }
}
