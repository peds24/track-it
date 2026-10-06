import { addTrack } from '@/data/addTrack';
import { exportLibrary, importLibrary } from '@/data/backup';
import { allScores, getRating, listRanking, ratingProfileOf, removeRating, saveRating } from '@/data/ratingRepo';
import { deleteTrack } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import type { Category } from '@/domain/types';
import { createMemoryDriver } from '../../../test/memoryDriver';

const T0 = '2026-10-01T12:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

async function movie(db: SqlDriver, title: string, metadata?: { creator?: string; genres?: string[] }) {
  const created = await addTrack(
    db,
    {
      title,
      category: 'movie',
      count: 1,
      ...(metadata
        ? {
            match: { id: `tmdb-${title}`, title, category: 'movie' as Category, count: 1 },
            metadata: { coverUrl: null, creator: metadata.creator ?? null, description: null, releaseYear: '2020', genres: metadata.genres },
          }
        : {}),
    },
    T0,
  );
  return { kind: created.kind, id: created.id, category: 'movie' as const };
}

test('ratings are ordered within their category and scored from that order', async () => {
  const db = await freshDb();
  const arrival = await movie(db, 'Arrival');
  const dune = await movie(db, 'Dune');
  const cats = await movie(db, 'Cats');

  await saveRating(db, arrival, 'liked', 0, T0);
  await saveRating(db, dune, 'liked', 0, T0); // preferred over Arrival
  await saveRating(db, cats, 'disliked', 0, T0);

  const ranking = await listRanking(db, 'movie');
  expect(ranking.map((r) => [r.title, r.rank, r.score])).toEqual([
    ['Dune', 1, 9.3],
    ['Arrival', 2, 7.8],
    ['Cats', 3, 2.5],
  ]);
  expect(await getRating(db, arrival)).toEqual({ sentiment: 'liked', score: 7.8, rank: 2, outOf: 3, category: 'movie' });
});

test('categories never mix', async () => {
  const db = await freshDb();
  const film = await movie(db, 'Arrival');
  const book = await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, T0);

  await saveRating(db, film, 'liked', 0, T0);
  await saveRating(db, { ...book, category: 'book' }, 'fine', 0, T0);

  expect((await listRanking(db, 'movie')).map((r) => r.title)).toEqual(['Arrival']);
  expect((await listRanking(db, 'book')).map((r) => r.title)).toEqual(['Dune']);
  expect((await getRating(db, film))?.outOf).toBe(1);
});

test('re-rating a track moves it rather than duplicating it', async () => {
  const db = await freshDb();
  const a = await movie(db, 'A');
  const b = await movie(db, 'B');
  await saveRating(db, a, 'liked', 0, T0);
  await saveRating(db, b, 'liked', 1, T0);

  await saveRating(db, a, 'fine', 0, T0);

  expect((await listRanking(db, 'movie')).map((r) => [r.title, r.sentiment])).toEqual([
    ['B', 'liked'],
    ['A', 'fine'],
  ]);
});

test('deleting a track deletes its rating; removing a rating keeps the track', async () => {
  const db = await freshDb();
  const a = await movie(db, 'A');
  const b = await movie(db, 'B');
  await saveRating(db, a, 'liked', 0, T0);
  await saveRating(db, b, 'liked', 1, T0);

  await deleteTrack(db, a);
  expect((await listRanking(db, 'movie')).map((r) => [r.title, r.rank])).toEqual([['B', 1]]);
  expect(await db.all('SELECT * FROM rating WHERE track_id = ?', [a.id])).toEqual([]);

  await removeRating(db, b);
  expect(await getRating(db, b)).toBeNull();
  expect(await db.all('SELECT id FROM entry WHERE id = ?', [b.id])).toHaveLength(1);
});

test('the rating profile carries creator and genres for matchups', async () => {
  const db = await freshDb();
  const film = await movie(db, 'Arrival', { creator: 'Denis Villeneuve', genres: ['Science Fiction', 'Drama'] });

  expect(await ratingProfileOf(db, film)).toEqual({
    key: `entry:${film.id}`,
    creator: 'Denis Villeneuve',
    genres: ['Science Fiction', 'Drama'],
    releaseYear: '2020',
  });
  expect((await listRanking(db, 'movie'))).toEqual([]);
});

test('allScores covers every category', async () => {
  const db = await freshDb();
  const film = await movie(db, 'Arrival');
  const book = await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, T0);
  await saveRating(db, film, 'liked', 0, T0);
  await saveRating(db, { ...book, category: 'book' }, 'disliked', 0, T0);

  const scores = await allScores(db);
  expect(scores.get(`entry:${film.id}`)).toBe(8.5);
  expect(scores.get(`entry:${book.id}`)).toBe(2.5);
});

test('ratings survive an export/import round trip, and a backup rating a missing track is rejected', async () => {
  const source = await freshDb();
  const a = await movie(source, 'A');
  const b = await movie(source, 'B');
  await saveRating(source, a, 'liked', 0, T0);
  await saveRating(source, b, 'liked', 0, T0);

  const json = await exportLibrary(source);
  const target = await freshDb();
  await importLibrary(target, json);
  expect((await listRanking(target, 'movie')).map((r) => r.title)).toEqual(['B', 'A']);

  const broken = JSON.parse(json) as { ratings: { trackId: string }[] };
  broken.ratings[0]!.trackId = 'nope';
  await expect(importLibrary(await freshDb(), JSON.stringify(broken))).rejects.toThrow(/missing entry/);
});

test('saveRating rejects a malformed timestamp before writing anything', async () => {
  const db = await freshDb();
  const a = await movie(db, 'A');
  await expect(saveRating(db, a, 'liked', 0, 'yesterday')).rejects.toThrow();
  expect(await db.all('SELECT * FROM rating')).toEqual([]);
});
