import { cleanDescription } from '@/domain/formatters';
import type { TrackMetadata } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

const ENDPOINT = 'https://graphql.anilist.co';

const STAFF_FIELDS = `staff(perPage: 4, sort: [RELEVANCE]) { edges { role node { name { full } } } }`;

const SEARCH_QUERY = `
  query ($search: String) {
    Page(perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english }
        startDate { year }
        coverImage { medium }
        ${STAFF_FIELDS}
      }
    }
  }
`;

const DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      volumes
      chapters
      status
      description(asHtml: false)
      startDate { year }
      endDate { year }
      coverImage { large }
      ${STAFF_FIELDS}
    }
  }
`;

type AnilistStaff = { edges?: { role?: string; node?: { name?: { full?: string } } }[] };
type AnilistSearchHit = {
  id: number;
  title: { romaji?: string; english?: string };
  startDate?: { year?: number | null };
  coverImage?: { medium?: string | null };
  staff?: AnilistStaff;
};
type AnilistSearchResponse = { data?: { Page?: { media?: AnilistSearchHit[] } } };
type AnilistDetail = {
  volumes?: number | null;
  chapters?: number | null;
  status?: string;
  description?: string | null;
  startDate?: { year?: number | null };
  endDate?: { year?: number | null };
  coverImage?: { large?: string | null };
  staff?: AnilistStaff;
};
type AnilistDetailResponse = { data?: { Media?: AnilistDetail } };

/** The story credit ("Story", "Story & Art") is the author; else the first credit. */
function authorOf(staff: AnilistStaff | undefined): string | null {
  const edges = staff?.edges ?? [];
  const story = edges.find((e) => /story/i.test(e.role ?? '')) ?? edges[0];
  return story?.node?.name?.full ?? null;
}

function metadataOf(media: AnilistDetail): TrackMetadata {
  return {
    coverUrl: media.coverImage?.large ?? null,
    creator: authorOf(media.staff),
    description: cleanDescription(media.description),
    releaseYear: media.startDate?.year ? String(media.startDate.year) : null,
  };
}

/**
 * AniList — manga only (A11), replacing Google Books for that one category
 * (Google Books can never answer "how many volumes" from a single-book hit —
 * confirmed in `googleBooks.ts`). Keyless GraphQL, no rate-limit key to
 * manage.
 *
 * Tracks the *work*, not the printing: a search for "Monster" resolves to
 * the original 18-volume/162-chapter release, not a specific omnibus
 * reprint like "The Perfect Edition" — no API disambiguates which physical
 * edition a user owns. This is exactly why the Add screen's confirm step
 * exists, not a gap this provider needs to paper over.
 */
export class AnilistProvider implements MetadataProvider {
  readonly id = 'anilist';

  private async post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`AniList request failed: ${response.status}`);
    return (await response.json()) as T;
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const body = await this.post<AnilistSearchResponse>(SEARCH_QUERY, { search: trimmed });
    const hits = body.data?.Page?.media ?? [];
    const titleOf = (hit: AnilistSearchHit): string | undefined => hit.title.english ?? hit.title.romaji;

    return hits
      .filter((hit): hit is AnilistSearchHit => typeof titleOf(hit) === 'string')
      .map((hit) => ({
        id: String(hit.id),
        title: titleOf(hit)!,
        category: 'manga' as const,
        count: 1,
        creator: authorOf(hit.staff) ?? undefined,
        year: hit.startDate?.year ? String(hit.startDate.year) : undefined,
        thumbnailUrl: hit.coverImage?.medium ?? undefined,
      }));
  }

  /**
   * A real match reads `volumes` (falling back to `chapters` when a manga
   * has no separate volume count) and `status` for ongoing/completed — the
   * same "real total instead of a guess" trade TMDB and Metron make. Unlike
   * TMDB's count fetch, a network failure here propagates rather than
   * falling back silently, matching Metron's own precedent (`get()` is
   * never wrapped in a try/catch either).
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.id === this.id) return generateEntries(result); // no real match — typed title.

    const body = await this.post<AnilistDetailResponse>(DETAIL_QUERY, { id: Number(result.id) });
    const media = body.data?.Media;
    const ongoing = media?.status === 'RELEASING' || media?.status === 'NOT_YET_RELEASED';
    const total = media?.volumes ?? media?.chapters ?? null;

    const draft = generateEntries({
      ...result,
      count: !ongoing && total && total > 0 ? total : result.count,
      ongoing,
    });

    // A17: the confirm screen's meta line/blurb — the same Media lookup
    // hydrate already makes for volumes/chapters/status, no second fetch.
    const startYear = media?.startDate?.year ?? null;
    const endYear = media?.endDate?.year ?? null;
    const yearRange = startYear
      ? ongoing
        ? `${startYear}–present`
        : endYear && endYear !== startYear
          ? `${startYear}–${endYear}`
          : String(startYear)
      : null;
    const countLabel =
      total && total > 0 ? `${total} ${media?.volumes ? 'volume' : 'chapter'}${total === 1 ? '' : 's'}` : null;
    const metaLine = [yearRange, countLabel, ongoing ? 'Ongoing' : 'Completed'].filter(
      (s): s is string => s !== null,
    );

    return {
      ...draft,
      externalSource: this.id,
      externalId: result.id,
      metaLine,
      blurb: cleanDescription(media?.description),
      metadata: media ? metadataOf(media) : undefined,
    };
  }

  /** A22: the backfill's lookup — never throws, unlike `hydrate`. */
  async details(externalId: string): Promise<TrackMetadata | null> {
    try {
      const body = await this.post<AnilistDetailResponse>(DETAIL_QUERY, { id: Number(externalId) });
      return body.data?.Media ? metadataOf(body.data.Media) : null;
    } catch {
      return null;
    }
  }
}
