import { GoogleBooksProvider } from '@/providers/googleBooks';

function mockFetchOnce(body: unknown, ok = true): jest.Mock {
  const fn = jest.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ISBN = [{ type: 'ISBN_13', identifier: '9780000000000' }];

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

afterEach(() => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = ORIGINAL_KEY;
  jest.restoreAllMocks();
});

test('search matches a typed title against book titles, books only', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  const fetchMock = mockFetchOnce({ items: [] });

  await new GoogleBooksProvider('book').search('Dune');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain(`q=${encodeURIComponent('intitle:Dune')}`);
  expect(url).toContain('printType=books');
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
        volumeInfo: { title: 'Berserk, Vol. 1', imageLinks: { thumbnail: 'https://example.com/cover.jpg' }, industryIdentifiers: ISBN },
      },
    ],
  });

  const results = await new GoogleBooksProvider('manga').search('Berserk');

  // count defaults to 1 — a hit only ever confirms a title (D5), it cannot
  // tell a manga series has 34 volumes from a single-book lookup.
  // A22 reverses the earlier "no cover art" rule: a thumbnail now survives
  // into the mapped result as `thumbnailUrl`, for disambiguation (A24) — but
  // only under that name, never the raw `thumbnail`/`imageLinks` shape.
  expect(results).toEqual([
    { id: 'abc123', title: 'Berserk, Vol. 1', category: 'manga', count: 1, thumbnailUrl: 'https://example.com/cover.jpg' },
  ]);
  expect(results[0]).not.toHaveProperty('thumbnail');
  expect(results[0]).not.toHaveProperty('imageLinks');
});

// A14: comic collections (TPB, hardcover, omnibus) route through Google
// Books too — Metron only catalogues single issues.
test('a comic-tagged instance searches and tags results comic, same as book/manga', async () => {
  process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
  mockFetchOnce({
    items: [{ id: 'saga-tpb-1', volumeInfo: { title: 'Saga, Volume 1', industryIdentifiers: ISBN } }],
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
  test('fetches the volume detail and returns year/pages and the description as blurb', async () => {
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
    expect(preview).toMatchObject({
      title: 'Piranesi',
      // The author is carried by metadata.creator (the confirm screen's credit
      // line), not repeated in the meta line.
      metaLine: ['2020', '245 pages'],
      blurb: 'A man lives in a House with countless rooms and endless corridors.',
    });
    expect(preview.metadata?.creator).toBe('Susanna Clarke');
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

    expect(preview).toEqual({
      title: 'Saga, Volume 1',
      metaLine: ['2018'],
      blurb: null,
      metadata: { coverUrl: null, creator: null, description: null, releaseYear: '2018' },
    });
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

describe('A22/A24 metadata', () => {
  test('search hits carry authors, year, and an https thumbnail', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
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
    });

    const [hit] = await new GoogleBooksProvider('book').search('Dune');

    expect(hit).toMatchObject({
      creator: 'Frank Herbert',
      year: '1965',
      thumbnailUrl: 'https://books.google.com/t.jpg',
    });
  });

  test('details maps the volume to cleaned metadata', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
      volumeInfo: {
        authors: ['Frank Herbert', 'Brian Herbert'],
        publishedDate: '1965',
        description: '<p>Spice &amp; <i>sand</i>.</p>',
        imageLinks: { thumbnail: 'http://books.google.com/t.jpg' },
      },
    });

    expect(await new GoogleBooksProvider('book').details('v1')).toEqual({
      coverUrl: 'https://books.google.com/t.jpg',
      creator: 'Frank Herbert, Brian Herbert',
      description: 'Spice & sand.',
      releaseYear: '1965',
    });
  });

  test('details returns null when the lookup fails, so the backfill retries', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({}, false);
    expect(await new GoogleBooksProvider('book').details('v1')).toBeNull();
  });

  test('details answers with empty metadata when the volume is gone (404), so the backfill stamps it', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await new GoogleBooksProvider('book').details('gone')).toEqual({
      coverUrl: null,
      creator: null,
      description: null,
      releaseYear: null,
    });
  });

  test('details returns null with no API key configured', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
    expect(await new GoogleBooksProvider('book').details('v1')).toBeNull();
  });
});

// A25: book search returned journals, government reports and conference
// proceedings alongside real books. Every junk row seen against the live
// API lacked an ISBN; the real books all had one.
describe('A25 search filtering', () => {
  const book = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
    id,
    volumeInfo: { title, industryIdentifiers: ISBN, ...extra },
  });

  test('drops volumes with no ISBN — journals, reports, proceedings', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
      items: [
        book('real', 'The Name of the Wind'),
        { id: 'journal', volumeInfo: { title: 'Proceedings of the British Academy' } },
        { id: 'report', volumeInfo: { title: 'Merchant Vessels', industryIdentifiers: [{ type: 'OTHER', identifier: 'UOM:39015' }] } },
      ],
    });

    const results = await new GoogleBooksProvider('book').search('the name of the wind');
    expect(results.map((r) => r.id)).toEqual(['real']);
  });

  test('drops summaries, study guides and book-club kits of the real book', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
      items: [
        book('real', 'Project Hail Mary'),
        book('s1', 'Summary and Analysis of Project Hail Mary'),
        book('s2', 'SUMMARY and REVIEW'),
        book('s3', 'Study Guide: Project Hail Mary'),
        book('s4', 'Book Club Kit'),
      ],
    });

    const results = await new GoogleBooksProvider('book').search('project hail mary');
    expect(results.map((r) => r.id)).toEqual(['real']);
  });

  test('lists results with a cover and an author ahead of bare records', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
      items: [
        book('bare', 'Dune'),
        book('full', 'Dune Messiah', { authors: ['Frank Herbert'], imageLinks: { thumbnail: 'https://x/t.jpg' } }),
        book('author-only', 'Dune: House Atreides', { authors: ['Brian Herbert'] }),
      ],
    });

    const results = await new GoogleBooksProvider('book').search('dune');
    expect(results.map((r) => r.id)).toEqual(['full', 'author-only', 'bare']);
  });

  test('collapses the same title by the same author to one result', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    mockFetchOnce({
      items: [
        book('a', 'The Name of the Wind', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/a.jpg' } }),
        book('b', 'The Name of the Wind', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/b.jpg' } }),
        book('c', 'The Wise Man’s Fear', { authors: ['Patrick Rothfuss'], imageLinks: { thumbnail: 'https://x/c.jpg' } }),
      ],
    });

    const results = await new GoogleBooksProvider('book').search('rothfuss');
    expect(results.map((r) => r.id)).toEqual(['a', 'c']);
  });

  test('falls back to a plain query when nothing matches by title', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [book('x', 'Dune')] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const results = await new GoogleBooksProvider('book').search('frank herbert');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![0] as string).toContain(`q=${encodeURIComponent('frank herbert')}`);
    expect(results.map((r) => r.id)).toEqual(['x']);
  });

  test('a scanned ISBN is looked up as-is, with no title fallback', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY = 'test-key';
    const fetchMock = mockFetchOnce({ items: [] });

    await new GoogleBooksProvider('book').search('9780143127741');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
