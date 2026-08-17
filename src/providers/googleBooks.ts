import type { Category } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import type { MatchPreview, MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

/** A scanned barcode's payload: an all-digit 10 or 13 character string is an
 * unambiguous ISBN, never a title someone would type (D5/A9). */
const ISBN_RE = /^\d{10}(\d{3})?$/;

type GoogleBooksVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    // Pulled off the wire and ignored — no cover art is a load-bearing design
    // principle (design-language.html, "Text is the artwork"), not an oversight.
    imageLinks?: { thumbnail?: string };
  };
};

type GoogleBooksResponse = { items?: GoogleBooksVolume[] };

type GoogleBooksVolumeDetail = {
  volumeInfo?: {
    authors?: string[];
    publishedDate?: string;
    pageCount?: number;
    description?: string;
  };
};

/** "2020-09-15" or a bare "2018" -> "2020"/"2018". `undefined`/too-short is
 * not a year worth showing. */
function yearOf(date: string | undefined): string | null {
  return date && date.length >= 4 ? date.slice(0, 4) : null;
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
   * the picked title, same as no match at all.
   */
  async preview(result: SearchResult): Promise<MatchPreview> {
    const fallback: MatchPreview = { title: result.title, metaLine: [], blurb: null };
    if (result.id === this.id) return fallback; // hand-typed title, no real match.

    const key = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    if (!key) return fallback;
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(result.id)}?key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return fallback;
      const body = (await response.json()) as GoogleBooksVolumeDetail;
      const info = body.volumeInfo;
      const metaLine = [
        info?.authors && info.authors.length > 0 ? info.authors.join(', ') : null,
        yearOf(info?.publishedDate),
        info?.pageCount ? `${info.pageCount} pages` : null,
      ].filter((s): s is string => s !== null);
      return { title: result.title, metaLine, blurb: info?.description ?? null };
    } catch {
      return fallback;
    }
  }
}
