import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/backfillMetadata.test.ts. Each test's
// `fakeProvider(details)` becomes a stub keyed by the row's external_source
// (see `stubProvider` in ../registry.ts); `resolve: () => null` is an empty
// stub table. The recorded `calls` stand in for the tests' toHaveBeenCalled
// checks, and `sleeps` for their recording sleep.

const T0 = '2026-09-01T12:00:00.000Z';
const LATER = '2026-09-22T12:00:00.000Z';
const META = { coverUrl: 'https://c/1.jpg', creator: 'Author', description: 'Text.', releaseYear: '2001' };

const sql = (text: string, params: unknown[] = []): Step => ({ call: 'sql', args: [text, params] });
const query = (text: string, params: unknown[] = []): Step => ({ call: 'query', args: [text, params] });
const backfill = (stubs: Record<string, unknown>, now = LATER): Step => ({ call: 'backfillMetadata', args: [stubs, now] });
const answering = (source: string, answers: Record<string, unknown>) => ({ [source]: { details: answers } });
const ENTRY = query('SELECT * FROM entry ORDER BY id');

/** The tests' `dbWithMatchedBook`: a pre-A22 row, matched but never checked. */
const matchedBook = (source = 'google-books'): Step =>
  sql(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id)
     VALUES ('e1', NULL, 'Dune', NULL, 'book', 'unstarted', ?, ?, 'gb1')`,
    [T0, source],
  );

/** The pacing tests' `dbWith`: one matched book per [id, source]. Ids are
 * `row-a`…, not the tests' `a`…: play.ts tokenises ids by substring, and a
 * one-letter id would rewrite every word containing it. */
const rows = (list: [string, string][]): Step[] =>
  list.map(([id, source]) =>
    sql(
      `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id)
       VALUES (?, NULL, ?, NULL, 'book', 'unstarted', ?, ?, ?)`,
      [id, id, T0, source, `x-${id}`],
    ),
  );
/** Every source in `list` answers META for every row. */
const allAnswer = (list: [string, string][]) => {
  const stubs: Record<string, { details: Record<string, unknown> }> = {};
  for (const [id, source] of list) (stubs[source] ??= { details: {} }).details[`x-${id}`] = META;
  return stubs;
};
const paced = (name: string, list: [string, string][], stubs = allAnswer(list)): Scenario => ({
  name: `per-source pacing: ${name}`,
  steps: [...rows(list), backfill(stubs)],
});

export const scenarios: Scenario[] = [
  { name: 'fills and stamps a matched row', steps: [matchedBook(), backfill(answering('google-books', { gb1: META })), ENTRY] },
  {
    name: 'A26: a row A22 already filled is revisited once for its genres, keeping everything else',
    steps: [
      matchedBook(),
      sql(`UPDATE entry SET creator = 'Frank Herbert', metadata_checked_at = ?`, [T0]),
      backfill(answering('google-books', { gb1: { ...META, genres: ['Science Fiction', 'Space Opera'] } })),
      backfill(answering('google-books', { gb1: { ...META, genres: ['Science Fiction', 'Space Opera'] } })),
      ENTRY,
    ],
  },
  { name: 'a failed lookup leaves the row unstamped so it retries next launch', steps: [matchedBook(), backfill(answering('google-books', { gb1: null })), ENTRY] },
  {
    name: 'a provider that throws anyway is treated as a failed lookup, not a crash',
    steps: [matchedBook(), backfill(answering('google-books', { gb1: { throws: 'offline' } })), ENTRY],
  },
  { name: 'an unknown source is stamped and skipped', steps: [matchedBook('retired-provider'), backfill({}), ENTRY] },
  {
    name: 'hand-typed tracks, series children, and already-checked rows are never queried',
    steps: [
      { call: 'addTrack', args: [{ title: 'Notes', category: 'book', count: 1 }, T0] },
      { call: 'addTrack', args: [{ title: 'Berserk', category: 'manga', count: 2 }, T0] },
      sql(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id, metadata_checked_at, genres_json)
         VALUES ('done1', NULL, 'Known', NULL, 'book', 'unstarted', ?, 'google-books', 'gb2', ?, '[]')`,
        [T0, T0],
      ),
      backfill(answering('google-books', { gb2: META })),
    ],
  },
  {
    name: 'a matched series is filled on its series row',
    steps: [
      sql(
        `INSERT INTO series (id, title, media_type, unit_label, created_at, external_source, external_id)
         VALUES ('s1', 'Severance', 'show', 'episode', ?, 'tmdb', '95396')`,
        [T0],
      ),
      backfill(answering('tmdb', { 95396: META })),
      query('SELECT * FROM series'),
    ],
  },
  {
    name: 'existing values are never overwritten by the backfill',
    steps: [matchedBook(), sql(`UPDATE entry SET creator = 'Kept'`), backfill(answering('google-books', { gb1: META })), ENTRY],
  },
  paced('two metron rows wait once, 3500 ms, between the lookups', [['row-a', 'metron'], ['row-b', 'metron']]),
  paced('anilist rows are spaced 2000 ms apart', [['row-a', 'anilist'], ['row-b', 'anilist'], ['row-c', 'anilist']]),
  paced('google-books and tmdb are not paced, and a lone row never waits', [['row-a', 'google-books'], ['row-b', 'google-books'], ['row-c', 'tmdb'], ['row-d', 'tmdb'], ['row-e', 'metron']]),
  paced('the gap is per source: interleaved sources each pace only against themselves', [['row-a', 'metron'], ['row-b', 'anilist'], ['row-c', 'metron'], ['row-d', 'anilist']]),
  paced('skipped rows (no provider) never sleep', [['row-a', 'metron'], ['row-b', 'metron']], {}),

  // --- Iris parity ---
  {
    name: 'Iris parity: a failed metron lookup still paces the next one; a source with no details is skipped unpaced',
    steps: [
      ...rows([['row-a', 'metron'], ['row-b', 'metron'], ['row-c', 'tmdb'], ['row-d', 'anilist']]),
      backfill({ metron: { details: { 'x-row-a': { throws: 'offline' }, 'x-row-b': META } }, tmdb: {}, anilist: { details: {} } }),
      query('SELECT id, metadata_checked_at, genres_json FROM entry ORDER BY id'),
    ],
  },
  {
    name: 'Iris parity: series rows are looked up before standalone entries, and nulls in metadata fill nothing',
    steps: [
      ...rows([['row-e', 'anilist']]),
      sql(
        `INSERT INTO series (id, title, media_type, unit_label, created_at, external_source, external_id)
         VALUES ('s1', 'Berserk', 'manga', 'volume', ?, 'anilist', '1')`,
        [T0],
      ),
      backfill({ anilist: { details: { 1: { coverUrl: null, creator: null, description: null, releaseYear: null, genres: [] }, 'x-row-e': META } } }),
      query('SELECT id, cover_url, creator, metadata_checked_at, genres_json FROM series'),
      query('SELECT id, cover_url, creator, metadata_checked_at, genres_json FROM entry'),
    ],
  },
];
