import {
  answer,
  formatScore,
  isPlaced,
  pickOpponent,
  placeInRanking,
  scoreAt,
  scoresFor,
  similarity,
  startRanking,
  type RankedItem,
  type RatingProfile,
  type Sentiment,
} from '@/domain/rating';

function item(key: string, sentiment: Sentiment = 'liked', extra: Partial<RatingProfile> = {}): RankedItem {
  return { key, sentiment, creator: null, genres: [], releaseYear: null, ...extra };
}

const blank = (key: string): RatingProfile => ({ key, creator: null, genres: [], releaseYear: null });

/** Rank `candidate` against `ranking` with a fixed true order of keys. */
function rankWithOracle(candidate: RatingProfile, sentiment: Sentiment, ranking: RankedItem[], truth: string[]) {
  let session = startRanking(candidate, sentiment, ranking);
  while (!isPlaced(session)) {
    const opponent = session.bucket[session.opponent!]!;
    session = answer(session, truth.indexOf(candidate.key) < truth.indexOf(opponent.key) ? 'candidate' : 'opponent');
  }
  return session;
}

describe('scores', () => {
  test('one track sits mid-band; two split it evenly', () => {
    expect(scoreAt('liked', 0, 1)).toBe(8.5);
    expect(scoreAt('fine', 0, 1)).toBe(5.5);
    expect(scoreAt('disliked', 0, 1)).toBe(2.5);
    expect([scoreAt('liked', 0, 2), scoreAt('liked', 1, 2)]).toEqual([9.3, 7.8]);
  });

  test('every score stays inside 1–10 and inside its own band', () => {
    for (const size of [1, 2, 7, 50, 400]) {
      for (let i = 0; i < size; i += 1) {
        expect(scoreAt('liked', i, size)).toBeGreaterThanOrEqual(7);
        expect(scoreAt('liked', i, size)).toBeLessThanOrEqual(10);
        expect(scoreAt('fine', i, size)).toBeGreaterThanOrEqual(4);
        expect(scoreAt('fine', i, size)).toBeLessThanOrEqual(7);
        expect(scoreAt('disliked', i, size)).toBeGreaterThanOrEqual(1);
        expect(scoreAt('disliked', i, size)).toBeLessThanOrEqual(4);
      }
    }
  });

  test('scoresFor never lets a lower-ranked track outscore a higher one', () => {
    const ranking = [item('a'), item('b'), item('c', 'fine'), item('d', 'fine'), item('e', 'disliked')];
    const scores = [...scoresFor(ranking).values()];
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(scoresFor(ranking).get('a')).toBe(9.3);
  });

  test('formatScore always shows one decimal', () => {
    expect(formatScore(9)).toBe('9.0');
    expect(formatScore(8.46)).toBe('8.5');
  });
});

describe('similarity', () => {
  test('a shared creator outweighs any number of shared genres', () => {
    const dune = { key: 'a', creator: 'Frank Herbert', genres: ['Science Fiction'], releaseYear: '1965' };
    const messiah = { key: 'b', creator: 'Frank Herbert', genres: [], releaseYear: '1969' };
    const foundation = { key: 'c', creator: 'Isaac Asimov', genres: ['Science Fiction', 'Space Opera', 'Classics'], releaseYear: '1951' };
    expect(similarity(dune, messiah)).toBeGreaterThan(similarity(dune, foundation));
  });

  test('co-authors and case differences still count as the same person', () => {
    const a = { ...blank('a'), creator: 'Brian Herbert & Kevin J. Anderson' };
    const b = { ...blank('b'), creator: 'kevin j. anderson' };
    expect(similarity(a, b)).toBeGreaterThanOrEqual(4);
  });

  test('genres count case-insensitively, capped at three', () => {
    const a = { ...blank('a'), genres: ['Drama', 'Crime', 'Thriller', 'Mystery'] };
    const b = { ...blank('b'), genres: ['drama', 'crime', 'thriller', 'mystery'] };
    expect(similarity(a, b)).toBe(3);
  });

  test('hand-typed tracks with no metadata are equally (dis)similar', () => {
    expect(similarity(blank('a'), blank('b'))).toBe(0);
  });
});

