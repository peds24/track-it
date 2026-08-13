import { migrate } from '@/db/schema';
import { createSeriesTrack, createStandaloneTrack, listTracks, toEntry } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { advance } from '@/domain/advance';
import type { Entry } from '@/domain/types';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb(): Promise<SqlDriver> {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('creating a series track writes the series and all its entries', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Berserk',
      mediaType: 'manga',
      unitLabel: 'volume',
      entries: [
        { ordinal: 1, title: 'Volume 1' },
        { ordinal: 2, title: 'Volume 2' },
      ],
    },
    NOW,
  );

  const entries = await db.all<{ title: string }>('SELECT title FROM entry ORDER BY ordinal');
  expect(entries.map((e) => e.title)).toEqual(['Volume 1', 'Volume 2']);
});

test('a newly created series track lands in the backlog', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    { title: 'Severance', mediaType: 'show', unitLabel: 'episode', entries: [{ ordinal: 1, title: 'Episode 1' }] },
    NOW,
  );

  const backlog = await listTracks(db, 'backlog');
  expect(backlog).toHaveLength(1);
  expect(backlog[0]!.title).toBe('Severance');
  expect(backlog[0]!.progress).toEqual({ done: 0, total: 1 });
  expect(backlog[0]!.nextEntryTitle).toBe('Episode 1');
});

test('a standalone book is created with no series row', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  const backlog = await listTracks(db, 'backlog');
  expect(backlog[0]).toMatchObject({ kind: 'entry', title: 'Dune', category: 'book', progress: null });
});

test('listTracks filters by category', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);

  const books = await listTracks(db, 'backlog', 'book');
  expect(books.map((t) => t.title)).toEqual(['Dune']);
});

test('listTracks sorts by date added, newest first', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Older', category: 'book' }, '2026-08-01T00:00:00.000Z');
  await createStandaloneTrack(db, { title: 'Newer', category: 'book' }, '2026-08-10T00:00:00.000Z');

  const backlog = await listTracks(db, 'backlog');
  expect(backlog.map((t) => t.title)).toEqual(['Newer', 'Older']);
});

/**
 * Every field gets a distinct, recognisable value — the two timestamps most of all —
 * so a swapped snake_case -> camelCase mapping fails loudly instead of silently.
 */
test('toEntry maps every column to its own domain field', () => {
  const entry = toEntry({
    id: 'entry-id',
    series_id: 'series-id',
    title: 'Episode 7',
    ordinal: 7,
    media_type: 'episode',
    status: 'done',
    started_at: '2026-01-01T00:00:00.000Z',
    finished_at: '2026-02-02T00:00:00.000Z',
    created_at: '2026-03-03T00:00:00.000Z',
  });

  const expected: Entry = {
    id: 'entry-id',
    seriesId: 'series-id',
    title: 'Episode 7',
    ordinal: 7,
    mediaType: 'episode',
    status: 'done',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-02-02T00:00:00.000Z',
    createdAt: '2026-03-03T00:00:00.000Z',
  };

  expect(entry).toEqual(expected);
});

/** Wraps a driver so that the Nth `run` call throws, leaving everything else intact. */
function failingOnRun(inner: SqlDriver, failOnCall: number): SqlDriver {
  let calls = 0;
  return {
    async exec(sql: string): Promise<void> {
      await inner.exec(sql);
    },
    async all<T>(sql: string, params?: readonly unknown[]): Promise<T[]> {
      return inner.all<T>(sql, params);
    },
    async run(sql: string, params?: readonly unknown[]): Promise<void> {
      calls += 1;
      if (calls === failOnCall) throw new Error('simulated write failure');
      await inner.run(sql, params);
    },
    async transaction(fn: () => Promise<void>): Promise<void> {
      await inner.transaction(fn);
    },
  };
}

test('a series that fails partway through its entries persists nothing', async () => {
  const db = await freshDb();
  // Call 1 is the series insert, calls 2..4 are the three entries: fail in the middle.
  const flaky = failingOnRun(db, 3);

  await expect(
    createSeriesTrack(
      flaky,
      {
        title: 'Severance',
        mediaType: 'show',
        unitLabel: 'episode',
        entries: [
          { ordinal: 1, title: 'Episode 1' },
          { ordinal: 2, title: 'Episode 2' },
          { ordinal: 3, title: 'Episode 3' },
        ],
      },
      NOW,
    ),
  ).rejects.toThrow('simulated write failure');

  const seriesCount = await db.all<{ n: number }>('SELECT count(*) AS n FROM series');
  const entryCount = await db.all<{ n: number }>('SELECT count(*) AS n FROM entry');
  expect(seriesCount[0]!.n).toBe(0);
  expect(entryCount[0]!.n).toBe(0);
});

