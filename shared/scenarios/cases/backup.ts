import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/backup.test.ts. The tests' two databases
// (source, target) become one: export, change the library, import the
// export back — the same replace-not-merge path.

const NOW = '2026-08-12T10:00:00.000Z';
const T0 = '2026-09-01T12:00:00.000Z';

const list = (shelf: string): Step => ({ call: 'listTracks', args: [shelf] });
const add = (input: Record<string, unknown>, at = NOW): Step => ({ call: 'addTrack', args: [input, at] });
const dune = add({ title: 'Dune', category: 'book', count: 1 });
const exportStep: Step = { call: 'exportLibrary', args: [] };
const importRef = (step: number): Step => ({ call: 'importLibrary', args: [{ $ref: step, json: true }] });
const importText = (json: string): Step => ({ call: 'importLibrary', args: [json] });

const payload = (over: { series?: unknown[]; entries?: unknown[] } = {}) => JSON.stringify({ version: 1, series: [], entries: [], ...over });
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  seriesId: null,
  title: 'Dracula',
  ordinal: null,
  mediaType: 'book',
  status: 'unstarted',
  startedAt: null,
  finishedAt: null,
  createdAt: NOW,
  ...over,
});
const series = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  title: 'Berserk',
  mediaType: 'manga',
  unitLabel: 'volume',
  createdAt: NOW,
  externalSource: null,
  externalId: null,
  ...over,
});
/** The tests' expectRejectedAndLibraryIntact: Dune exists, the import fails, Dune remains. */
const rejectedKeepsDune = (json: string): Step[] => [dune, importText(json), list('backlog')];

/** Review Focus 2: a TS-authored backup with everything the format carries. */
const CROSS_PLATFORM_BACKUP = JSON.stringify({
  version: 1,
  series: [
    {
      id: 'show-1', title: 'Severance "Season" 1/2', mediaType: 'show', unitLabel: 'episode', createdAt: '2026-01-01T09:00:00.000Z',
      ongoing: false, paused: false, externalSource: 'tmdb', externalId: '95396',
      seasons: [{ number: 1, episodeCount: 2 }],
      coverUrl: 'https://image.tmdb.org/t/p/w342/sev.jpg', creator: 'Dan Erickson', description: 'Work/life — séparation.',
      releaseYear: '2022', metadataCheckedAt: '2026-01-02T00:00:00.000Z', genres: ['Drama', 'Sci-Fi/Fantasy'],
    },
    {
      id: 'comic-1', title: 'Saga', mediaType: 'comic', unitLabel: 'issue', createdAt: '2026-02-01T09:00:00.000Z',
      ongoing: true, paused: true, externalSource: 'metron', externalId: '42',
    },
  ],
  entries: [
    { id: 'ep-1', seriesId: 'show-1', title: 'Episode 1', ordinal: 1, mediaType: 'episode', status: 'done', startedAt: '2026-01-03T00:00:00.000Z', finishedAt: '2026-01-04T00:00:00.000Z', createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'ep-2', seriesId: 'show-1', title: 'Episode 2', ordinal: 2, mediaType: 'episode', status: 'in_progress', startedAt: '2026-01-04T00:00:00.000Z', finishedAt: null, createdAt: '2026-01-01T09:00:00.000Z' },
    { id: 'is-7', seriesId: 'comic-1', title: 'Issue 7', ordinal: 7, mediaType: 'issue', status: 'in_progress', startedAt: '2026-02-02T00:00:00.000Z', finishedAt: null, createdAt: '2026-02-01T09:00:00.000Z' },
    {
      id: 'book-1', seriesId: null, title: 'Dune', ordinal: null, mediaType: 'book', status: 'done', startedAt: '2026-03-01T00:00:00.000Z', finishedAt: '2026-03-20T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z', paused: false, externalSource: 'google-books', externalId: 'gb1',
      coverUrl: 'http://books.google.com/books/content?id=x&edge=curl&zoom=1', creator: 'Frank Herbert', metadataCheckedAt: '2026-03-01T00:00:00.000Z', genres: [],
    },
    { id: 'movie-1', seriesId: null, title: 'Arrival', ordinal: null, mediaType: 'movie', status: 'done', startedAt: '2026-04-01T00:00:00.000Z', finishedAt: '2026-04-01T00:00:00.000Z', createdAt: '2026-04-01T00:00:00.000Z' },
  ],
  ratings: [
    { trackKind: 'entry', trackId: 'book-1', category: 'book', sentiment: 'liked', position: 0, ratedAt: '2026-03-21T00:00:00.000Z' },
    { trackKind: 'entry', trackId: 'movie-1', category: 'movie', sentiment: 'fine', position: 0, ratedAt: '2026-04-02T00:00:00.000Z' },
  ],
});

