/**
 * A26: Beli-style rating. Nobody types a number. You say how you felt —
 * liked it, it was fine, didn't like it — then answer "which did you
 * prefer?" against tracks you've already rated until the new one has a
 * place in the order. The 1–10 score falls out of that place.
 *
 * Rankings are per category: a movie is only ever compared with, ranked
 * among, and scored against other movies (Category, D10).
 *
 * Pure: no I/O. `data/ratingRepo.ts` persists the order this produces.
 */
import type { Category } from '@/domain/types';

export type Sentiment = 'liked' | 'fine' | 'disliked';

/** Best first — the order the buckets sit in within a ranking. */
export const SENTIMENTS: readonly Sentiment[] = ['liked', 'fine', 'disliked'];

/**
 * Each sentiment owns a third of the 1–10 scale, so anything you liked
 * outscores anything that was fine, however the comparisons went. Bands are
 * half-open at the bottom: a score never sits exactly on a boundary.
 */
export const SCORE_BAND: Readonly<Record<Sentiment, { lo: number; hi: number }>> = {
  liked: { lo: 7, hi: 10 },
  fine: { lo: 4, hi: 7 },
  disliked: { lo: 1, hi: 4 },
};

/** What the matchup picker knows about a track. */
export type RatingProfile = {
  key: string;
  creator: string | null;
  genres: readonly string[];
  releaseYear: string | null;
};

/** One rated track, in a category's best-first order. */
export type RankedItem = RatingProfile & { sentiment: Sentiment };

/**
 * The score of the `index`-th (0 = best) of `size` tracks sharing a
 * sentiment. Tracks are spread evenly across the band, each at the middle of
 * its own slice: one liked track scores 8.5, two score 9.3 and 7.8. Adding
 * a track nudges its neighbours rather than throwing the top to 10.0 and the
 * bottom to 7.0, which is what an endpoint-anchored spread did on the second
 * rating.
 */
export function scoreAt(sentiment: Sentiment, index: number, size: number): number {
  const { lo, hi } = SCORE_BAND[sentiment];
  const raw = hi - ((hi - lo) * (index + 0.5)) / size;
  return Math.round(raw * 10) / 10;
}

/** Scores for a whole category ranking, keyed by track. */
export function scoresFor(ranking: readonly { key: string; sentiment: Sentiment }[]): Map<string, number> {
  const sizes = new Map<Sentiment, number>();
  for (const item of ranking) sizes.set(item.sentiment, (sizes.get(item.sentiment) ?? 0) + 1);
  const seen = new Map<Sentiment, number>();
  const scores = new Map<string, number>();
  for (const item of ranking) {
    const index = seen.get(item.sentiment) ?? 0;
    seen.set(item.sentiment, index + 1);
    scores.set(item.key, scoreAt(item.sentiment, index, sizes.get(item.sentiment)!));
  }
  return scores;
}

/** "Frank Herbert, Brian Herbert" / "Lee & Kirby" → individual names. */
function creatorsOf(creator: string | null): Set<string> {
  return new Set(
    (creator ?? '')
      .split(/,|&|\band\b/i)
      .map((name) => name.trim().toLowerCase())
      .filter((name) => name.length > 0),
  );
}

function yearOf(value: string | null): number | null {
  const year = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(year) ? year : null;
}

/**
 * How hard a matchup between two tracks is likely to feel. A shared creator
 * outweighs everything (two Villeneuve films, two Sanderson books); then each
 * shared genre, up to three; then a release within five years as a nudge.
 * Zero for hand-typed tracks with no metadata — those fall back to a plain
 * binary search.
 */
export function similarity(a: RatingProfile, b: RatingProfile): number {
  let score = 0;
  const theirs = creatorsOf(b.creator);
  for (const name of creatorsOf(a.creator)) {
    if (theirs.has(name)) {
      score += 4;
      break;
    }
  }
  const genres = new Set(b.genres.map((g) => g.toLowerCase()));
  score += Math.min(3, a.genres.filter((g) => genres.has(g.toLowerCase())).length);
  const ya = yearOf(a.releaseYear);
  const yb = yearOf(b.releaseYear);
  if (ya !== null && yb !== null && Math.abs(ya - yb) <= 5) score += 0.5;
  return score;
}

/**
 * Why two tracks were put up against each other, in words, when similarity
 * chose the matchup: "Both by Frank Herbert", "Both Science Fiction &
 * Drama". Null when they share nothing worth saying.
 */
