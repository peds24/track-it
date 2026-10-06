import type { SqlDriver } from '@/db/driver';
import { assertIsoTimestamp } from '@/domain/validate';
import {
  placeInRanking,
  scoresFor,
  type RankedItem,
  type RatingProfile,
  type RatingSummary,
  type Sentiment,
} from '@/domain/rating';
import type { Category } from '@/domain/types';
import { sharpCoverUrl } from '@/providers/images';

type TrackRef = { kind: 'series' | 'entry'; id: string };

/** One row of a category's ranking, joined to what the screens show. */
export type RankedTrack = RankedItem & {
  kind: 'series' | 'entry';
  id: string;
  title: string;
  coverUrl: string | null;
  score: number;
  /** 1-based. */
  rank: number;
};

type RankingRow = {
  track_kind: 'series' | 'entry';
  track_id: string;
  sentiment: Sentiment;
  title: string | null;
  cover_url: string | null;
  creator: string | null;
  genres_json: string | null;
  release_year: string | null;
};

/** `kind:id` — the key the domain layer ranks by. */
export function ratingKey(track: TrackRef): string {
  return `${track.kind}:${track.id}`;
}

function parseGenres(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * A26: a category's ranking, best first, with each track's derived score.
 * A row whose track no longer exists (it can't, since deleteTrack removes
 * both — but an older build or a hand-edited database could leave one) is
 * left out rather than shown as a blank.
 */
export async function listRanking(db: SqlDriver, category: Category): Promise<RankedTrack[]> {
  const rows = await db.all<RankingRow>(
    `SELECT r.track_kind, r.track_id, r.sentiment,
            COALESCE(s.title, e.title) AS title,
            COALESCE(s.cover_url, e.cover_url) AS cover_url,
            COALESCE(s.creator, e.creator) AS creator,
            COALESCE(s.genres_json, e.genres_json) AS genres_json,
            COALESCE(s.release_year, e.release_year) AS release_year
     FROM rating r
     LEFT JOIN series s ON r.track_kind = 'series' AND s.id = r.track_id
     LEFT JOIN entry e ON r.track_kind = 'entry' AND e.id = r.track_id
     WHERE r.category = ?
     ORDER BY r.position ASC, r.rated_at ASC`,
    [category],
  );
  const present = rows.filter((row) => row.title !== null);
  const items = present.map((row) => ({ key: ratingKey({ kind: row.track_kind, id: row.track_id }), sentiment: row.sentiment }));
  const scores = scoresFor(items);
  return present.map((row, i) => ({
    key: items[i]!.key,
    kind: row.track_kind,
    id: row.track_id,
    title: row.title!,
    coverUrl: sharpCoverUrl(row.cover_url),
    creator: row.creator,
    genres: parseGenres(row.genres_json),
    releaseYear: row.release_year,
    sentiment: row.sentiment,
    score: scores.get(items[i]!.key)!,
    rank: i + 1,
  }));
}

/** A26: what the matchup picker needs to know about the track being rated. */
export async function ratingProfileOf(db: SqlDriver, track: TrackRef): Promise<RatingProfile | null> {
  const table = track.kind === 'series' ? 'series' : 'entry';
  const rows = await db.all<{ creator: string | null; genres_json: string | null; release_year: string | null }>(
    `SELECT creator, genres_json, release_year FROM ${table} WHERE id = ?`,
    [track.id],
  );
  const row = rows[0];
  if (!row) return null;
  return { key: ratingKey(track), creator: row.creator, genres: parseGenres(row.genres_json), releaseYear: row.release_year };
}

/** A26: one track's score and rank, or null when it hasn't been rated. */
export async function getRating(db: SqlDriver, track: TrackRef): Promise<RatingSummary | null> {
  const rows = await db.all<{ category: Category }>('SELECT category FROM rating WHERE track_kind = ? AND track_id = ?', [
    track.kind,
    track.id,
  ]);
  const category = rows[0]?.category;
  if (!category) return null;
  const ranking = await listRanking(db, category);
  const mine = ranking.find((r) => r.key === ratingKey(track));
  if (!mine) return null;
  return { sentiment: mine.sentiment, score: mine.score, rank: mine.rank, outOf: ranking.length, category };
}

/** A26: every rated track's score, keyed by `kind:id` — for list rows. */
export async function allScores(db: SqlDriver): Promise<Map<string, number>> {
  const categories = await db.all<{ category: Category }>('SELECT DISTINCT category FROM rating');
  const scores = new Map<string, number>();
  for (const { category } of categories) {
    for (const ranked of await listRanking(db, category)) scores.set(ranked.key, ranked.score);
  }
  return scores;
}

/**
 * A26: record where a finished ranking session placed `track` — at
 * `indexInBucket` among the other tracks of its category that share its
 * sentiment. Replaces any earlier rating of the same track (a re-rank) and
 * rewrites the category's order in one transaction, so a half-renumbered
 * ranking is never observable.
 */
export async function saveRating(
  db: SqlDriver,
  track: TrackRef & { category: Category },
  sentiment: Sentiment,
  indexInBucket: number,
  now: string,
): Promise<void> {
  assertIsoTimestamp(now, 'rating ratedAt');
  const key = ratingKey(track);
  const current = (await listRanking(db, track.category)).filter((r) => r.key !== key);
  const order = placeInRanking(current, key, sentiment, indexInBucket);
  const refs = new Map<string, TrackRef>([[key, track], ...current.map((r): [string, TrackRef] => [r.key, r])]);

  await db.transaction(async () => {
    await db.run('DELETE FROM rating WHERE track_kind = ? AND track_id = ?', [track.kind, track.id]);
    await db.run(
      `INSERT INTO rating (track_kind, track_id, category, sentiment, position, rated_at) VALUES (?, ?, ?, ?, 0, ?)`,
      [track.kind, track.id, track.category, sentiment, now],
    );
    for (let position = 0; position < order.length; position += 1) {
      const ref = refs.get(order[position]!.key)!;
      await db.run('UPDATE rating SET position = ? WHERE track_kind = ? AND track_id = ?', [position, ref.kind, ref.id]);
    }
  });
}

/** A26: forget a track's rating. The rest of its category keeps its order. */
export async function removeRating(db: SqlDriver, track: TrackRef): Promise<void> {
  await db.run('DELETE FROM rating WHERE track_kind = ? AND track_id = ?', [track.kind, track.id]);
}
