import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/{trackRepo,trackDetail,addAndStart,seriesTitleOrdinal}.test.ts.
// Those tests' local `advanceEntry`/`advanceAt` helpers apply the domain
// transition with a raw UPDATE (no A4/A5 follow-on); here that is a `sql`
// step with the transition's result written out.

const NOW = '2026-08-12T10:00:00.000Z';
const NOW13 = '2026-08-13T10:00:00.000Z';
const T0 = '2026-09-01T12:00:00.000Z';

const series = (title: string, mediaType: string, unitLabel: string, count: number, extra: Record<string, unknown> = {}) => ({
  title,
  mediaType,
  unitLabel,
  entries: Array.from({ length: count }, (_, i) => ({
    ordinal: i + 1,
    title: `${unitLabel === 'episode' ? 'Episode' : unitLabel === 'issue' ? 'Issue' : 'Volume'} ${i + 1}`,
  })),
  ...extra,
});
const book = (title: string, at = NOW): Step => ({ call: 'createStandaloneTrack', args: [{ title, category: 'book' }, at] });
const list = (shelf: string, category?: string): Step => ({ call: 'listTracks', args: category ? [shelf, category] : [shelf] });
const query = (sql: string, params: unknown[] = []): Step => ({ call: 'query', args: [sql, params] });
const sql = (text: string, params: unknown[] = []): Step => ({ call: 'sql', args: [text, params] });
/** The tests' raw read-mode advance: unstarted -> in_progress at `at`. */
const startRaw = (id: unknown, at: string): Step =>
  sql("UPDATE entry SET status = 'in_progress', started_at = ? WHERE id = ?", [at, id]);
/** in_progress -> done at `at`. */
const finishRaw = (id: unknown, at: string): Step => sql("UPDATE entry SET status = 'done', finished_at = ? WHERE id = ?", [at, id]);
/** A movie's one-step watch-mode advance. */
const watchRaw = (id: unknown, at: string): Step =>
  sql("UPDATE entry SET status = 'done', started_at = ?, finished_at = ? WHERE id = ?", [at, at, id]);
const ref = ($ref: number, path?: string) => (path === undefined ? { $ref } : { $ref, path });

/** Every test here is a scenario (the I4 review showed a trigger can inject
 * the mid-write failure the failing-driver test simulates). */
export const NOT_A_SCENARIO: string[] = [];

/** Fails any INSERT of an entry with this ordinal — a real mid-write error on both platforms. */
const failInsertAtOrdinal = (ordinal: number): Step =>
  sql(`CREATE TRIGGER boom BEFORE INSERT ON entry WHEN NEW.ordinal = ${ordinal} BEGIN SELECT RAISE(ABORT, 'boom'); END`);

