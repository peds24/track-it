/**
 * A22: catalogue image URLs, normalised. Google Books still hands out
 * `http://` thumbnails, which Android blocks as cleartext — every cover goes
 * through `httpsUrl` before it is stored or shown.
 */
export function httpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, 'https://');
}

export function tmdbImage(path: string | null | undefined, size: 'w92' | 'w342'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
