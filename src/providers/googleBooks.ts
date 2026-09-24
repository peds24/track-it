import { cleanDescription, yearOf } from '@/domain/formatters';
import type { Category, TrackMetadata } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import { googleBooksImage, sharpCoverUrl } from '@/providers/images';
import type { MatchPreview, MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

/** A scanned barcode's payload: an all-digit 10 or 13 character string is an
 * unambiguous ISBN, never a title someone would type (D5/A9). */
const ISBN_RE = /^\d{10}(\d{3})?$/;

type ImageLinks = { thumbnail?: string; smallThumbnail?: string };

type GoogleBooksVolume = {
  id: string;
  volumeInfo?: { title?: string; authors?: string[]; publishedDate?: string; imageLinks?: ImageLinks };
};

type GoogleBooksResponse = { items?: GoogleBooksVolume[] };

type VolumeInfo = {
  authors?: string[];
  publishedDate?: string;
  pageCount?: number;
  description?: string;
  imageLinks?: ImageLinks;
};
type GoogleBooksVolumeDetail = { volumeInfo?: VolumeInfo };

function authorsOf(authors: string[] | undefined): string | null {
  return authors && authors.length > 0 ? authors.join(', ') : null;
}

function metadataOf(info: VolumeInfo): TrackMetadata {
  return {
    coverUrl: sharpCoverUrl(info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail),
    creator: authorsOf(info.authors),
    description: cleanDescription(info.description),
    releaseYear: yearOf(info.publishedDate),
  };
}

/**
 * Google Books, spanning `book`, `manga`, and (A14) `comic` collections —
 * all three are ISBN-barcode media. One instance answers for exactly one
 * category, fixed at construction: `MetadataProvider.search()` carries no
 * category parameter of its own, and the registry (D10) needs
 * differently-tagged instances rather than a change to that interface.
 * `comic` is never registered globally (Metron stays the registry's
 * default for single issues, A9) — the Add screen instantiates a
 * comic-tagged instance directly for the collection path only.
 */
export class GoogleBooksProvider implements MetadataProvider {
  readonly id = 'google-books';

  constructor(private readonly category: Extract<Category, 'book' | 'manga' | 'comic'>) {}

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const key = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    if (!key) throw new Error('Google Books search needs EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY');

    // A scanned code is routed to the isbn: form — the standard, reliable
    // lookup for a barcode — rather than treated as free text (D5/A9).
    const q = ISBN_RE.test(trimmed) ? `isbn:${trimmed}` : trimmed;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google Books search failed: ${response.status}`);
    const body = (await response.json()) as GoogleBooksResponse;

    return (body.items ?? [])
      .filter((item): item is GoogleBooksVolume & { volumeInfo: { title: string } } =>
        typeof item.volumeInfo?.title === 'string',
      )
      .map((item) => ({
        id: item.id,
        title: item.volumeInfo.title,
        category: this.category,
        // A hit only ever confirms a title (D5) — Google Books cannot tell a
        // manga series has 34 volumes from a single-book lookup, so this is a
        // placeholder the Add screen's own count field still supplies.
        count: 1,
        creator: authorsOf(item.volumeInfo.authors) ?? undefined,
        year: yearOf(item.volumeInfo.publishedDate) ?? undefined,
        thumbnailUrl: googleBooksImage(item.volumeInfo.imageLinks?.thumbnail ?? item.volumeInfo.imageLinks?.smallThumbnail, 200) ?? undefined,
      }));
  }

  /**
   * A9: the only thing a real match changes is where the *title* came from —
   * entry generation is exactly `ManualProvider`'s, numbered "Volume 1",
   * "Volume 2", … from whatever count the Add screen collected.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    const draft = generateEntries(result);
    // `result.id === this.id` is the sentinel a hand-typed title carries (see
    // addTrack.ts) — no real match, so nothing to record.
    if (result.id === this.id) return draft;
    return { ...draft, externalSource: this.id, externalId: result.id };
  }

  /**
   * A17: the confirm screen's data for a standalone book or comic collection
   * — a fetch by volume id, the one lookup `search()` never makes (it only
   * ever returns a title). Never throws, matching `TmdbProvider.preview`'s
   * established pattern: a failed or unconfigured lookup just falls back to
   * the picked title, same as no match at all. `null` means the lookup
   * failed (or no key), not "found nothing"; `'gone'` means Google answered
   * 404 — the volume no longer exists, which is an answer, not a failure.
   */
  private async fetchVolume(volumeId: string): Promise<VolumeInfo | 'gone' | null> {
    const key = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    if (!key) return null;
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}?key=${encodeURIComponent(key)}`,
      );
      if (response.status === 404) return 'gone';
      if (!response.ok) return null;
      const body = (await response.json()) as GoogleBooksVolumeDetail;
      return body.volumeInfo ?? {};
    } catch {
      return null;
    }
  }

  async preview(result: SearchResult): Promise<MatchPreview> {
    const fallback: MatchPreview = { title: result.title, metaLine: [], blurb: null };
    if (result.id === this.id) return fallback; // hand-typed title, no real match.
    const info = await this.fetchVolume(result.id);
    if (!info || info === 'gone') return fallback;
    const metadata = metadataOf(info);
    // No author here: the confirm screen's credit line already shows
    // `metadata.creator`, so repeating it in the meta line doubled it.
    const metaLine = [
      metadata.releaseYear,
      info.pageCount ? `${info.pageCount} pages` : null,
    ].filter((s): s is string => s !== null);
    return { title: result.title, metaLine, blurb: metadata.description, metadata };
  }

  /**
   * A22: the backfill's lookup — same mapping `preview` stores at add time.
   * A deleted volume (404) answers with empty metadata so the backfill stamps
   * the row instead of retrying it on every launch; other failures stay null.
   */
  async details(externalId: string): Promise<TrackMetadata | null> {
    const info = await this.fetchVolume(externalId);
    if (info === 'gone') return { coverUrl: null, creator: null, description: null, releaseYear: null };
    return info ? metadataOf(info) : null;
  }
}
