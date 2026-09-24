/**
 * A22: catalogue image URLs, normalised. Google Books still hands out
 * `http://` thumbnails, which Android blocks as cleartext — every cover goes
 * through `httpsUrl` before it is stored or shown.
 */
export function httpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:\/\//i, 'https://');
}

export function tmdbImage(path: string | null | undefined, size: 'w185' | 'w780'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

const GOOGLE_BOOKS_CONTENT = /^https:\/\/books\.google\.[a-z.]+\/books\/(publisher\/)?content\?/i;

/**
 * A25: a Google Books cover at `width` pixels. `fife=w<N>` returns the
 * largest real scan up to that width; raising `zoom` instead returns a
 * "image not available" strip for older scanned volumes. `edge=curl` draws
 * a fake page curl over the corner, which is dropped.
 */
export function googleBooksImage(url: string | null | undefined, width: number): string | null {
  const secure = httpsUrl(url);
  if (!secure || !GOOGLE_BOOKS_CONTENT.test(secure)) return secure;
  const [base, query = ''] = secure.split('?');
  const params = query.split('&').filter((p) => p.length > 0 && p !== 'edge=curl' && !p.startsWith('fife='));
  return `${base}?${[...params, `fife=w${width}`].join('&')}`;
}

/**
 * A25: the detail screen shows a cover at 160×240dp — about 420px wide on a
 * phone — and the sizes first stored (Google Books' 128px `thumbnail`,
 * TMDB's `w342`, AniList's `large`, which is really its medium) looked
 * blurry at that size. Applied when a cover is stored and again when one is
 * read, so a URL saved before this existed sharpens too, with no refetch.
 * Metron already serves full-size scans and passes through untouched.
 */
export function sharpCoverUrl(url: string | null | undefined): string | null {
  const secure = httpsUrl(url);
  if (!secure) return null;
  if (GOOGLE_BOOKS_CONTENT.test(secure)) return googleBooksImage(secure, 600);
  return secure
    .replace(/^(https:\/\/image\.tmdb\.org\/t\/p\/)w(92|154|185|342|500)\//, '$1w780/')
    .replace(/(anilistcdn\/media\/[a-z]+\/cover\/)(small|medium)\//, '$1large/');
}
