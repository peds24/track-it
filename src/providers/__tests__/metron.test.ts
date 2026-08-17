import { MetronProvider } from '@/providers/metron';

function mockFetchSequence(...responses: { body: unknown; ok?: boolean }[]): jest.Mock {
  const fn = jest.fn();
  for (const { body, ok = true } of responses) {
    fn.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ORIGINAL_USER = process.env.EXPO_PUBLIC_METRON_USERNAME;
const ORIGINAL_PASS = process.env.EXPO_PUBLIC_METRON_PASSWORD;

afterEach(() => {
  process.env.EXPO_PUBLIC_METRON_USERNAME = ORIGINAL_USER;
  process.env.EXPO_PUBLIC_METRON_PASSWORD = ORIGINAL_PASS;
  jest.restoreAllMocks();
});

function setCreds() {
  process.env.EXPO_PUBLIC_METRON_USERNAME = 'user';
  process.env.EXPO_PUBLIC_METRON_PASSWORD = 'pass';
}

test('requests carry a Basic auth header built from the configured credentials', async () => {
  setCreds();
  const fetchMock = mockFetchSequence({ body: { results: [] } });

  await new MetronProvider().search('saga');

  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  const headers = init.headers as Record<string, string>;
  // Known vector: base64("user:pass") === "dXNlcjpwYXNz".
  expect(headers.Authorization).toBe('Basic dXNlcjpwYXNz');
});

test('search queries the issue endpoint by series_name, per the current Metron API README', async () => {
  setCreds();
  const fetchMock = mockFetchSequence({ body: { results: [] } });

  await new MetronProvider().search('Saga');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/issue/?series_name=Saga');
});

test('search fails clearly when credentials are not configured', async () => {
  delete process.env.EXPO_PUBLIC_METRON_USERNAME;
  delete process.env.EXPO_PUBLIC_METRON_PASSWORD;
  await expect(new MetronProvider().search('saga')).rejects.toThrow(
    /EXPO_PUBLIC_METRON_USERNAME/,
  );
});

test('search on a blank query never calls the network', async () => {
  setCreds();
  const fetchMock = mockFetchSequence({ body: { results: [] } });
  await new MetronProvider().search('   ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('search maps issue results to SearchResult, tagged comic', async () => {
  setCreds();
  mockFetchSequence({
    body: { results: [{ id: 50, issue: 'Saga (2012) #1', series: { id: 15, name: 'Saga' } }] },
  });

  const results = await new MetronProvider().search('Saga');
  expect(results).toEqual([{ id: '50', title: 'Saga (2012) #1', category: 'comic', count: 1 }]);
});

describe('searchByUpc', () => {
  test('with an EAN-5 supplied, concatenates it onto the UPC-A for an exact upc match', async () => {
    setCreds();
    const fetchMock = mockFetchSequence({ body: { results: [] } });

    await new MetronProvider().searchByUpc('759606095582', '00111');

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/issue/?upc=75960609558200111');
    expect(url).not.toContain('upc_starts_with');
  });

  test('with the EAN-5 skipped, falls back to a upc_starts_with prefix match', async () => {
    setCreds();
    const fetchMock = mockFetchSequence({ body: { results: [] } });

    await new MetronProvider().searchByUpc('759606095582');

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/issue/?upc_starts_with=759606095582');
    expect(url).not.toContain('upc=');
  });

  test('an empty-string EAN-5 is treated the same as skipped', async () => {
    setCreds();
    const fetchMock = mockFetchSequence({ body: { results: [] } });

    await new MetronProvider().searchByUpc('759606095582', '');

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('upc_starts_with=759606095582');
  });
});

test('hydrate for a real match fetches the issue then its series for a real issue_count', async () => {
  setCreds();
  const fetchMock = mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: 2024 } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 1, // ignored in favour of the series' real issue_count
  });

  expect(draft.title).toBe('Saga'); // the series' name, not the matched issue's own title
  expect(draft.entries).toHaveLength(66);
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Issue 1' });
  expect(draft.externalSource).toBe('metron');
  expect(draft.externalId).toBe('50');
  expect(draft.ongoing).toBe(false);

  expect(fetchMock.mock.calls[0]![0]).toContain('/issue/50/');
  expect(fetchMock.mock.calls[1]![0]).toContain('/series/15/');
});

test('hydrate falls back to the given count when the series has no issue_count', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { year_end: 2020 } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 3,
  });

  expect(draft.entries).toHaveLength(3);
});

test('hydrate reads a null year_end as still-running — ongoing overrides issue_count', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: null } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 1,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toHaveLength(1);
});

test('hydrate reads a real year_end as completed', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: 2024 } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 1,
  });

  expect(draft.ongoing).toBe(false);
  expect(draft.entries).toHaveLength(66);
});

test('hydrate for an unmatched (hand-typed) title never calls the network', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const draft = await new MetronProvider().hydrate({
    id: 'metron', // the sentinel addTrack.ts uses for an unmatched title
    title: 'Saga',
    category: 'comic',
    count: 5,
  });

  expect(draft.entries).toHaveLength(5);
  expect(draft.externalSource).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

// A17: the confirm screen's meta line/blurb — the same series lookup
// hydrate already makes for issue_count/year_end, no second fetch.
describe('hydrate metaLine/blurb (A17)', () => {
  test('a completed series gets a closed year range and "Completed"', async () => {
    setCreds();
    mockFetchSequence(
      { body: { id: 50, series: { id: 15, name: 'Saga' } } },
      {
        body: {
          issue_count: 66,
          year_begin: 2012,
          year_end: 2024,
          publisher: { name: 'Image Comics' },
          desc: 'Romeo and Juliet meets Star Wars meets Game of Thrones.',
        },
      },
    );

    const draft = await new MetronProvider().hydrate({
      id: '50',
      title: 'Saga (2012) #1',
      category: 'comic',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['Image Comics', '2012–2024', '66 issues', 'Completed']);
    expect(draft.blurb).toBe('Romeo and Juliet meets Star Wars meets Game of Thrones.');
  });

  test('an ongoing series gets an open year range and "Ongoing"', async () => {
    setCreds();
    mockFetchSequence(
      { body: { id: 50, series: { id: 15, name: 'Saga' } } },
      {
        body: {
          issue_count: 72,
          year_begin: 2012,
          year_end: null,
          publisher: { name: 'Image Comics' },
        },
      },
    );

    const draft = await new MetronProvider().hydrate({
      id: '50',
      title: 'Saga (2012) #1',
      category: 'comic',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['Image Comics', '2012–present', '72 issues', 'Ongoing']);
    expect(draft.blurb).toBeNull();
  });

  test('missing publisher/desc are simply omitted, not blank entries', async () => {
    setCreds();
    mockFetchSequence(
      { body: { id: 50, series: { id: 15, name: 'Saga' } } },
      { body: { issue_count: 66, year_end: 2024 } },
    );

    const draft = await new MetronProvider().hydrate({
      id: '50',
      title: 'Saga (2012) #1',
      category: 'comic',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['66 issues', 'Completed']);
    expect(draft.blurb).toBeNull();
  });
});
