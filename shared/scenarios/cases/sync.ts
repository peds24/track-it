import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/syncSeriesUnit.test.ts. The tests'
// `provider(unitAt)` becomes a `unitAt` stub keyed '<externalId>#<ordinal>'
// (see `stubProvider` in ../registry.ts); the recorded `calls` stand in for
// their toHaveBeenCalledWith checks. Step 0 is always the series (its id).

const T0 = '2026-09-01T12:00:00.000Z';
const T1 = '2026-09-02T12:00:00.000Z';
const COVER1 = 'https://static.metron.cloud/1.jpg';

const sql = (text: string, params: unknown[] = []): Step => ({ call: 'sql', args: [text, params] });
const query = (text: string, params: unknown[] = []): Step => ({ call: 'query', args: [text, params] });
const SERIES = { $ref: 0 };

/** The tests' `comicSeries`: three issues of Saga, matched to Metron issue 101. */
const comicSeries = (source: string | null = 'metron'): Step => ({
  call: 'createSeriesTrack',
  args: [
    {
      title: 'Saga',
      mediaType: 'comic',
      unitLabel: 'issue',
      entries: [1, 2, 3].map((n) => ({ ordinal: n, title: `Issue ${n}` })),
      ...(source ? { externalSource: source, externalId: '101' } : {}),
      metadata: { coverUrl: COVER1, creator: 'BKV', description: null, releaseYear: '2012' },
    },
    T0,
    1,
  ],
});
/** Steps 1–3: each issue's entry id, by ordinal (`entry(n)` refers to it). */
const ENTRY_IDS: Step[] = [1, 2, 3].map((n) => query('SELECT id FROM entry WHERE ordinal = ?', [n]));
const entry = (n: number) => ({ $ref: n, path: '0.id' });
const units = (answers: Record<string, unknown>, source = 'metron') => ({ [source]: { unitAt: answers } });
const sync = (stubs: Record<string, unknown>): Step => ({ call: 'syncSeriesUnit', args: [SERIES, stubs] });
const DETAIL: Step = { call: 'getTrackDetail', args: ['series', SERIES] };
const STORED = query('SELECT external_id, cover_url FROM series');
const TITLES = query('SELECT ordinal, title FROM entry ORDER BY ordinal');

export const scenarios: Scenario[] = [
  {
    name: 'after an advance, the series shows the issue now being read',
    steps: [
      comicSeries(),
      ...ENTRY_IDS,
      { call: 'advanceEntry', args: [entry(1), T1] },
      sync(units({ '101#2': { externalId: '102', number: '2', coverUrl: 'https://static.metron.cloud/2.jpg' } })),
      DETAIL,
      STORED,
    ],
  },
  {
    name: "uses the catalogue's own issue number in the unit title",
    steps: [
      comicSeries(),
      ...ENTRY_IDS,
      { call: 'advanceEntry', args: [entry(1), T1] },
      sync(units({ '101#2': { externalId: '150', number: '1.1', coverUrl: null } })),
      DETAIL,
      TITLES,
    ],
  },
  {
    name: 'a finished series settles on its last issue',
    steps: [comicSeries(), sql("UPDATE entry SET status = 'done', finished_at = ?", [T1]), sync(units({}))],
  },
  {
    name: 'nothing changes when the catalogue has no such issue, or the lookup failed',
    steps: [comicSeries(), sync(units({})), STORED, TITLES],
  },
  { name: 'a hand-typed series is never looked up', steps: [comicSeries(null), sync(units({ '101#1': { externalId: '9', number: '9', coverUrl: null } }))] },
  {
    name: 'a source without per-unit records (TMDB, AniList) is skipped',
    steps: [comicSeries('anilist'), sync({ anilist: {} })],
  },
  {
    name: 'syncUnitForEntry finds the series from one of its units, and ignores a standalone entry',
    steps: [
      comicSeries(),
      ...ENTRY_IDS,
      { call: 'syncUnitForEntry', args: [entry(1), units({ '101#1': { externalId: '101', number: '1', coverUrl: COVER1 } })] },
      sql(`INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES ('standalone-b', NULL, 'Dune', NULL, 'book', 'unstarted', ?)`, [T0]),
      { call: 'syncUnitForEntry', args: ['standalone-b', units({})] },
    ],
  },

  // --- Iris parity ---
  {
    name: 'Iris parity: an unknown source resolves to no provider; an unknown series or entry is no change',
    steps: [
      comicSeries('retired-provider'),
      sync({}),
      { call: 'syncSeriesUnit', args: ['no-such-series', units({})] },
      { call: 'syncUnitForEntry', args: ['no-such-entry', units({})] },
    ],
  },
  {
    name: 'Iris parity: a new cover alone counts as a change; the title keeps the unit label',
    steps: [
      comicSeries(),
      sync(units({ '101#1': { externalId: '101', number: '1', coverUrl: 'https://static.metron.cloud/1b.jpg' } })),
      STORED,
      TITLES,
    ],
  },
];