test('listTracks excludes tracks that are on another shelf', async () => {
  const db = await freshDb();
  // Read mode, so one advance lands on in_progress -> 'currently' rather than 'done'.
  await createSeriesTrack(
    db,
    { title: 'Berserk', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: 1, title: 'Volume 1' }] },
    NOW,
  );
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);

  const rows = await db.all<Parameters<typeof toEntry>[0]>(
    'SELECT * FROM entry WHERE series_id IS NOT NULL',
  );
  const advanced = advance(toEntry(rows[0]!), NOW);
  await db.run('UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?', [
    advanced.status,
    advanced.startedAt,
    advanced.finishedAt,
    advanced.id,
  ]);

  expect((await listTracks(db, 'backlog')).map((t) => t.title)).toEqual(['Dune']);
  expect((await listTracks(db, 'currently')).map((t) => t.title)).toEqual(['Berserk']);
});

/** Advances the entry with the given id once, through the real domain transition. */
async function advanceEntry(db: SqlDriver, entryId: string): Promise<void> {
  const rows = await db.all<Parameters<typeof toEntry>[0]>('SELECT * FROM entry WHERE id = ?', [
    entryId,
  ]);
  const advanced = advance(toEntry(rows[0]!), NOW);
  await db.run('UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?', [
    advanced.status,
    advanced.startedAt,
    advanced.finishedAt,
    advanced.id,
  ]);
}

test('a finished standalone book has nothing left to advance', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  await advanceEntry(db, id); // unstarted -> in_progress
  await advanceEntry(db, id); // in_progress -> done

  const done = await listTracks(db, 'done');
  expect(done).toHaveLength(1);
  expect(done[0]!.nextEntryId).toBeNull();
  expect(done[0]!.nextEntryTitle).toBeNull();
});

test('a finished standalone movie has nothing left to advance', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Arrival', category: 'movie' }, NOW);
  await advanceEntry(db, id); // watch mode: unstarted -> done in one step

  const done = await listTracks(db, 'done');
  expect(done).toHaveLength(1);
  expect(done[0]!.nextEntryId).toBeNull();
  expect(done[0]!.nextEntryTitle).toBeNull();
});

test('a standalone book in progress still points at itself to advance', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  await advanceEntry(db, id); // unstarted -> in_progress

  const currently = await listTracks(db, 'currently');
  expect(currently).toHaveLength(1);
  expect(currently[0]!.nextEntryId).toBe(id);
  expect(currently[0]!.nextEntryTitle).toBe('Dune');
});

/** The two track kinds must agree on what a null next entry means. */
test('a fully completed series also reports nothing left to advance', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
    },
    NOW,
  );

  const rows = await db.all<{ id: string }>('SELECT id FROM entry ORDER BY ordinal');
  for (const row of rows) {
    await advanceEntry(db, row.id); // watch mode: straight to done
  }

  const done = await listTracks(db, 'done');
  expect(done).toHaveLength(1);
  expect(done[0]!.kind).toBe('series');
  expect(done[0]!.nextEntryId).toBeNull();
  expect(done[0]!.nextEntryTitle).toBeNull();
});

/** Advances an entry at a caller-chosen instant, so ordering can be observed. */
async function advanceAt(db: SqlDriver, entryId: string, now: string): Promise<void> {
  const rows = await db.all<Parameters<typeof toEntry>[0]>('SELECT * FROM entry WHERE id = ?', [
    entryId,
  ]);
  const advanced = advance(toEntry(rows[0]!), now);
  await db.run('UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?', [
    advanced.status,
    advanced.startedAt,
    advanced.finishedAt,
    advanced.id,
  ]);
}

/**
 * D12: the thing you touched last session sits at the top next session. The
 * earlier-added track was advanced more recently, so a createdAt sort puts it
 * last — this is the case that discriminates the two orderings.
 */
test('Currently is ordered by most recently advanced, not by date added', async () => {
  const db = await freshDb();
  const older = await createStandaloneTrack(
    db,
    { title: 'Older', category: 'book' },
    '2026-08-01T00:00:00.000Z',
  );
  const newer = await createStandaloneTrack(
    db,
    { title: 'Newer', category: 'book' },
    '2026-08-10T00:00:00.000Z',
  );

  await advanceAt(db, newer, '2026-08-11T00:00:00.000Z');
  await advanceAt(db, older, '2026-08-12T00:00:00.000Z');

  const currently = await listTracks(db, 'currently');
  expect(currently.map((t) => t.title)).toEqual(['Older', 'Newer']);
});

/** D9: the backlog is ordered by date added, and advancing elsewhere must not disturb it. */
test('backlog ordering stays by date added even when another track is advanced', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Older', category: 'book' }, '2026-08-01T00:00:00.000Z');
  await createStandaloneTrack(db, { title: 'Newer', category: 'book' }, '2026-08-10T00:00:00.000Z');
  const middle = await createStandaloneTrack(
    db,
    { title: 'Middle', category: 'book' },
    '2026-08-05T00:00:00.000Z',
  );

  await advanceAt(db, middle, '2026-08-12T00:00:00.000Z'); // moves Middle to Currently

  const backlog = await listTracks(db, 'backlog');
  expect(backlog.map((t) => t.title)).toEqual(['Newer', 'Older']);
});

