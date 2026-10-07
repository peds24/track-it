import type { FakeResponse, ProviderCase, ProviderName } from '../types';

// Extracted from src/providers/__tests__/googleBooks.test.ts. The tests'
// mockFetchOnce answers *every* call with the same body, so a title search
// that comes back empty (and so falls back to a plain query) gets that body
// twice here.
const KEY = { GOOGLE_BOOKS_API_KEY: 'test-key' };
const ISBN = [{ type: 'ISBN_13', identifier: '9780000000000' }];
const ok = (body: unknown): FakeResponse => ({ body });
const fail: FakeResponse = { status: 500, body: {} };
const empty = ok({ items: [] });
const book = (id: string, title: string, extra: Record<string, unknown> = {}) => ({ id, volumeInfo: { title, industryIdentifiers: ISBN, ...extra } });
const pick = (id: string, title: string, category = 'book') => ({ id, title, category, count: 1 });
const at = (
  name: string,
  provider: ProviderName,
  call: string,
  args: unknown[],
  responses: FakeResponse[] = [],
  env: Record<string, string> = KEY,
): ProviderCase => ({ name, provider, env, call, args, responses });

export const cases: ProviderCase[] = [
  at('search matches a typed title against book titles, books only', 'google-books-book', 'search', ['Dune'], [empty, empty]),
  at('search routes a scanned ISBN-13 to the isbn: query form', 'google-books-manga', 'search', ['9781593090020'], [empty]),
  at('search routes a scanned 10-digit ISBN the same way', 'google-books-book', 'search', ['0143127748'], [empty]),
  at('a title that happens to be all digits but the wrong length is not treated as an ISBN', 'google-books-book', 'search', ['12345'], [empty, empty]),
  at('maps results to SearchResult, tagged with the category this instance was built for', 'google-books-manga', 'search', ['Berserk'], [
    ok({ items: [{ id: 'abc123', volumeInfo: { title: 'Berserk, Vol. 1', imageLinks: { thumbnail: 'https://example.com/cover.jpg' }, industryIdentifiers: ISBN } }] }),
  ]),
  at('a comic-tagged instance searches and tags results comic, same as book/manga', 'google-books-comic', 'search', ['Saga'], [
    ok({ items: [{ id: 'saga-tpb-1', volumeInfo: { title: 'Saga, Volume 1', industryIdentifiers: ISBN } }] }),
  ]),
  at('an item with no title is skipped rather than producing a blank result', 'google-books-book', 'search', ['whatever'], [
    ok({ items: [{ id: 'no-title', volumeInfo: {} }] }),
    ok({ items: [{ id: 'no-title', volumeInfo: {} }] }),
  ]),
  at('search fails clearly rather than silently when the API key is missing', 'google-books-book', 'search', ['Dune'], [], {}),
  at('search on a blank query never calls the network', 'google-books-book', 'search', ['   '], [empty]),
  at('hydrate generates numbered volumes the same way ManualProvider does, for a real match', 'google-books-manga', 'hydrate', [{ id: 'abc123', title: 'Berserk', category: 'manga', count: 3 }], [], {}),
  at('hydrate records no external id for a hand-typed title with no real match', 'google-books-manga', 'hydrate', [{ id: 'google-books', title: 'Berserk', category: 'manga', count: 3 }], [], {}),
  at('preview (A17, book/comic collection): fetches the volume detail and returns year/pages and the description as blurb', 'google-books-book', 'preview', [pick('piranesi-id', 'Piranesi')], [
    ok({
      volumeInfo: {
        authors: ['Susanna Clarke'],
        publishedDate: '2020-09-15',
        pageCount: 245,
        description: 'A man lives in a House with countless rooms and endless corridors.',
      },
    }),
  ]),
  at('missing authors/pageCount/description are simply omitted, not blank entries', 'google-books-comic', 'preview', [pick('saga-tpb-1', 'Saga, Volume 1', 'comic')], [
    ok({ volumeInfo: { publishedDate: '2018' } }),
  ]),
  at('preview: falls back to just the title when the fetch fails, never throws', 'google-books-book', 'preview', [pick('piranesi-id', 'Piranesi')], [fail]),
  at('preview: falls back to just the title when no API key is configured', 'google-books-book', 'preview', [pick('piranesi-id', 'Piranesi')], [], {}),
  at('preview: a hand-typed title with no real match never calls the network', 'google-books-book', 'preview', [pick('google-books', 'Some Book')], [], {}),
  at('A22/A24 metadata: search hits carry authors, year, and an https thumbnail', 'google-books-book', 'search', ['Dune'], [
    ok({
      items: [
        {
          id: 'v1',
          volumeInfo: {
            title: 'Dune',
            authors: ['Frank Herbert'],
            publishedDate: '1965-08-01',
            imageLinks: { smallThumbnail: 'http://books.google.com/s.jpg', thumbnail: 'http://books.google.com/t.jpg' },
            industryIdentifiers: ISBN,
          },
        },
      ],
    }),
  ]),
  at('A22/A24 metadata: details maps the volume to cleaned metadata', 'google-books-book', 'details', ['v1'], [
    ok({
      volumeInfo: {
        authors: ['Frank Herbert', 'Brian Herbert'],
        publishedDate: '1965',
        description: '<p>Spice &amp; <i>sand</i>.</p>',
        imageLinks: { thumbnail: 'http://books.google.com/t.jpg' },
      },
    }),
  ]),
  at('A26: details flattens BISAC category paths into genres', 'google-books-book', 'details', ['v1'], [
    ok({ volumeInfo: { categories: ['Fiction / Science Fiction / Space Opera', 'Fiction / General'] } }),
  ]),
  at('details returns null when the lookup fails, so the backfill retries', 'google-books-book', 'details', ['v1'], [fail]),
  at('details answers with empty metadata when the volume is gone (404), so the backfill stamps it', 'google-books-book', 'details', ['gone'], [{ status: 404, body: {} }]),
  at('details returns null with no API key configured', 'google-books-book', 'details', ['v1'], [], {}),
  at('A25: drops volumes with no ISBN — journals, reports, proceedings', 'google-books-book', 'search', ['the name of the wind'], [
    ok({
      items: [
        book('real', 'The Name of the Wind'),
        { id: 'journal', volumeInfo: { title: 'Proceedings of the British Academy' } },
        { id: 'report', volumeInfo: { title: 'Merchant Vessels', industryIdentifiers: [{ type: 'OTHER', identifier: 'UOM:39015' }] } },
      ],
    }),
  ]),
  at('A25: drops summaries, study guides and book-club kits of the real book', 'google-books-book', 'search', ['project hail mary'], [
    ok({
      items: [
        book('real', 'Project Hail Mary'),
        book('s1', 'Summary and Analysis of Project Hail Mary'),
        book('s2', 'SUMMARY and REVIEW'),
        book('s3', 'Study Guide: Project Hail Mary'),
        book('s4', 'Book Club Kit'),
        book('s5', 'PROJECT HAIL MARY MOVIE REVIEW'),
      ],
    }),
  ]),
  at('A25: lists results with a cover and an author ahead of bare records', 'google-books-book', 'search', ['dune'], [
    ok({
      items: [
        book('bare', 'Dune'),
        book('full', 'Dune Messiah', { authors: ['Frank Herbert'], imageLinks: { thumbnail: 'https://x/t.jpg' } }),
        book('author-only', 'Dune: House Atreides', { authors: ['Brian Herbert'] }),
      ],
    }),
  ]),
  at('A25: collapses the same title by the same author to one result', 'google-books-book', 'search', ['rothfuss'], [
    ok({
      items: [
        book('a', 'The Name of the Wind', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/a.jpg' } }),
        book('b', 'The Name of the Wind', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/b.jpg' } }),
        book('c', 'The Wise Man’s Fear', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/c.jpg' } }),
      ],
    }),
  ]),
  at('A25: falls back to a plain query when nothing matches by title', 'google-books-book', 'search', ['frank herbert'], [empty, ok({ items: [book('x', 'Dune')] })]),
  at('A25: a scanned ISBN is looked up as-is, with no title fallback', 'google-books-book', 'search', ['9780143127741'], [empty]),

  // --- Iris parity (Review Focus 1, 2, 4) ---
  at('Iris parity: search encodes the query and key like encodeURIComponent', 'google-books-book', 'search', ["L'Étranger: Camus & co. / 2e éd."], [empty, empty], {
    GOOGLE_BOOKS_API_KEY: 'k+e/y=',
  }),
  at('Iris parity: search on a network error throws', 'google-books-book', 'search', ['Dune'], [{ networkError: true }]),
  at('Iris parity: search on a 500 throws with the status', 'google-books-book', 'search', ['Dune'], [fail]),
  at('Iris parity: details on a network error is null', 'google-books-book', 'details', ['v1'], [{ networkError: true }]),
  at('Iris parity: preview on a 404 falls back to the title', 'google-books-book', 'preview', [pick('v1', 'Dune')], [{ status: 404, body: {} }]),
  at('Iris parity: loose JSON — odd field types and a missing items list', 'google-books-book', 'search', ['x'], [
    ok({
      items: [
        { id: 'n', volumeInfo: { title: 42, industryIdentifiers: ISBN } },
        { id: 'seven', volumeInfo: { title: 'Seven', industryIdentifiers: ISBN, authors: [], publishedDate: null, imageLinks: null } },
        { id: 'i10', volumeInfo: { title: 'Ten', industryIdentifiers: [{ type: 'ISBN_10' }], extra: { deep: true } } },
      ],
    }),
  ]),
  at('Iris parity: loose JSON — no items at all, then fallback also empty', 'google-books-book', 'search', ['x'], [ok({}), ok({ items: null })]),
  at('Iris parity: preview with zero pages leaves pages out', 'google-books-book', 'preview', [pick('v1', 'Dune')], [ok({ volumeInfo: { pageCount: 0, publishedDate: '1965' } })]),
  at('Iris parity: a volume with no volumeInfo answers empty metadata', 'google-books-book', 'details', ['v1'], [ok({})]),
];
