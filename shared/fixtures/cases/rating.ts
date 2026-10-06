import { answer, isPlaced, startRanking, type Answer, type RankedItem, type RatingProfile, type Sentiment } from '@/domain/rating';
import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/rating.test.ts.

function item(key: string, sentiment: Sentiment = 'liked', extra: Partial<RatingProfile> = {}): RankedItem {
  return { key, sentiment, creator: null, genres: [], releaseYear: null, ...extra };
}
const blank = (key: string): RatingProfile => ({ key, creator: null, genres: [], releaseYear: null });
const c = (name: string, fn: string, ...args: unknown[]): FixtureCase => ({ name, fn, args });

/**
 * The answers an oracle that knows the true slot would give. Computed with
 * the TS session only to *author* the input; the recorded vector then holds
 * Swift to the same opponent order and landing slot.
 */
function oracleAnswers(candidate: RatingProfile, sentiment: Sentiment, ranking: RankedItem[], truth: string[]): Answer[] {
  const answers: Answer[] = [];
  let session = startRanking(candidate, sentiment, ranking);
  while (!isPlaced(session)) {
    const opponent = session.bucket[session.opponent!]!;
    const choice: Answer = truth.indexOf(candidate.key) < truth.indexOf(opponent.key) ? 'candidate' : 'opponent';
    answers.push(choice);
    session = answer(session, choice);
  }
  return answers;
}

function slotScenarios(label: string, candidate: RatingProfile, ranking: RankedItem[]): FixtureCase[] {
  const keys = ranking.map((r) => r.key);
  return Array.from({ length: keys.length + 1 }, (_, slot) => {
    const truth = [...keys.slice(0, slot), candidate.key, ...keys.slice(slot)];
    return c(`${label}: slot ${slot}`, 'rankingScenario', candidate, 'liked', ranking, oracleAnswers(candidate, 'liked', ranking, truth));
  });
}

const plain = Array.from({ length: 16 }, (_, i) => item(`t${i}`));
const steered = Array.from({ length: 30 }, (_, i) =>
  item(`t${i}`, 'liked', { creator: i % 7 === 0 ? 'Denis Villeneuve' : `Director ${i}`, genres: i % 3 === 0 ? ['Science Fiction'] : ['Drama'] }),
);
const villeneuve = { key: 'new', creator: 'Denis Villeneuve', genres: ['Science Fiction'], releaseYear: '2021' };
const leGuin = [item('a'), item('b'), item('c', 'liked', { creator: 'Ursula K. Le Guin' }), item('d'), item('e'), item('f'), item('g'), item('h')];
const fiveLiked = ['a', 'b', 'c', 'd', 'e'].map((k) => item(k));
const mixed = [item('a'), item('b'), item('c', 'fine'), item('d', 'disliked')];
/** placeInRanking's declared item shape: { key, sentiment } only. */
const ks = (key: string, sentiment: Sentiment = 'liked') => ({ key, sentiment });
const mixedKs = [ks('a'), ks('b'), ks('c', 'fine'), ks('d', 'disliked')];

