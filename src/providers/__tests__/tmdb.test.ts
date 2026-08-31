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

test('hydrate for a real, ended show fetches the season breakdown and a real episode total', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({
    body: {
      status: 'Ended',
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
  expect(draft.ongoing).toBe(false);
  expect(draft.seasons).toEqual([{ number: 1, episodeCount: 9 }]);
  expect(draft.externalSource).toBe('tmdb');
  expect(draft.externalId).toBe('111');
  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/tv/111');
});

test('hydrate for a real, still-running show sets ongoing from TMDB status, not a guess', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  mockFetchSequence({
    body: {
      status: 'Returning Series',
      seasons: [{ season_number: 1, episode_count: 9 }],
    },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: 2,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Episode 1' }]);
});

test('"Canceled" counts as ended, the same as "Ended"', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  mockFetchSequence({
    body: { status: 'Canceled', seasons: [{ season_number: 1, episode_count: 4 }] },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Firefly',
    category: 'show',
    count: 1,
  });

  expect(draft.ongoing).toBe(false);
  expect(draft.entries).toHaveLength(4);
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
  expect(draft.seasons).toBeUndefined();
  // Still a real match, so still worth recording where it came from — only
  // the count fell back, not the whole hydrate.
  expect(draft.externalSource).toBe('tmdb');
});

// A17: the confirm screen's data — no second fetch, the same /tv/{id} call
// hydrate already makes for the season breakdown.
describe('hydrate metaLine/blurb (A17)', () => {
  test('an ended show gets a closed year range and its real status word', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    mockFetchSequence({
      body: {
        status: 'Ended',
        overview: 'A drug-addicted, unconventional medical genius.',
        first_air_date: '2004-11-16',
        last_air_date: '2012-05-21',
        seasons: [
          { season_number: 0, episode_count: 46 },
          { season_number: 1, episode_count: 22 },
          { season_number: 2, episode_count: 24 },
        ],
      },
    });

    const draft = await new TmdbProvider('show').hydrate({
      id: '1408',
      title: 'House',
      category: 'show',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['2004–2012', '2 seasons', '46 episodes', 'Ended']);
    expect(draft.blurb).toBe('A drug-addicted, unconventional medical genius.');
  });

  test('a still-running show gets an open year range and "Ongoing"', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    mockFetchSequence({
      body: {
        status: 'Returning Series',
        overview: 'Severed memories, divided lives.',
        first_air_date: '2022-02-18',
        seasons: [{ season_number: 1, episode_count: 9 }],
      },
    });

    const draft = await new TmdbProvider('show').hydrate({
      id: '95396',
      title: 'Severance',
      category: 'show',
      count: 1,
    });

    expect(draft.metaLine).toEqual(['2022–present', '1 season', '9 episodes', 'Ongoing']);
    expect(draft.blurb).toBe('Severed memories, divided lives.');
  });

  test('a failed detail fetch leaves metaLine/blurb unset, same as seasons', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    mockFetchSequence({ body: {}, ok: false });

    const draft = await new TmdbProvider('show').hydrate({
      id: '111',
      title: 'Severance',
      category: 'show',
      count: 3,
    });

    expect(draft.metaLine).toBeUndefined();
    expect(draft.blurb).toBeUndefined();
  });
});

describe('preview (A17, movie only)', () => {
  test('fetches the movie detail and returns a year and the overview as blurb', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    const fetchMock = mockFetchSequence({
      body: { release_date: '2015-09-17', overview: 'An FBI agent joins the war on drugs.' },
    });

    const preview = await new TmdbProvider('movie').preview({
      id: '273481',
      title: 'Sicario',
      category: 'movie',
      count: 1,
    });

    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/movie/273481');
    expect(preview).toEqual({
      title: 'Sicario',
      metaLine: ['2015'],
      blurb: 'An FBI agent joins the war on drugs.',
    });
  });

  test('falls back to just the title when the fetch fails, never throws', async () => {
    process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
    mockFetchSequence({ body: {}, ok: false });

    const preview = await new TmdbProvider('movie').preview({
      id: '273481',
      title: 'Sicario',
      category: 'movie',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Sicario', metaLine: [], blurb: null });
  });

  test('falls back to just the title when no API key is configured', async () => {
    delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const preview = await new TmdbProvider('movie').preview({
      id: '273481',
      title: 'Sicario',
      category: 'movie',
      count: 1,
    });

    expect(preview).toEqual({ title: 'Sicario', metaLine: [], blurb: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
