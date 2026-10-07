import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/ratingRepo.test.ts. The test's `movie()`
// helper is an addTrack (with a match + metadata when given), and a rated
// track is `{ kind, id, category }`.

const T0 = '2026-10-01T12:00:00.000Z';

const ref = ($ref: number, path?: string) => (path === undefined ? { $ref } : { $ref, path });
const movie = (title: string, meta?: { creator?: string; genres?: string[] }): Step => ({
  call: 'addTrack',
  args: [
    {
      title,
      category: 'movie',
      count: 1,
      ...(meta
        ? {
            match: { id: `tmdb-${title}`, title, category: 'movie', count: 1 },
            metadata: { coverUrl: null, creator: meta.creator ?? null, description: null, releaseYear: '2020', genres: meta.genres },
          }
        : {}),
    },
    T0,
  ],
});
const bookAdd = (title: string): Step => ({ call: 'addTrack', args: [{ title, category: 'book', count: 1 }, T0] });
const rated = (step: number, category = 'movie') => ({ kind: 'entry', id: ref(step, 'id'), category });
const save = (step: number, sentiment: string, index: number, category = 'movie', at = T0): Step => ({
  call: 'saveRating',
  args: [rated(step, category), sentiment, index, at],
});
const track = (step: number) => ({ kind: 'entry', id: ref(step, 'id') });

/** A backup rating an entry that is not in it — what the test makes by editing an export. */
const BROKEN_BACKUP = JSON.stringify({
  version: 1,
  series: [],
  entries: [
    { id: 'm1', seriesId: null, title: 'A', ordinal: null, mediaType: 'movie', status: 'unstarted', startedAt: null, finishedAt: null, createdAt: T0 },
  ],
  ratings: [{ trackKind: 'entry', trackId: 'nope', category: 'movie', sentiment: 'liked', position: 0, ratedAt: T0 }],
});

export const scenarios: Scenario[] = [
  {
    name: 'ratings are ordered within their category and scored from that order',
    steps: [
      movie('Arrival'),
      movie('Dune'),
      movie('Cats'),
      save(0, 'liked', 0),
      save(1, 'liked', 0),
      save(2, 'disliked', 0),
      { call: 'listRanking', args: ['movie'] },
      { call: 'getRating', args: [track(0)] },
    ],
  },
  {
    name: 'categories never mix',
    steps: [
      movie('Arrival'),
      bookAdd('Dune'),
      save(0, 'liked', 0),
      save(1, 'fine', 0, 'book'),
      { call: 'listRanking', args: ['movie'] },
      { call: 'listRanking', args: ['book'] },
      { call: 'getRating', args: [track(0)] },
    ],
  },
  {
    name: 're-rating a track moves it rather than duplicating it',
    steps: [movie('A'), movie('B'), save(0, 'liked', 0), save(1, 'liked', 1), save(0, 'fine', 0), { call: 'listRanking', args: ['movie'] }],
  },
  {
    name: 'deleting a track deletes its rating; removing a rating keeps the track',
    steps: [
      movie('A'),
      movie('B'),
      save(0, 'liked', 0),
      save(1, 'liked', 1),
      { call: 'deleteTrack', args: [track(0)] },
      { call: 'listRanking', args: ['movie'] },
      { call: 'query', args: ['SELECT * FROM rating WHERE track_id = ?', [ref(0, 'id')]] },
      { call: 'removeRating', args: [track(1)] },
      { call: 'getRating', args: [track(1)] },
      { call: 'query', args: ['SELECT id FROM entry WHERE id = ?', [ref(1, 'id')]] },
    ],
  },
  {
    name: 'the rating profile carries creator and genres for matchups',
    steps: [
      movie('Arrival', { creator: 'Denis Villeneuve', genres: ['Science Fiction', 'Drama'] }),
      { call: 'ratingProfileOf', args: [track(0)] },
      { call: 'listRanking', args: ['movie'] },
    ],
  },
  {
    name: 'allScores covers every category',
    steps: [movie('Arrival'), bookAdd('Dune'), save(0, 'liked', 0), save(1, 'disliked', 0, 'book'), { call: 'allScores', args: [] }],
  },
  {
    name: 'ratings survive an export/import round trip, and a backup rating a missing track is rejected',
    steps: [
      movie('A'),
      movie('B'),
      save(0, 'liked', 0),
      save(1, 'liked', 0),
      { call: 'exportLibrary', args: [] },
      { call: 'removeRating', args: [track(0)] },
      { call: 'importLibrary', args: [{ $ref: 4, json: true }] },
      { call: 'listRanking', args: ['movie'] },
      { call: 'importLibrary', args: [BROKEN_BACKUP] },
      { call: 'listRanking', args: ['movie'] },
    ],
  },
  {
    name: 'saveRating rejects a malformed timestamp before writing anything',
    steps: [movie('A'), save(0, 'liked', 0, 'movie', 'yesterday'), { call: 'query', args: ['SELECT * FROM rating'] }],
  },
  {
    name: 'Iris parity: a rated series, covers sharpened on read, and a re-rank into another sentiment',
    steps: [
      {
        call: 'createSeriesTrack',
        args: [
          {
            title: 'Severance',
            mediaType: 'show',
            unitLabel: 'episode',
            entries: [{ ordinal: 1, title: 'Episode 1' }],
            metadata: { coverUrl: 'http://image.tmdb.org/t/p/w342/s.jpg', creator: 'Dan Erickson', description: null, releaseYear: '2022', genres: ['Drama', 'Mystery'] },
          },
          T0,
        ],
      },
      { call: 'addTrack', args: [{ title: 'Lost', category: 'show', count: 2 }, T0] },
      { call: 'saveRating', args: [{ kind: 'series', id: ref(0), category: 'show' }, 'liked', 0, T0] },
      { call: 'saveRating', args: [{ kind: 'series', id: ref(1, 'id'), category: 'show' }, 'liked', 1, T0] },
      { call: 'saveRating', args: [{ kind: 'series', id: ref(0), category: 'show' }, 'disliked', 0, T0] },
      { call: 'listRanking', args: ['show'] },
      { call: 'ratingProfileOf', args: [{ kind: 'series', id: ref(0) }] },
      { call: 'allScores', args: [] },
    ],
  },
];