export function matchupReason(a: RatingProfile, b: RatingProfile): string | null {
  const theirs = new Map([...creatorsOf(b.creator)].map((name) => [name, name]));
  const shared = (a.creator ?? '')
    .split(/,|&|\band\b/i)
    .map((name) => name.trim())
    .find((name) => name.length > 0 && theirs.has(name.toLowerCase()));
  if (shared) return `Both by ${shared}`;
  const genres = new Set(b.genres.map((g) => g.toLowerCase()));
  const common = a.genres.filter((g) => genres.has(g.toLowerCase())).slice(0, 2);
  return common.length > 0 ? `Both ${common.join(' & ')}` : null;
}

/**
 * A binary-insertion search over the tracks that share the new track's
 * sentiment. `[lo, hi)` is where it can still land within that bucket;
 * every answer shrinks it, and the session ends when it is empty.
 */
export type RankingSession = {
  candidate: RatingProfile;
  sentiment: Sentiment;
  /** The bucket's tracks, best first. */
  bucket: readonly RankedItem[];
  lo: number;
  hi: number;
  /** Index into `bucket` of the track to compare against; null once placed. */
  opponent: number | null;
  comparisons: number;
};

export type Answer = 'candidate' | 'opponent' | 'tie';

/**
 * The next track to compare against, from the middle half of the open
 * window: anywhere there still roughly halves the search, so this can trade
 * the exact midpoint for the most similar track available — the tough
 * matchup. Ties go to the one nearest the midpoint. Each answer removes at
 * least a quarter of the window, so a 100-track category still settles in
 * well under a dozen questions.
 */
export function pickOpponent(
  bucket: readonly RankedItem[],
  lo: number,
  hi: number,
  candidate: RatingProfile,
): number | null {
  const size = hi - lo;
  if (size <= 0) return null;
  const mid = lo + Math.floor(size / 2);
  const margin = Math.floor(size / 4);
  let best = mid;
  let bestScore = -1;
  for (let i = lo + margin; i <= hi - 1 - margin; i += 1) {
    const score = similarity(candidate, bucket[i]!);
    if (score > bestScore || (score === bestScore && Math.abs(i - mid) < Math.abs(best - mid))) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Start rating `candidate`. Its own earlier rating (a re-rank) is left out
 * of the ranking it is compared against. A sentiment nobody else shares
 * yet places it immediately, with no questions.
 */
export function startRanking(
  candidate: RatingProfile,
  sentiment: Sentiment,
  ranking: readonly RankedItem[],
): RankingSession {
  const bucket = ranking.filter((item) => item.sentiment === sentiment && item.key !== candidate.key);
  return {
    candidate,
    sentiment,
    bucket,
    lo: 0,
    hi: bucket.length,
    opponent: pickOpponent(bucket, 0, bucket.length, candidate),
    comparisons: 0,
  };
}

/**
 * Narrow the window after one answer. "Too tough to call" (Beli's own
 * escape hatch) settles it on the spot, just below the opponent — a tie
 * needs no further questions to break.
 */
export function answer(session: RankingSession, choice: Answer): RankingSession {
  const at = session.opponent;
  if (at === null) return session;
  let { lo, hi } = session;
  if (choice === 'candidate') hi = at;
  else if (choice === 'opponent') lo = at + 1;
  else lo = hi = at + 1;
  return {
    ...session,
    lo,
    hi,
    opponent: pickOpponent(session.bucket, lo, hi, session.candidate),
    comparisons: session.comparisons + 1,
  };
}

export function isPlaced(session: RankingSession): boolean {
  return session.opponent === null;
}

/**
 * The category's new best-first order once a session is placed: the other
 * buckets untouched, the candidate inserted at `lo` within its own.
 */
export function placeInRanking(
  ranking: readonly { key: string; sentiment: Sentiment }[],
  key: string,
  sentiment: Sentiment,
  indexInBucket: number,
): { key: string; sentiment: Sentiment }[] {
  const others = ranking.filter((item) => item.key !== key);
  const out: { key: string; sentiment: Sentiment }[] = [];
  for (const s of SENTIMENTS) {
    const bucket = others.filter((item) => item.sentiment === s);
    if (s === sentiment) {
      const at = Math.max(0, Math.min(indexInBucket, bucket.length));
      bucket.splice(at, 0, { key, sentiment });
    }
    out.push(...bucket);
  }
  return out;
}

/** A26: what a rated track shows — its score and where it sits. */
export type RatingSummary = {
  sentiment: Sentiment;
  score: number;
  /** 1-based, within its category. */
  rank: number;
  outOf: number;
  category: Category;
};

/** "8.4" — always one decimal, so 9.0 never reads as a rank. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}
