import type { ProviderCase } from '../types';

// Extracted from src/providers/__tests__/{images,manual,registry}.test.ts.
const c = (name: string, call: string, ...args: unknown[]): ProviderCase => ({ name, call, args });
const manual = (name: string, call: string, ...args: unknown[]): ProviderCase => ({ name, provider: 'manual', call, args });
const result = (category: string, count: number | null, extra: Record<string, unknown> = {}) => ({ id: 'manual', title: 'X', category, count, ...extra });

export const cases: ProviderCase[] = [
  // --- images.test.ts ---
  c('bumps a TMDB poster of any small size to w780', 'sharpCoverUrl', 'https://image.tmdb.org/t/p/w342/p.jpg'),
  c('bumps a TMDB poster of any small size to w780 (2)', 'sharpCoverUrl', 'https://image.tmdb.org/t/p/w92/p.jpg'),
  c('bumps an AniList cover to its extraLarge path', 'sharpCoverUrl', 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx1.jpg'),
  c('bumps an AniList cover to its extraLarge path (2)', 'sharpCoverUrl', 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/small/bx1.jpg'),
  c(
    'asks Google Books for a 600px-wide cover without the page-curl effect',
    'sharpCoverUrl',
    'http://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api',
  ),
  c('replaces an existing fife width rather than adding a second one', 'sharpCoverUrl', 'https://books.google.com/books/content?id=X&zoom=1&fife=w200'),
  c('leaves every other URL alone, apart from forcing https', 'sharpCoverUrl', 'https://static.metron.cloud/media/issue/1.jpg'),
  c('leaves every other URL alone, apart from forcing https (2)', 'sharpCoverUrl', 'http://example.com/a.jpg'),
  c('passes null through', 'sharpCoverUrl', null),
  c('googleBooksImage sizes a thumbnail to the requested width', 'googleBooksImage', 'http://books.google.com/books/content?id=X&zoom=5&edge=curl', 200),
  c('Iris parity: httpsUrl forces https case-insensitively', 'httpsUrl', 'HTTP://Example.com/a.jpg'),
  c('Iris parity: tmdbImage builds a poster URL, or null', 'tmdbImage', '/p.jpg', 'w185'),
  c('Iris parity: tmdbImage builds a poster URL, or null (2)', 'tmdbImage', null, 'w780'),
  c('Iris parity: a Google Books publisher cover is sized too', 'sharpCoverUrl', 'https://books.google.co.uk/books/publisher/content?id=Y&edge=curl'),

  // --- manual.test.ts ---
  manual('manual search returns nothing — there is no catalogue in v1', 'search', 'berserk'),
  manual('hydrate generates numbered volume entries for a manga', 'hydrate', { id: 'manual', title: 'Berserk', category: 'manga', count: 3 }),
  manual('hydrate labels show entries as episodes', 'hydrate', { id: 'manual', title: 'Severance', category: 'show', count: 2 }),
  manual('hydrate rejects a count below 1', 'hydrate', result('show', 0)),
  ...['show', 'comic', 'manga', 'book', 'movie'].map((cat, i) =>
    c(`unitLabelFor maps each category, with null for standalone ones${i ? ` (${i + 1})` : ''}`, 'unitLabelFor', cat),
  ),
  manual('hydrate generates numbered issue entries for a comic', 'hydrate', { id: 'manual', title: 'Saga', category: 'comic', count: 2 }),
  manual('hydrate rejects book — a standalone track has no entries to generate', 'hydrate', result('book', 3)),
  manual('hydrate rejects movie — a standalone track has no entries to generate', 'hydrate', result('movie', 3)),
  manual('hydrate rejects a fractional count rather than silently truncating it', 'hydrate', result('show', 2.5)),
  manual('hydrate rejects a count above the upper bound', 'hydrate', result('show', 3_000_000)),
  manual('hydrate rejects a count above the upper bound (2)', 'hydrate', result('show', 5001)),
  manual('hydrate accepts an ongoing series with no usable count', 'hydrate', { id: 'manual', title: 'Pluribus', category: 'show', count: null, ongoing: true }),
  manual('hydrate accepts a count exactly at the bound', 'hydrate', result('show', 5000)),
  c('Iris parity: generateEntries directly, ongoing manga', 'generateEntries', { id: 'x', title: 'One Piece', category: 'manga', count: 0, ongoing: true }),

  // --- registry.test.ts ---
  c('book resolves to Google Books', 'providerFor', 'book'),
  c('manga resolves to AniList', 'providerFor', 'manga'),
  c('comic resolves to Metron', 'providerFor', 'comic'),
  c('show and movie resolve to TMDB', 'providerFor', 'show'),
  c('show and movie resolve to TMDB (2)', 'providerFor', 'movie'),
  c('registering a category does not change what any other category resolves to', 'providerFor', 'book'),
  c('registering a category does not change what any other category resolves to (2)', 'providerFor', 'manga'),
  ...[
    ['google-books', 'comic'],
    ['tmdb', 'movie'],
    ['tmdb', 'show'],
    ['metron', 'comic'],
    ['anilist', 'manga'],
    ['something-else', 'book'],
  ].map(([source, category], i) =>
    c(`providerForSource resolves each stored external_source${i ? ` (${i + 1})` : ''}`, 'providerForSource', source, category),
  ),
];