export const scenarios: Scenario[] = [
  // --- trackRepo.test.ts ---
  {
    name: 'a series that fails partway through its entries persists nothing',
    steps: [
      failInsertAtOrdinal(2),
      { call: 'createSeriesTrack', args: [series('Severance', 'show', 'episode', 3), NOW] },
      query('SELECT count(*) AS n FROM series'),
      query('SELECT count(*) AS n FROM entry'),
    ],
  },
  {
    name: 'creating a series track writes the series and all its entries',
    steps: [{ call: 'createSeriesTrack', args: [series('Berserk', 'manga', 'volume', 2), NOW] }, query('SELECT title FROM entry ORDER BY ordinal')],
  },
  {
    name: 'a newly created series track lands in the backlog',
    steps: [{ call: 'createSeriesTrack', args: [series('Severance', 'show', 'episode', 1), NOW] }, list('backlog')],
  },
  {
    name: 'a standalone book is created with no series row',
    steps: [book('Dune'), query('SELECT id FROM series ORDER BY rowid'), list('backlog')],
  },
  {
    name: 'listTracks filters by category',
    steps: [book('Dune'), { call: 'createStandaloneTrack', args: [{ title: 'Arrival', category: 'movie' }, NOW] }, list('backlog', 'book')],
  },
  {
    name: 'listTracks sorts by date added, newest first',
    steps: [book('Older', '2026-08-01T00:00:00.000Z'), book('Newer', '2026-08-10T00:00:00.000Z'), list('backlog')],
  },
  {
    name: 'toEntry maps every column to its own domain field (via a stored row read back)',
    steps: [
      sql("INSERT INTO series (id, title, media_type, unit_label, created_at) VALUES ('series-id', 'Show', 'show', 'episode', '2026-01-01T00:00:00.000Z')"),
      sql(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at, paused, external_source, external_id)
         VALUES ('entry-id', 'series-id', 'Episode 7', 7, 'episode', 'done', '2026-01-01T00:00:00.000Z', '2026-02-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 1, 'tmdb', 'ext-id')`,
      ),
      sql(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
         VALUES ('entry-8', 'series-id', 'Episode 8', 8, 'episode', 'unstarted', '2026-03-04T00:00:00.000Z')`,
      ),
      { call: 'getTrackDetail', args: ['series', 'series-id'] },
      { call: 'exportLibrary', args: [] },
    ],
  },
  {
    name: 'listTracks excludes tracks that are on another shelf',
    steps: [
      { call: 'createSeriesTrack', args: [series('Berserk', 'manga', 'volume', 1), NOW] },
      book('Dune'),
      query('SELECT id FROM entry WHERE series_id IS NOT NULL'),
      startRaw(ref(2, '0.id'), NOW),
      list('backlog'),
      list('currently'),
    ],
  },
  {
    name: 'a finished standalone book has nothing left to advance',
    steps: [book('Dune'), startRaw(ref(0), NOW), finishRaw(ref(0), NOW), list('done')],
  },
  {
    name: 'a finished standalone movie has nothing left to advance',
    steps: [{ call: 'createStandaloneTrack', args: [{ title: 'Arrival', category: 'movie' }, NOW] }, watchRaw(ref(0), NOW), list('done')],
  },
  {
    name: 'a standalone book in progress still points at itself to advance',
    steps: [book('Dune'), startRaw(ref(0), NOW), list('currently')],
  },
  {
    name: 'a fully completed series also reports nothing left to advance',
    steps: [
      { call: 'createSeriesTrack', args: [series('Severance', 'show', 'episode', 2), NOW] },
      query('SELECT id FROM entry ORDER BY ordinal'),
      startRaw(ref(1, '0.id'), NOW),
      finishRaw(ref(1, '0.id'), NOW),
      startRaw(ref(1, '1.id'), NOW),
      finishRaw(ref(1, '1.id'), NOW),
      list('done'),
    ],
  },
  {
    name: 'Currently is ordered by most recently advanced, not by date added',
    steps: [
      book('Older', '2026-08-01T00:00:00.000Z'),
      book('Newer', '2026-08-10T00:00:00.000Z'),
      startRaw(ref(1), '2026-08-11T00:00:00.000Z'),
      startRaw(ref(0), '2026-08-12T00:00:00.000Z'),
      list('currently'),
    ],
  },
  {
    name: 'backlog ordering stays by date added even when another track is advanced',
    steps: [
      book('Older', '2026-08-01T00:00:00.000Z'),
      book('Newer', '2026-08-10T00:00:00.000Z'),
      book('Middle', '2026-08-05T00:00:00.000Z'),
      startRaw(ref(2), '2026-08-12T00:00:00.000Z'),
      list('backlog'),
    ],
  },
  {
    name: 'a Currently track with no advance timestamps sorts after ones that have them',
    steps: [
      { call: 'createSeriesTrack', args: [series('Untouched', 'show', 'episode', 2), '2026-08-20T00:00:00.000Z'] },
      query('SELECT id FROM entry WHERE series_id IS NOT NULL ORDER BY ordinal'),
      // A10: an episode is a series child, so its first raw advance only starts it —
      // the test advances it to in_progress, then blanks both timestamps.
      startRaw(ref(1, '0.id'), '2026-08-21T00:00:00.000Z'),
      sql('UPDATE entry SET started_at = NULL, finished_at = NULL WHERE id = ?', [ref(1, '0.id')]),
      book('Dated', '2026-08-01T00:00:00.000Z'),
      startRaw(ref(4), '2026-08-02T00:00:00.000Z'),
      list('currently'),
    ],
  },
  {
    name: 'a series reports the latest advance across all of its children',
    steps: [
      { call: 'createSeriesTrack', args: [series('Severance', 'show', 'episode', 4), NOW] },
      query('SELECT id FROM entry ORDER BY ordinal'),
      startRaw(ref(1, '0.id'), '2026-08-13T00:00:00.000Z'),
      startRaw(ref(1, '2.id'), '2026-08-19T00:00:00.000Z'),
      startRaw(ref(1, '1.id'), '2026-08-15T00:00:00.000Z'),
      list('currently'),
    ],
  },
  {
    name: 'a track advanced only to in_progress reports its start as its last advance',
    steps: [book('Dune'), startRaw(ref(0), '2026-08-14T00:00:00.000Z'), list('currently')],
  },
  {
    name: 'creating a series track with a bad ordinal writes nothing',
    steps: [
      { call: 'createSeriesTrack', args: [{ title: 'Berserk', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: -4.5, title: 'Volume ?' }] }, NOW] },
    ],
  },
  {
    name: 'creating a track with a non-ISO timestamp is rejected',
    steps: [book('Dune', 'not-a-date'), { call: 'createSeriesTrack', args: [series('Berserk', 'manga', 'volume', 1), 'not-a-date'] }],
  },
  {
    name: "createSeriesTrack persists a draft's seasons, and listTracks reads them back",
    steps: [{ call: 'createSeriesTrack', args: [series('House', 'show', 'episode', 2, { seasons: [{ number: 1, episodeCount: 2 }] }), NOW] }, list('backlog')],
  },
  {
    name: 'a series created without season data reports seasons as null',
    steps: [{ call: 'createSeriesTrack', args: [series('Berserk', 'manga', 'volume', 1), NOW] }, list('backlog')],
  },
  {
    name: 'listTracks skips a parentless row whose media type is a unit label',
    steps: [
      book('Dune'),
      sql(
        `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
         VALUES ('legacy', NULL, 'Orphan', NULL, 'episode', 'unstarted', ?)`,
        [NOW],
      ),
      list('backlog'),
    ],
  },
  {
    name: 'renameTrack updates a series title, keeping its external source/id and seasons',
    steps: [
      {
        call: 'createSeriesTrack',
        args: [series('House', 'show', 'episode', 1, { externalSource: 'tmdb', externalId: '1408', seasons: [{ number: 1, episodeCount: 1 }] }), NOW],
      },
      { call: 'renameTrack', args: [{ kind: 'series', id: ref(0) }, 'House, M.D.'] },
      list('backlog'),
      query('SELECT external_source, external_id FROM series WHERE id = ?', [ref(0)]),
    ],
  },
  {
    name: 'renameTrack updates a standalone entry title',
    steps: [book('Dune'), { call: 'renameTrack', args: [{ kind: 'entry', id: ref(0) }, 'Dune (1965)'] }, list('backlog')],
  },
  {
    name: 'renameTrack trims surrounding whitespace',
    steps: [book('Dune'), { call: 'renameTrack', args: [{ kind: 'entry', id: ref(0) }, '  Dune Messiah  '] }, list('backlog')],
  },
  {
    name: 'renameTrack rejects a blank title',
    steps: [book('Dune'), { call: 'renameTrack', args: [{ kind: 'entry', id: ref(0) }, '   '] }, list('backlog')],
  },

  // --- trackDetail.test.ts ---
  {
    name: 'a standalone add stores its metadata and marks it checked',
    steps: [
      {
        call: 'addTrack',
        args: [
          {
            title: 'Dune',
            category: 'book',
            count: 1,
            match: { id: 'gb1', title: 'Dune', category: 'book', count: 1 },
            metadata: { coverUrl: 'https://books.google.com/dune.jpg', creator: 'Frank Herbert', description: 'Spice.', releaseYear: '1965' },
          },
          T0,
        ],
      },
      { call: 'getTrackDetail', args: ['entry', ref(0, 'id')] },
      query('SELECT metadata_checked_at FROM entry'),
    ],
  },
  {
    name: 'a hand-typed add has empty metadata and is not marked checked',
    steps: [
      { call: 'addTrack', args: [{ title: 'Notes', category: 'book', count: 1 }, T0] },
      { call: 'getTrackDetail', args: ['entry', ref(0, 'id')] },
      query('SELECT metadata_checked_at FROM entry'),
    ],
  },
  {
    name: 'a series stores draft metadata on the series row and reports a timeline',
    steps: [
      {
        call: 'createSeriesTrack',
        args: [
          series('Severance', 'show', 'episode', 2, {
            externalSource: 'tmdb',
            externalId: '95396',
            metadata: { coverUrl: 'https://image.tmdb.org/t/p/w342/x.jpg', creator: 'Dan Erickson', description: null, releaseYear: '2022' },
          }),
          T0,
        ],
      },
      query('SELECT id FROM entry WHERE ordinal = 1'),
      { call: 'advanceEntry', args: [ref(1, '0.id'), '2026-09-03T12:00:00.000Z'] },
      { call: 'getTrackDetail', args: ['series', ref(0)] },
    ],
  },
  {
    name: 'a missing track returns null',
    steps: [{ call: 'getTrackDetail', args: ['series', 'nope'] }],
  },

  // --- addAndStart.test.ts ---
  {
    name: 'addTrack reports what it created, so the caller can start it immediately',
    steps: [
      { call: 'addTrack', args: [{ title: 'Berserk', category: 'manga', count: 3 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      { call: 'advanceEntry', args: [ref(1, 'id'), NOW13] },
      list('currently'),
    ],
  },
  {
    name: 'starting a standalone track right after adding it works the same way',
    steps: [
      { call: 'addTrack', args: [{ title: 'Dune', category: 'book', count: 1 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      { call: 'advanceEntry', args: [ref(1, 'id'), NOW13] },
      list('currently'),
    ],
  },
  {
    name: 'starting a show right after adding it starts episode 1, watch mode now has a reading state',
    steps: [
      { call: 'addTrack', args: [{ title: 'Severance', category: 'show', count: 3 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      { call: 'advanceEntry', args: [ref(1, 'id'), NOW13] },
      list('currently'),
    ],
  },
  {
    name: 'a standalone movie still completes in one tap right after adding',
    steps: [
      { call: 'addTrack', args: [{ title: 'Sicario', category: 'movie', count: 1 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      { call: 'advanceEntry', args: [ref(1, 'id'), NOW13] },
      list('currently'),
      list('done'),
    ],
  },
  {
    name: 'firstEntryOf points at ordinal 1 when nothing has started it early',
    steps: [
      { call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      query('SELECT ordinal FROM entry WHERE id = ?', [ref(1, 'id')]),
    ],
  },

  // --- seriesTitleOrdinal.test.ts (titles already parsed: "Saga #3" -> Saga, 3) ---
  {
    name: 'a parsed ordinal within range starts that entry in_progress, backfills what came before as done, and lands the series in Currently',
    steps: [{ call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5, startAtOrdinal: 3 }, NOW13] }, list('backlog'), list('currently')],
  },
  {
    name: 'finishing the started entry continues to the next ordinal, not back to 1',
    steps: [
      { call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5, startAtOrdinal: 3 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      { call: 'advanceEntry', args: [ref(1, 'id'), NOW13] },
      list('currently'),
    ],
  },
  {
    name: 'an out-of-range ordinal is ignored, falling back to a normal all-unstarted series',
    steps: [{ call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5, startAtOrdinal: 99 }, NOW13] }, list('currently'), list('backlog')],
  },
  {
    name: 'an ordinal of exactly the last entry is in range, not off-by-one',
    steps: [{ call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5, startAtOrdinal: 5 }, NOW13] }, list('currently')],
  },
  {
    name: 'no ordinal at all creates a normal series, unstarted at entry 1',
    steps: [{ call: 'addTrack', args: [{ title: 'Saga', category: 'comic', count: 5 }, NOW13] }, list('currently'), list('backlog')],
  },
  {
    name: 'an ongoing series with a parsed ordinal renumbers its bootstrap entry',
    steps: [{ call: 'addTrack', args: [{ title: 'One Piece', category: 'manga', count: null, ongoing: true, startAtOrdinal: 8 }, NOW13] }, list('currently')],
  },
  {
    name: 'an ongoing series with no parsed ordinal starts at Volume 1, unstarted',
    steps: [{ call: 'addTrack', args: [{ title: 'One Piece', category: 'manga', count: null, ongoing: true }, NOW13] }, list('backlog')],
  },
  {
    name: 'firstEntryOf reports the A10-started entry as already in_progress, not ordinal 1',
    steps: [
      { call: 'addTrack', args: [{ title: 'Berserk', category: 'manga', count: 10, startAtOrdinal: 5 }, NOW13] },
      { call: 'firstEntryOf', args: [ref(0)] },
      query('SELECT ordinal FROM entry WHERE id = ?', [ref(1, 'id')]),
    ],
  },

  // --- Iris parity (Review Focus 4, 5) ---
  {
    name: 'Iris parity: tracks added at the same instant list in insertion order',
    steps: [book('First'), book('Second'), book('Third'), { call: 'createSeriesTrack', args: [series('Fourth', 'show', 'episode', 1), NOW] }, list('backlog')],
  },
  {
    name: 'Iris parity: a draft ordinal no platform can store is rejected',
    steps: [{ call: 'createSeriesTrack', args: [{ title: 'Big', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: 1e19, title: 'Volume ∞' }] }, NOW] }],
  },
  {
    name: 'Iris parity: a rejected draft writes nothing',
    steps: [{ call: 'createSeriesTrack', args: [{ title: 'Bad', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: -1, title: 'Volume -1' }] }, NOW] }],
  },
  {
    name: 'Iris parity: blank, untrimmed and standalone-forced adds',
    steps: [
      { call: 'addTrack', args: [{ title: '   ', category: 'book', count: 1 }, NOW] },
      { call: 'addTrack', args: [{ title: '  Saga  ', category: 'comic', count: 2 }, NOW] },
      {
        call: 'addTrack',
        args: [{ title: 'Saga Vol. 1', category: 'comic', count: 1, standalone: true, match: { id: 'gb-saga', title: 'Saga Vol. 1', category: 'comic', count: 1 }, externalSource: 'google-books' }, NOW],
      },
      { call: 'addTrack', args: [{ title: 'Zero', category: 'show', count: 0 }, NOW] },
      { call: 'addTrack', args: [{ title: 'Half', category: 'show', count: 2.5 }, NOW] },
      list('backlog'),
    ],
  },
];