/** A track can sit in Currently with no timestamps: a series with one done child and one unstarted. */
test('a Currently track with no advance timestamps sorts after ones that have them', async () => {
  const db = await freshDb();

  await createSeriesTrack(
    db,
    {
      title: 'Untouched',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
      ],
    },
    '2026-08-20T00:00:00.000Z',
  );
  const rows = await db.all<{ id: string }>(
    'SELECT id FROM entry WHERE series_id IS NOT NULL ORDER BY ordinal',
  );
  await advanceAt(db, rows[0]!.id, '2026-08-21T00:00:00.000Z');
  // Blank the timestamps: shelf stays 'currently' (1 of 2 done) but nothing is dated.
  await db.run('UPDATE entry SET started_at = NULL, finished_at = NULL WHERE id = ?', [
    rows[0]!.id,
  ]);

  const dated = await createStandaloneTrack(
    db,
    { title: 'Dated', category: 'book' },
    '2026-08-01T00:00:00.000Z',
  );
  await advanceAt(db, dated, '2026-08-02T00:00:00.000Z');

  const currently = await listTracks(db, 'currently');
  expect(currently.map((t) => t.title)).toEqual(['Dated', 'Untouched']);
  expect(currently[1]!.lastAdvancedAt).toBeNull();
});

/** The maximum across children, not the first or the last one. */
test('a series reports the latest advance across all of its children', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Severance',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [
        { ordinal: 1, title: 'Episode 1' },
        { ordinal: 2, title: 'Episode 2' },
        { ordinal: 3, title: 'Episode 3' },
        { ordinal: 4, title: 'Episode 4' },
      ],
    },
    NOW,
  );
  const rows = await db.all<{ id: string }>('SELECT id FROM entry ORDER BY ordinal');

  // Out of ordinal order, and the maximum is neither the first nor the last advanced.
  await advanceAt(db, rows[0]!.id, '2026-08-13T00:00:00.000Z');
  await advanceAt(db, rows[2]!.id, '2026-08-19T00:00:00.000Z');
  await advanceAt(db, rows[1]!.id, '2026-08-15T00:00:00.000Z');

  const currently = await listTracks(db, 'currently');
  expect(currently).toHaveLength(1);
  expect(currently[0]!.lastAdvancedAt).toBe('2026-08-19T00:00:00.000Z');
});

/** Read mode sets startedAt only, so lastAdvancedAt must not depend on finishedAt alone. */
test('a track advanced only to in_progress reports its start as its last advance', async () => {
  const db = await freshDb();
  const id = await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  await advanceAt(db, id, '2026-08-14T00:00:00.000Z');

  const currently = await listTracks(db, 'currently');
  expect(currently[0]!.lastAdvancedAt).toBe('2026-08-14T00:00:00.000Z');
});

// --- Entry invariants enforced at creation (domain/validate) ---

test('creating a series track with a bad ordinal writes nothing', async () => {
  const db = await freshDb();

  await expect(
    createSeriesTrack(
      db,
      { title: 'Berserk', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: -4.5, title: 'Volume ?' }] },
      NOW,
    ),
  ).rejects.toThrow(/non-negative whole number/);

  // Rejected before the transaction opens, so not even the series row exists.
  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
  expect(await db.all('SELECT id FROM entry')).toHaveLength(0);
});

test('creating a track with a non-ISO timestamp is rejected', async () => {
  const db = await freshDb();

  await expect(
    createStandaloneTrack(db, { title: 'Dune', category: 'book' }, 'not-a-date'),
  ).rejects.toThrow(/createdAt/);
  expect(await db.all('SELECT id FROM entry')).toHaveLength(0);

  await expect(
    createSeriesTrack(
      db,
      { title: 'Berserk', mediaType: 'manga', unitLabel: 'volume', entries: [{ ordinal: 1, title: 'Volume 1' }] },
      'not-a-date',
    ),
  ).rejects.toThrow(/createdAt/);
  expect(await db.all('SELECT id FROM series')).toHaveLength(0);
});

test('listTracks skips a parentless row whose media type is a unit label', async () => {
  const db = await freshDb();
  await createStandaloneTrack(db, { title: 'Dune', category: 'book' }, NOW);
  // Written straight to SQL: no supported path can produce this any more, but a
  // row left by an older build must not surface with a category outside the union.
  await db.run(
    `INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at)
     VALUES ('legacy', NULL, 'Orphan', NULL, 'episode', 'unstarted', ?)`,
    [NOW],
  );

  const backlog = await listTracks(db, 'backlog');
  expect(backlog.map((t) => t.title)).toEqual(['Dune']);
  for (const track of backlog) {
    expect(['show', 'movie', 'book', 'comic', 'manga']).toContain(track.category);
  }
});
