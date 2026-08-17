import { AnilistProvider } from '@/providers/anilist';

function mockFetchSequence(...responses: { body: unknown; ok?: boolean }[]): jest.Mock {
  const fn = jest.fn();
  for (const { body, ok = true } of responses) {
    fn.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('search posts a GraphQL query and maps hits to SearchResult, tagged manga', async () => {
  const fetchMock = mockFetchSequence({
    body: { data: { Page: { media: [{ id: 30001, title: { romaji: 'MONSTER', english: 'Monster' } } ] } } },
  });

  const results = await new AnilistProvider().search('Monster');

  expect(results).toEqual([{ id: '30001', title: 'Monster', category: 'manga', count: 1 }]);
  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  expect(init.method).toBe('POST');
  const parsedBody = JSON.parse(init.body as string) as { variables: { search: string } };
  expect(parsedBody.variables.search).toBe('Monster');
});

test('search falls back to the romaji title when there is no english one', async () => {
  mockFetchSequence({
    body: { data: { Page: { media: [{ id: 1, title: { romaji: 'Only Romaji' } }] } } },
  });
  const results = await new AnilistProvider().search('x');
  expect(results[0]!.title).toBe('Only Romaji');
});

test('search on a blank query never calls the network', async () => {
  const fetchMock = mockFetchSequence({ body: {} });
  await new AnilistProvider().search('   ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate for a real match reads volumes and a FINISHED status as completed', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: 18, chapters: 162, status: 'FINISHED' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '30001',
    title: 'Monster',
    category: 'manga',
    count: 1, // the user's guess — must be discarded in favour of the real total
  });

  expect(draft.entries).toHaveLength(18);
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Volume 1' });
  expect(draft.ongoing).toBe(false);
  expect(draft.externalSource).toBe('anilist');
  expect(draft.externalId).toBe('30001');
});

test('hydrate falls back to chapters when a manga has no separate volume count', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: null, chapters: 42, status: 'FINISHED' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '1',
    title: 'One-shot-ish',
    category: 'manga',
    count: 1,
  });

  expect(draft.entries).toHaveLength(42);
});

test('hydrate reads RELEASING as ongoing, ignoring whatever count came back', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: 12, chapters: 100, status: 'RELEASING' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '2',
    title: 'One Piece',
    category: 'manga',
    count: 1,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Volume 1' }]);
});

test('hydrate for an unmatched (hand-typed) title never calls the network', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const draft = await new AnilistProvider().hydrate({
    id: 'anilist', // the sentinel addTrack.ts uses for an unmatched title
    title: 'Some Manga',
    category: 'manga',
    count: 5,
  });

  expect(draft.entries).toHaveLength(5);
  expect(draft.externalSource).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

// A17: the confirm screen's meta line/blurb — same Media lookup hydrate
// already makes, no second fetch.
describe('hydrate metaLine/blurb (A17)', () => {
  test('a finished manga gets a closed year range, a volume count, and "Completed"', async () => {
    mockFetchSequence({
      body: {
        data: {
          Media: {
            volumes: 18,
            chapters: 162,
            status: 'FINISHED',
            description: 'Dr. Tenma sets out on a journey.<br><br>Years later...',
            startDate: { year: 1994 },
            endDate: { year: 2001 },
          },
        },
      },
    });

    const draft = await new AnilistProvider().hydrate({
      id: '30001',
      title: 'Monster',
      category: 'manga',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['1994–2001', '18 volumes', 'Completed']);
    // The <br><br> pair collapses to real newlines, not literal markup.
    expect(draft.blurb).toBe('Dr. Tenma sets out on a journey.\n\nYears later...');
  });

  test('an ongoing manga gets an open year range and "Ongoing"', async () => {
    mockFetchSequence({
      body: {
        data: {
          Media: { volumes: 12, status: 'RELEASING', startDate: { year: 2018 } },
        },
      },
    });

    const draft = await new AnilistProvider().hydrate({
      id: '2',
      title: 'One Piece',
      category: 'manga',
      count: 1,
    });

    // Ongoing still shows the current volume count, matching how a still-
    // running show's episode count is shown too (A17) -- "Ongoing" says
    // it isn't final, not that there's nothing to show yet.
    expect(draft.metaLine).toEqual(['2018–present', '12 volumes', 'Ongoing']);
    expect(draft.blurb).toBeNull();
  });

  test('falls back to a chapter-labelled count when there is no volume count', async () => {
    mockFetchSequence({
      body: { data: { Media: { chapters: 42, status: 'FINISHED' } } },
    });

    const draft = await new AnilistProvider().hydrate({
      id: '1',
      title: 'One-shot-ish',
      category: 'manga',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['42 chapters', 'Completed']);
  });
});