export const cases: FixtureCase[] = [
  c('scores: one track sits mid-band; two split it evenly', 'scoreAt', 'liked', 0, 1),
  c('scores: one track sits mid-band; two split it evenly (2)', 'scoreAt', 'fine', 0, 1),
  c('scores: one track sits mid-band; two split it evenly (3)', 'scoreAt', 'disliked', 0, 1),
  c('scores: one track sits mid-band; two split it evenly (4)', 'scoreAt', 'liked', 0, 2),
  c('scores: one track sits mid-band; two split it evenly (5)', 'scoreAt', 'liked', 1, 2),
  ...(['liked', 'fine', 'disliked'] as const).flatMap((s) =>
    [[0, 7], [6, 7], [0, 50], [49, 50], [0, 400], [199, 400], [399, 400]].map(([i, n]) =>
      c(`every score stays inside 1–10 and inside its own band: ${s} ${i}/${n}`, 'scoreAt', s, i, n),
    ),
  ),
  c('scoresFor never lets a lower-ranked track outscore a higher one', 'scoresFor', [item('a'), item('b'), item('c', 'fine'), item('d', 'fine'), item('e', 'disliked')]),
  c('scoresFor of an empty ranking', 'scoresFor', []),
  c('formatScore always shows one decimal', 'formatScore', 9),
  c('formatScore always shows one decimal (2)', 'formatScore', 8.46),
  c('formatScore always shows one decimal (3)', 'formatScore', 10),
  c('similarity: a shared creator outweighs any number of shared genres', 'similarity',
    { key: 'a', creator: 'Frank Herbert', genres: ['Science Fiction'], releaseYear: '1965' },
    { key: 'b', creator: 'Frank Herbert', genres: [], releaseYear: '1969' }),
  c('similarity: a shared creator outweighs any number of shared genres (2)', 'similarity',
    { key: 'a', creator: 'Frank Herbert', genres: ['Science Fiction'], releaseYear: '1965' },
    { key: 'c', creator: 'Isaac Asimov', genres: ['Science Fiction', 'Space Opera', 'Classics'], releaseYear: '1951' }),
  c('similarity: co-authors and case differences still count as the same person', 'similarity',
    { ...blank('a'), creator: 'Brian Herbert & Kevin J. Anderson' }, { ...blank('b'), creator: 'kevin j. anderson' }),
  c('similarity: genres count case-insensitively, capped at three', 'similarity',
    { ...blank('a'), genres: ['Drama', 'Crime', 'Thriller', 'Mystery'] }, { ...blank('b'), genres: ['drama', 'crime', 'thriller', 'mystery'] }),
  c('similarity: hand-typed tracks with no metadata are equally (dis)similar', 'similarity', blank('a'), blank('b')),
  c('similarity: release within five years', 'similarity', { ...blank('a'), releaseYear: '2010' }, { ...blank('b'), releaseYear: '2014' }),
  c('ranking session: the first track of a sentiment is placed with no questions', 'startRanking', blank('new'), 'fine', [item('a', 'liked')]),
  ...slotScenarios('finds the true position for every slot, with ~log2(n) questions on plain tracks', blank('new'), plain),
  ...slotScenarios('still finds the true position when similarity steers the opponent choice', villeneuve, steered),
  c('the first question is the most similar track near the middle, not just the midpoint', 'pickOpponent', leGuin, 0, 8, { ...blank('new'), creator: 'Ursula K. Le Guin' }),
  c('the first question is the midpoint when nothing is similar', 'pickOpponent', leGuin, 0, 8, blank('new')),
  c('a similar track outside the middle half is not picked — the search must keep shrinking', 'pickOpponent',
    [item('a', 'liked', { creator: 'X' }), ...'bcdefgh'.split('').map((k) => item(k))], 0, 8, { ...blank('new'), creator: 'X' }),
  c('pickOpponent on an empty window is null', 'pickOpponent', leGuin, 3, 3, blank('new')),
  c('only tracks of the same sentiment are compared', 'startRanking', blank('new'), 'fine', [item('a', 'liked'), item('b', 'fine'), item('c', 'disliked')]),
  c('re-ranking leaves the track’s own old rating out of the comparison', 'startRanking', blank('a'), 'liked', [item('a'), item('b')]),
  c('"too tough" places the track just below the opponent and ends the session', 'rankingScenario', blank('new'), 'liked', fiveLiked, ['tie']),
  c('answer after the session is placed changes nothing', 'answer', startRanking(blank('new'), 'fine', [item('a', 'liked')]), 'candidate'),
  c('a candidate-then-opponent walk', 'rankingScenario', blank('new'), 'liked', fiveLiked, ['candidate', 'opponent', 'opponent']),
  c('placeInRanking inserts within the sentiment’s own bucket, keeping buckets in order', 'placeInRanking', mixedKs, 'new', 'fine', 0),
  c('placeInRanking inserts within the sentiment’s own bucket, keeping buckets in order (2)', 'placeInRanking', mixedKs, 'new', 'disliked', 1),
  c('placeInRanking: a re-ranked track moves rather than duplicating', 'placeInRanking', [ks('a'), ks('b'), ks('c')], 'a', 'disliked', 0),
  c('placeInRanking: an out-of-range index is clamped into the bucket', 'placeInRanking', [ks('a')], 'new', 'liked', 9),
  c('placeInRanking: a negative index is clamped to the top', 'placeInRanking', [ks('a')], 'new', 'liked', -3),
  c('matchupReason names a shared creator in the first track’s own spelling', 'matchupReason',
    { ...blank('a'), creator: 'Frank Herbert, Brian Herbert' }, { ...blank('b'), creator: 'brian herbert' }),
  c('matchupReason otherwise names up to two shared genres', 'matchupReason',
    { ...blank('a'), genres: ['Drama', 'Crime', 'Thriller'] }, { ...blank('b'), genres: ['thriller', 'crime', 'drama'] }),
  c('matchupReason: null when nothing is shared', 'matchupReason', blank('a'), blank('b')),
  ...[8.25, 1.25, 0.25, 2.35, 0.35, 0.15, 0.05, 9.95].map((s) => c(`Swift parity: formatScore rounds the exact binary value, ties up: ${s}`, 'formatScore', s)),
  c('Swift parity: similarity ignores a release year parseInt cannot read', 'similarity', { ...blank('a'), releaseYear: 'c. 1999' }, { ...blank('b'), releaseYear: '1999' }),
  c('Swift parity: similarity reads a release year with leading spaces', 'similarity', { ...blank('a'), releaseYear: ' 1999' }, { ...blank('b'), releaseYear: '1999' }),
];