/** Every test here is a scenario: a trigger injects the mid-apply failure. */
export const NOT_A_SCENARIO: string[] = [];

export const scenarios: Scenario[] = [
  {
    name: 'a failure part-way through applying a backup rolls the library back',
    steps: [
      dune,
      add({ title: 'Solaris', category: 'book', count: 1 }),
      { call: 'sql', args: ["CREATE TRIGGER boom BEFORE INSERT ON entry WHEN NEW.title = 'Ubik' BEGIN SELECT RAISE(ABORT, 'boom'); END"] },
      importText(payload({ entries: [entry({ id: 'e1', title: 'Dracula' }), entry({ id: 'e2', title: 'Ubik' })] })),
      list('backlog'),
    ],
  },
  {
    name: 'a library survives an export/import round trip',
    steps: [add({ title: 'Berserk', category: 'manga', count: 2 }), exportStep, { call: 'deleteTrack', args: [{ $ref: 0 }] }, importRef(1), list('backlog')],
  },
  {
    name: "a show's season breakdown survives an export/import round trip",
    steps: [
      {
        call: 'createSeriesTrack',
        args: [
          {
            title: 'House',
            mediaType: 'show',
            unitLabel: 'episode',
            entries: [{ ordinal: 1, title: 'Episode 1' }, { ordinal: 2, title: 'Episode 2' }],
            seasons: [{ number: 1, episodeCount: 2 }],
          },
          NOW,
        ],
      },
      exportStep,
      importRef(1),
      list('backlog'),
    ],
  },
  {
    name: 'a series with no season data round-trips to seasons: null, same as today',
    steps: [add({ title: 'Berserk', category: 'manga', count: 2 }), exportStep, importRef(1), list('backlog')],
  },
  {
    name: 'import replaces the existing library rather than merging',
    steps: [add({ title: 'Berserk', category: 'manga', count: 1 }), exportStep, dune, importRef(1), list('backlog')],
  },
  { name: 'malformed JSON is rejected and leaves the library untouched', steps: [dune, importText('{ not json'), list('backlog')] },
  {
    name: 'a payload with an invalid status is rejected before any write',
    steps: rejectedKeepsDune(payload({ entries: [entry({ id: 'x', title: 'Bad', status: 'reading' })] })),
  },
  {
    name: 'a standalone movie marked in_progress is rejected: it has no in_progress state',
    steps: rejectedKeepsDune(payload({ entries: [entry({ title: 'Arrival', mediaType: 'movie', status: 'in_progress' })] })),
  },
  {
    name: 'an episode marked in_progress imports fine — a series child does have in_progress',
    steps: [
      importText(
        payload({
          series: [series({ id: 's1', title: 'Twin Peaks', mediaType: 'show', unitLabel: 'episode' })],
          entries: [entry({ seriesId: 's1', title: 'Episode 1', ordinal: 1, mediaType: 'episode', status: 'in_progress' })],
        }),
      ),
      list('currently'),
    ],
  },
  { name: 'a standalone entry survives an export/import round trip', steps: [dune, exportStep, importRef(1), list('backlog')] },
  {
    name: 'an entry pointing at a series that is not in the payload is rejected',
    steps: [importText(payload({ entries: [entry({ seriesId: 'missing' })] }))],
  },
  { name: 'an unknown series media type is rejected', steps: [importText(payload({ series: [series({ mediaType: 'podcast' })] }))] },
  { name: 'an unknown unit label is rejected', steps: [importText(payload({ series: [series({ unitLabel: 'chapter' })] }))] },
  {
    name: 'duplicate ids are rejected before the transaction opens',
    steps: [
      dune,
      importText(payload({ entries: [entry({ id: 'e1' }), entry({ id: 'e1' })] })),
      importText(payload({ series: [series({ id: 's1' }), series({ id: 's1' })] })),
      list('backlog'),
    ],
  },
  {
    name: 'an empty library exports to a payload that imports cleanly',
    steps: [exportStep, dune, importRef(0), list('backlog'), list('currently'), list('done')],
  },
  { name: 'a parentless entry typed as a unit label is rejected', steps: rejectedKeepsDune(payload({ entries: [entry({ mediaType: 'episode' })] })) },
  {
    name: 'a child whose media type disagrees with its series unit label is rejected',
    steps: rejectedKeepsDune(payload({ series: [series({ id: 's1' })], entries: [entry({ seriesId: 's1', ordinal: 1, mediaType: 'episode' })] })),
  },
  {
    name: 'a non-ISO createdAt is rejected — it would corrupt every sort order',
    steps: rejectedKeepsDune(payload({ entries: [entry({ createdAt: 'not-a-date' })] })),
  },
  {
    name: 'a negative fractional ordinal is rejected',
    steps: rejectedKeepsDune(payload({ series: [series({ id: 's1' })], entries: [entry({ seriesId: 's1', mediaType: 'volume', ordinal: -4.5 })] })),
  },
  {
    name: 'bad startedAt, finishedAt and series createdAt are all rejected',
    steps: [
      dune,
      importText(payload({ entries: [entry({ startedAt: 'yesterday', status: 'in_progress' })] })),
      importText(payload({ entries: [entry({ finishedAt: 'soon', status: 'done' })] })),
      importText(payload({ series: [series({ createdAt: 'whenever' })] })),
      list('backlog'),
    ],
  },
  {
    name: 'a backup with an unsafe ordinal, rating position or season count is rejected',
    steps: [
      dune,
      importText(payload({ series: [series({ id: 's1' })], entries: [entry({ seriesId: 's1', mediaType: 'volume', ordinal: 1e19 })] })),
      importText(payload({ series: [series({ seasons: [{ number: 1.5, episodeCount: 2 }] })] })),
      importText(
        JSON.stringify({
          version: 1,
          series: [],
          entries: [entry({ id: 'e1' })],
          ratings: [{ trackKind: 'entry', trackId: 'e1', category: 'book', sentiment: 'liked', position: 1e19, ratedAt: NOW }],
        }),
      ),
      list('backlog'),
    ],
  },
  {
    name: 'A22 metadata in backups: metadata survives an export/import round trip',
    steps: [
      add(
        {
          title: 'Saga, Volume 1',
          category: 'comic',
          count: 1,
          standalone: true,
          externalSource: 'google-books',
          match: { id: 'gb9', title: 'Saga, Volume 1', category: 'comic', count: 1 },
          metadata: { coverUrl: 'https://x/saga.jpg', creator: 'Brian K. Vaughan', description: 'Space opera.', releaseYear: '2012', genres: ['Science Fiction'] },
        },
        T0,
      ),
      exportStep,
      importRef(1),
      { call: 'query', args: ['SELECT * FROM entry ORDER BY rowid'] },
    ],
  },
  {
    name: 'A22 metadata in backups: a backup from before A22 imports with empty metadata',
    steps: [
      importText(payload({ entries: [entry({ id: 'e1', title: 'Dune', createdAt: T0 })] })),
      { call: 'query', args: ['SELECT * FROM entry ORDER BY rowid'] },
    ],
  },

  // --- Iris parity (Review Focus 2): a TS backup imports on iOS and round-trips ---
  {
    name: 'Iris parity: a TS backup imports and round-trips',
    steps: [importText(CROSS_PLATFORM_BACKUP), exportStep, list('backlog'), list('currently'), list('done'), { call: 'listRanking', args: ['book'] }],
  },
  {
    name: 'Iris parity: backup shape errors carry the TS messages',
    steps: [
      importText('[]'),
      importText(JSON.stringify({ version: 2, series: [], entries: [] })),
      importText(JSON.stringify({ version: 1, series: [] })),
      importText(JSON.stringify({ version: 1, series: [], entries: [], ratings: {} })),
      importText(payload({ series: [series({ seasons: [{ number: 1 }] })] })),
      importText(payload({ entries: [entry({ genres: ['ok', 3] })] })),
      importText(payload({ entries: [entry({ ordinal: 'one' })] })),
      importText(payload({ entries: [entry({ title: 7 })] })),
    ],
  },
];
