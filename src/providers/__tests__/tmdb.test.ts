import { sumEpisodeCount, TmdbProvider } from '@/providers/tmdb';

function mockFetchSequence(...responses: { body: unknown; ok?: boolean }[]): jest.Mock {
  const fn = jest.fn();
  for (const { body, ok = true } of responses) {
    fn.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;

afterEach(() => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = ORIGINAL_KEY;
  jest.restoreAllMocks();
});

describe('sumEpisodeCount', () => {
  test('sums episode_count across seasons, excluding season 0 (specials)', () => {
    const total = sumEpisodeCount([
      { season_number: 0, episode_count: 5 },
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 8 },
    ]);
    expect(total).toBe(18);
  });

  test('treats a missing episode_count as zero rather than throwing', () => {
    expect(sumEpisodeCount([{ season_number: 1 }])).toBe(0);
  });

  test('an empty season list sums to zero', () => {
    expect(sumEpisodeCount([])).toBe(0);
  });
});

test('search hits the tv endpoint and reads `name` for a show', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({ body: { results: [{ id: 1, name: 'Severance' }] } });

  const results = await new TmdbProvider('show').search('Severance');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/search/tv');
  expect(url).toContain('api_key=test-key');
  expect(results).toEqual([{ id: '1', title: 'Severance', category: 'show', count: 1 }]);
});

test('search hits the movie endpoint and reads `title` for a movie', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({ body: { results: [{ id: 2, title: 'Arrival' }] } });

  const results = await new TmdbProvider('movie').search('Arrival');

  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/search/movie');
  expect(results).toEqual([{ id: '2', title: 'Arrival', category: 'movie', count: 1 }]);
});

test('search fails clearly when the API key is missing', async () => {
  delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  await expect(new TmdbProvider('show').search('Severance')).rejects.toThrow(
    /EXPO_PUBLIC_TMDB_API_KEY/,
  );
});

test('search on a blank query never calls the network', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({ body: { results: [] } });
  await new TmdbProvider('show').search('  ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate for a real show match fetches seasons and replaces the guessed count', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({
    body: {
      seasons: [
        { season_number: 0, episode_count: 1 },
        { season_number: 1, episode_count: 9 },
      ],
    },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: 2, // the user's guess — must be discarded in favour of the real total
  });

  expect(draft.entries).toHaveLength(9);
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Episode 1' });
  expect(draft.externalSource).toBe('tmdb');
  expect(draft.externalId).toBe('111');
  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/tv/111');
});

test('hydrate for an ongoing show does not override the ongoing behaviour with a season fetch', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: Number.NaN,
    ongoing: true,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Episode 1' }]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate for an unmatched (hand-typed) title never calls the network', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const draft = await new TmdbProvider('show').hydrate({
    id: 'tmdb', // the sentinel addTrack.ts uses for an unmatched title
    title: 'Severance',
    category: 'show',
    count: 4,
  });

  expect(draft.entries).toHaveLength(4);
  expect(draft.externalSource).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate falls back to the guessed count when the season fetch fails', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  mockFetchSequence({ body: {}, ok: false });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: 3,
  });

  expect(draft.entries).toHaveLength(3);
  // Still a real match, so still worth recording where it came from — only
  // the count fell back, not the whole hydrate.
  expect(draft.externalSource).toBe('tmdb');
});
