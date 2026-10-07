import type { FakeResponse, ProviderCase, ProviderName } from '../types';

// Extracted from src/providers/__tests__/tmdb.test.ts. `ok: false` mocks are
// `{ status: 500 }`; tests that set no key run with an empty env.
const KEY = { TMDB_API_KEY: 'test-key' };
const ok = (body: unknown): FakeResponse => ({ body });
const fail: FakeResponse = { status: 500, body: {} };
const show = (id: string, title: string, count: number) => ({ id, title, category: 'show', count });
const movie = (id: string, title: string) => ({ id, title, category: 'movie', count: 1 });
const at = (
  name: string,
  provider: ProviderName,
  call: string,
  args: unknown[],
  responses: FakeResponse[] = [],
  env: Record<string, string> = KEY,
): ProviderCase => ({ name, provider, env, call, args, responses });

export const cases: ProviderCase[] = [
  { name: 'sums episode_count across seasons, excluding season 0 (specials)', call: 'sumEpisodeCount', args: [[{ season_number: 0, episode_count: 5 }, { season_number: 1, episode_count: 10 }, { season_number: 2, episode_count: 8 }]] },
  { name: 'treats a missing episode_count as zero rather than throwing', call: 'sumEpisodeCount', args: [[{ season_number: 1 }]] },
  { name: 'an empty season list sums to zero', call: 'sumEpisodeCount', args: [[]] },
  at('search hits the tv endpoint and reads `name` for a show', 'tmdb-show', 'search', ['Severance'], [ok({ results: [{ id: 1, name: 'Severance' }] })]),
  at('search hits the movie endpoint and reads `title` for a movie', 'tmdb-movie', 'search', ['Arrival'], [ok({ results: [{ id: 2, title: 'Arrival' }] })]),
  at('search fails clearly when the API key is missing', 'tmdb-show', 'search', ['Severance'], [], {}),
  at('search on a blank query never calls the network', 'tmdb-show', 'search', ['  '], [ok({ results: [] })]),
  at('hydrate for a real, ended show fetches the season breakdown and a real episode total', 'tmdb-show', 'hydrate', [show('111', 'Severance', 2)], [
    ok({ status: 'Ended', seasons: [{ season_number: 0, episode_count: 1 }, { season_number: 1, episode_count: 9 }] }),
  ]),
  at('hydrate for a real, still-running show sets ongoing from TMDB status, not a guess', 'tmdb-show', 'hydrate', [show('111', 'Severance', 2)], [
    ok({ status: 'Returning Series', seasons: [{ season_number: 1, episode_count: 9 }] }),
  ]),
  at('"Canceled" counts as ended, the same as "Ended"', 'tmdb-show', 'hydrate', [show('111', 'Firefly', 1)], [
    ok({ status: 'Canceled', seasons: [{ season_number: 1, episode_count: 4 }] }),
  ]),
  at('hydrate for an unmatched (hand-typed) title never calls the network', 'tmdb-show', 'hydrate', [show('tmdb', 'Severance', 4)], [], {}),
  at('hydrate falls back to the guessed count when the season fetch fails', 'tmdb-show', 'hydrate', [show('111', 'Severance', 3)], [fail]),
  at('hydrate metaLine/blurb (A17): an ended show gets a closed year range and its real status word', 'tmdb-show', 'hydrate', [show('1408', 'House', 1)], [
    ok({
      status: 'Ended',
      overview: 'A drug-addicted, unconventional medical genius.',
      first_air_date: '2004-11-16',
      last_air_date: '2012-05-21',
      seasons: [{ season_number: 0, episode_count: 46 }, { season_number: 1, episode_count: 22 }, { season_number: 2, episode_count: 24 }],
    }),
  ]),
  at('hydrate metaLine/blurb (A17): a still-running show gets an open year range and "Ongoing"', 'tmdb-show', 'hydrate', [show('95396', 'Severance', 1)], [
    ok({ status: 'Returning Series', overview: 'Severed memories, divided lives.', first_air_date: '2022-02-18', seasons: [{ season_number: 1, episode_count: 9 }] }),
  ]),
  at('hydrate metaLine/blurb (A17): a failed detail fetch leaves metaLine/blurb unset, same as seasons', 'tmdb-show', 'hydrate', [show('111', 'Severance', 3)], [fail]),
  at('preview (A17, movie only): fetches the movie detail and returns a year and the overview as blurb', 'tmdb-movie', 'preview', [movie('273481', 'Sicario')], [
    ok({ release_date: '2015-09-17', overview: 'An FBI agent joins the war on drugs.' }),
  ]),
  at('preview (A17, movie only): falls back to just the title when the fetch fails, never throws', 'tmdb-movie', 'preview', [movie('273481', 'Sicario')], [fail]),
  at('preview (A17, movie only): falls back to just the title when no API key is configured', 'tmdb-movie', 'preview', [movie('273481', 'Sicario')], [], {}),
  at('A22/A24 metadata: movie search hits carry year and a small poster', 'tmdb-movie', 'search', ['Dune'], [
    ok({ results: [{ id: 1, title: 'Dune', release_date: '2021-09-15', poster_path: '/p.jpg' }] }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: show search hits take their year from first_air_date', 'tmdb-show', 'search', ['Severance'], [
    ok({ results: [{ id: 2, name: 'Severance', first_air_date: '2022-02-18' }] }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: movie details asks for credits and names the director', 'tmdb-movie', 'details', ['1'], [
    ok({
      overview: 'Spice.',
      release_date: '2021-09-15',
      poster_path: '/p.jpg',
      credits: { crew: [{ job: 'Producer', name: 'X' }, { job: 'Director', name: 'Denis Villeneuve' }] },
    }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: show details names the creators', 'tmdb-show', 'details', ['2'], [
    ok({
      overview: 'Work.',
      first_air_date: '2022-02-18',
      status: 'Returning Series',
      poster_path: '/s.jpg',
      created_by: [{ name: 'Dan Erickson' }],
      seasons: [{ season_number: 1, episode_count: 9 }],
    }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: a matched show hydrate carries the same metadata', 'tmdb-show', 'hydrate', [show('2', 'Severance', 1)], [
    ok({ overview: 'Work.', first_air_date: '2022-02-18', poster_path: '/s.jpg', created_by: [{ name: 'Dan Erickson' }], seasons: [] }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: A26: movie and show details carry TMDB genres', 'tmdb-movie', 'details', ['1'], [
    ok({ genres: [{ id: 878, name: 'Science Fiction' }, { id: 12, name: 'Adventure' }] }),
  ], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: A26: movie and show details carry TMDB genres (2)', 'tmdb-show', 'details', ['2'], [ok({ genres: [{ id: 18, name: 'Drama' }], seasons: [] })], { TMDB_API_KEY: 'k' }),
  at('A22/A24 metadata: details returns null on a failed lookup', 'tmdb-movie', 'details', ['1'], [fail], { TMDB_API_KEY: 'k' }),

  // --- Iris parity (Review Focus 1, 2, 4) ---
  at('Iris parity: search encodes the query and key like encodeURIComponent', 'tmdb-movie', 'search', ["  Spirited Away & Co. — Ça va? (It's) 100%  "], [ok({ results: [] })], {
    TMDB_API_KEY: 'a+b/c=d e',
  }),
  at('Iris parity: search on a network error throws', 'tmdb-show', 'search', ['Severance'], [{ networkError: true }]),
  at('Iris parity: search on a 500 throws with the status', 'tmdb-show', 'search', ['Severance'], [fail]),
  at('Iris parity: show details on a network error is null', 'tmdb-show', 'details', ['2'], [{ networkError: true }]),
  at('Iris parity: movie preview on a network error falls back', 'tmdb-movie', 'preview', [movie('1', 'Dune')], [{ networkError: true }]),
  at('Iris parity: hydrate on a network error falls back to the guess', 'tmdb-show', 'hydrate', [show('111', 'Severance', 3)], [{ networkError: true }]),
  at('Iris parity: loose JSON — non-string titles are skipped, a null results list is empty', 'tmdb-show', 'search', ['x'], [
    ok({ results: [{ id: 1, name: 7 }, { id: 2.5, name: 'Two', extra: true, first_air_date: null, poster_path: null }, { name: 'No id' }] }),
  ]),
  at('Iris parity: loose JSON — results null', 'tmdb-movie', 'search', ['x'], [ok({ results: null })]),
  at('Iris parity: a single season and episode, a show ending in its start year', 'tmdb-show', 'hydrate', [show('9', 'Mini', 1)], [
    ok({ status: 'Ended', first_air_date: '2020-01-01', last_air_date: '2020-03-01', seasons: [{ season_number: 1, episode_count: 1 }] }),
  ]),
  at('Iris parity: a show with no seasons keeps the guessed count and no season list', 'tmdb-show', 'hydrate', [show('9', 'Unknown', 2)], [
    ok({ status: 'In Production', seasons: [] }),
  ]),
];
