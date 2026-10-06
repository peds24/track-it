/**
 * A26: catalogue genres, flattened to one comparable list. Google Books
 * sends BISAC-style paths ("Fiction / Science Fiction / Space Opera"),
 * TMDB/AniList/Metron send flat names; each path segment counts as its own
 * genre so "Fiction / Fantasy / Epic" still matches a plain "Fantasy".
 * Filler segments ("General") and duplicates (case-insensitive) drop out.
 */
const FILLER = new Set(['general', 'other', 'miscellaneous']);

export function genresFrom(raw: readonly (string | null | undefined)[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw ?? []) {
    for (const part of (value ?? '').split('/')) {
      const name = part.trim();
      const key = name.toLowerCase();
      if (name.length === 0 || FILLER.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** `{ genres }` only when there are any, so a record with none looks exactly
 * as it did before genres were collected. */
export function withGenres<T extends object>(base: T, raw: readonly (string | null | undefined)[] | null | undefined): T & { genres?: string[] } {
  const genres = genresFrom(raw);
  return genres.length > 0 ? { ...base, genres } : base;
}