describe('ranking session', () => {
  test('the first track of a sentiment is placed with no questions', () => {
    const session = startRanking(blank('new'), 'fine', [item('a', 'liked')]);
    expect(isPlaced(session)).toBe(true);
    expect(session.lo).toBe(0);
  });

  test('finds the true position for every slot, with ~log2(n) questions on plain tracks', () => {
    const keys = Array.from({ length: 16 }, (_, i) => `t${i}`);
    for (let slot = 0; slot <= keys.length; slot += 1) {
      const truth = [...keys.slice(0, slot), 'new', ...keys.slice(slot)];
      const session = rankWithOracle(blank('new'), 'liked', keys.map((k) => item(k)), truth);
      expect(session.lo).toBe(slot);
      expect(session.comparisons).toBeLessThanOrEqual(5);
    }
  });

  test('still finds the true position when similarity steers the opponent choice', () => {
    const keys = Array.from({ length: 30 }, (_, i) => `t${i}`);
    const ranking = keys.map((k, i) =>
      item(k, 'liked', { creator: i % 7 === 0 ? 'Denis Villeneuve' : `Director ${i}`, genres: i % 3 === 0 ? ['Science Fiction'] : ['Drama'] }),
    );
    const candidate = { key: 'new', creator: 'Denis Villeneuve', genres: ['Science Fiction'], releaseYear: '2021' };
    for (let slot = 0; slot <= keys.length; slot += 1) {
      const truth = [...keys.slice(0, slot), 'new', ...keys.slice(slot)];
      const session = rankWithOracle(candidate, 'liked', ranking, truth);
      expect(session.lo).toBe(slot);
      expect(session.comparisons).toBeLessThanOrEqual(12);
    }
  });

  test('the first question is the most similar track near the middle, not just the midpoint', () => {
    const ranking = [
      item('a'),
      item('b'),
      item('c', 'liked', { creator: 'Ursula K. Le Guin' }),
      item('d'),
      item('e'),
      item('f'),
      item('g'),
      item('h'),
    ];
    const candidate = { ...blank('new'), creator: 'Ursula K. Le Guin' };
    // Midpoint is index 4; the window [2, 5] contains the Le Guin book at 2.
    expect(pickOpponent(ranking, 0, 8, candidate)).toBe(2);
    expect(pickOpponent(ranking, 0, 8, blank('new'))).toBe(4);
  });

  test('a similar track outside the middle half is not picked — the search must keep shrinking', () => {
    const ranking = [item('a', 'liked', { creator: 'X' }), ...'bcdefgh'.split('').map((k) => item(k))];
    expect(pickOpponent(ranking, 0, 8, { ...blank('new'), creator: 'X' })).toBe(4);
  });

  test('only tracks of the same sentiment are compared', () => {
    const session = startRanking(blank('new'), 'fine', [item('a', 'liked'), item('b', 'fine'), item('c', 'disliked')]);
    expect(session.bucket.map((i) => i.key)).toEqual(['b']);
  });

  test('re-ranking leaves the track’s own old rating out of the comparison', () => {
    const session = startRanking(blank('a'), 'liked', [item('a'), item('b')]);
    expect(session.bucket.map((i) => i.key)).toEqual(['b']);
  });

  test('"too tough" places the track just below the opponent and ends the session', () => {
    const ranking = ['a', 'b', 'c', 'd', 'e'].map((k) => item(k));
    const first = startRanking(blank('new'), 'liked', ranking);
    const tied = answer(first, 'tie');
    expect(isPlaced(tied)).toBe(true);
    expect(tied.lo).toBe(first.opponent! + 1);
  });
});

describe('placeInRanking', () => {
  test('inserts within the sentiment’s own bucket, keeping buckets in order', () => {
    const ranking = [item('a'), item('b'), item('c', 'fine'), item('d', 'disliked')];
    expect(placeInRanking(ranking, 'new', 'fine', 0).map((i) => i.key)).toEqual(['a', 'b', 'new', 'c', 'd']);
    expect(placeInRanking(ranking, 'new', 'disliked', 1).map((i) => i.key)).toEqual(['a', 'b', 'c', 'd', 'new']);
  });

  test('a re-ranked track moves rather than duplicating', () => {
    const ranking = [item('a'), item('b'), item('c')];
    expect(placeInRanking(ranking, 'a', 'disliked', 0).map((i) => i.key)).toEqual(['b', 'c', 'a']);
  });

  test('an out-of-range index is clamped into the bucket', () => {
    expect(placeInRanking([item('a')], 'new', 'liked', 9).map((i) => i.key)).toEqual(['a', 'new']);
  });
});
