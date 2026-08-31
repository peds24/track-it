import { GoogleBooksProvider } from '@/providers/googleBooks';

function mockFetchOnce(body: unknown, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

afterEach(() => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = ORIGINAL_KEY;
  jest.restoreAllMocks();
});

test('search builds a plain text query for a typed title', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });

  await new GoogleBooksProvider('book').search('Dune');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('q=Dune');
  expect(url).not.toContain('isbn%3A');
  expect(url).toContain('key=test-key');
});

test('search routes a scanned ISBN-13 to the isbn: query form', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });

  await new GoogleBooksProvider('manga').search('9781593090020');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain(encodeURIComponent('isbn:9781593090020'));
});

test('search routes a scanned 10-digit ISBN the same way', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });

  await new GoogleBooksProvider('book').search('0143127748');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain(encodeURIComponent('isbn:0143127748'));
});

test('a title that happens to be all digits but the wrong length is not treated as an ISBN', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });

  await new GoogleBooksProvider('book').search('12345');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).not.toContain('isbn');
});

test('maps results to SearchResult, tagged with the category this instance was built for', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  mockFetchOnce({
    items: [
      {
        id: 'abc123',
        volumeInfo: { title: 'Berserk, Vol. 1', imageLinks: { thumbnail: 'https://example.com/cover.jpg' } },
      },
    ],
  });

  const results = await new GoogleBooksProvider('manga').search('Berserk');

  // count defaults to 1 — a hit only ever confirms a title (D5), it cannot
  // tell a manga series has 34 volumes from a single-book lookup.
  expect(results).toEqual([{ id: 'abc123', title: 'Berserk, Vol. 1', category: 'manga', count: 1 }]);
  // No cover art is load-bearing (design-language.html) — the thumbnail must
  // not survive into the mapped result.
  expect(results[0]).not.toHaveProperty('thumbnail');
  expect(results[0]).not.toHaveProperty('imageLinks');
});

// A14: comic collections (TPB, hardcover, omnibus) route through Google
// Books too — Metron only catalogues single issues.
test('a comic-tagged instance searches and tags results comic, same as book/manga', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  mockFetchOnce({
    items: [{ id: 'saga-tpb-1', volumeInfo: { title: 'Saga, Volume 1' } }],
  });

  const results = await new GoogleBooksProvider('comic').search('Saga');
  expect(results).toEqual([{ id: 'saga-tpb-1', title: 'Saga, Volume 1', category: 'comic', count: 1 }]);
});

test('an item with no title is skipped rather than producing a blank result', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  mockFetchOnce({ items: [{ id: 'no-title', volumeInfo: {} }] });

  const results = await new GoogleBooksProvider('book').search('whatever');
  expect(results).toEqual([]);
});

test('search fails clearly rather than silently when the API key is missing', async () => {
  delete process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
  await expect(new GoogleBooksProvider('book').search('Dune')).rejects.toThrow(
    /EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY/,
  );
});

test('search on a blank query never calls the network', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });
  await new GoogleBooksProvider('book').search('   ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate generates numbered volumes the same way ManualProvider does, for a real match', async () => {
  const draft = await new GoogleBooksProvider('manga').hydrate({
    id: 'abc123',
    title: 'Berserk',
    category: 'manga',
    count: 3,
  });

  expect(draft.entries).toEqual([
    { ordinal: 1, title: 'Volume 1' },
    { ordinal: 2, title: 'Volume 2' },
    { ordinal: 3, title: 'Volume 3' },
  ]);
  expect(draft.externalSource).toBe('google-books');
  expect(draft.externalId).toBe('abc123');
});

test('hydrate records no external id for a hand-typed title with no real match', async () => {
  const draft = await new GoogleBooksProvider('manga').hydrate({
    id: 'google-books', // the sentinel addTrack.ts uses for an unmatched title
    title: 'Berserk',
    category: 'manga',
    count: 3,
  });

  expect(draft.externalSource).toBeUndefined();
  expect(draft.externalId).toBeUndefined();
});

// A17: the confirm screen's data for standalone book/comic-collection
// matches — a fetch by volume id, never made during search() or hydrate().
describe('preview (A17, book/comic collection)', () => {
  test('fetches the volume detail and returns author/year/pages and the description as blurb', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    const fetchMock = mockFetchOnce({
      volumeInfo: {
        authors: ['Susanna Clarke'],
        publishedDate: '2020-09-15',
        pageCount: 245,
        description: 'A man lives in a House with countless rooms and endless corridors.',
      },
    });

    const preview = await new GoogleBooksProvider('book').preview({
      id: 'piranesi-id',
      title: 'Piranesi',
      category: 'book',
      count: 1,
    });

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/volumes/piranesi-id');
    expect(preview).toEqual({
      title: 'Piranesi',
      metaLine: ['Susanna Clarke', '2020', '245 pages'],
      blurb: 'A man lives in a House with countless rooms and endless corridors.',
    });
  });

  test('missing authors/pageCount/description are simply omitted, not blank entries', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({ volumeInfo: { publishedDate: '2018' } });

    const preview = await new GoogleBooksProvider('comic').preview({
      id: 'saga-tpb-1',
      title: 'Saga, Volume 1',
      category: 'comic',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Saga, Volume 1', metaLine: ['2018'], blurb: null });
  });

  test('falls back to just the title when the fetch fails, never throws', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({}, false);

    const preview = await new GoogleBooksProvider('book').preview({
      id: 'piranesi-id',
      title: 'Piranesi',
      category: 'book',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Piranesi', metaLine: [], blurb: null });
  });

  test('falls back to just the title when no API key is configured', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const preview = await new GoogleBooksProvider('book').preview({
      id: 'piranesi-id',
      title: 'Piranesi',
      category: 'book',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Piranesi', metaLine: [], blurb: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a hand-typed title with no real match never calls the network', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const preview = await new GoogleBooksProvider('book').preview({
      id: 'google-books', // the sentinel addTrack.ts uses for an unmatched title
      title: 'Some Book',
      category: 'book',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Some Book', metaLine: [], blurb: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
