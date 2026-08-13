import { exportLibrary, importLibrary } from '@/data/backup';
import { addTrack } from '@/data/addTrack';
import { listTracks } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOW = '2026-08-12T10:00:00.000Z';

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('a library survives an export/import round trip', async () => {
  const source = await freshDb();
  await addTrack(source, { title: 'Berserk', category: 'manga', count: 2 }, NOW);
  const json = await exportLibrary(source);

  const target = await freshDb();
  await importLibrary(target, json);

  const tracks = await listTracks(target, 'backlog');
  expect(tracks).toHaveLength(1);
  expect(tracks[0]!.title).toBe('Berserk');
  expect(tracks[0]!.progress).toEqual({ done: 0, total: 2 });
});

test('import replaces the existing library rather than merging', async () => {
  const source = await freshDb();
  await addTrack(source, { title: 'Berserk', category: 'manga', count: 1 }, NOW);
  const json = await exportLibrary(source);

  const target = await freshDb();
  await addTrack(target, { title: 'Dune', category: 'book', count: 1 }, NOW);
  await importLibrary(target, json);

  const titles = (await listTracks(target, 'backlog')).map((t) => t.title);
  expect(titles).toEqual(['Berserk']);
});

test('malformed JSON is rejected and leaves the library untouched', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  await expect(importLibrary(db, '{ not json')).rejects.toThrow();
  expect(await listTracks(db, 'backlog')).toHaveLength(1);
});

test('a payload with an invalid status is rejected before any write', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  const bad = JSON.stringify({
    version: 1,
    series: [],
    entries: [
      { id: 'x', seriesId: null, title: 'Bad', ordinal: null, mediaType: 'book', status: 'reading', startedAt: null, finishedAt: null, createdAt: NOW },
    ],
  });

  await expect(importLibrary(db, bad)).rejects.toThrow(/status/i);
  const tracks = await listTracks(db, 'backlog');
  expect(tracks.map((t) => t.title)).toEqual(['Dune']);
});

// --- Fix pass: the guarantees the four tests above do not actually prove ---

/** A well-formed payload that passes every pre-transaction check. */
function payload(overrides: Partial<{ series: unknown[]; entries: unknown[] }> = {}): string {
  return JSON.stringify({ version: 1, series: [], entries: [], ...overrides });
}

function entryFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

function seriesFixture(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 's1',
    title: 'Berserk',
    mediaType: 'manga',
    unitLabel: 'volume',
    createdAt: NOW,
    externalSource: null,
    externalId: null,
    ...over,
  };
}

/**
 * Wraps a driver so that one INSERT inside the import transaction fails, which
 * is only reachable *after* the DELETEs have run. Nothing in a valid payload can
 * still fail mid-apply now that parseBackup rejects duplicate ids, so the failure
 * has to be injected at the driver seam to prove the rollback exists at all.
 */
function driverFailingOnNthEntryInsert(inner: SqlDriver, n: number): SqlDriver {
  let seen = 0;
  return {
    exec: (sql) => inner.exec(sql),
    all: (sql, params) => inner.all(sql, params),
    async run(sql, params) {
      if (sql.includes('INSERT INTO entry')) {
        seen += 1;
        if (seen === n) throw new Error('injected mid-apply failure');
      }
      await inner.run(sql, params);
    },
    transaction: (fn) => inner.transaction(fn),
  };
}

test('a failure part-way through applying a backup rolls the library back', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);
  await addTrack(db, { title: 'Solaris', category: 'book', count: 1 }, NOW);
  const before = (await listTracks(db, 'backlog')).map((t) => t.title).sort();

  // Two entries, so the failure lands after one has already been inserted.
  const json = payload({
    entries: [entryFixture({ id: 'e1', title: 'Dracula' }), entryFixture({ id: 'e2', title: 'Ubik' })],
  });

  await expect(importLibrary(driverFailingOnNthEntryInsert(db, 2), json)).rejects.toThrow(
    /injected mid-apply failure/,
  );

  const after = await listTracks(db, 'backlog');
  expect(after.map((t) => t.title).sort()).toEqual(before);
  expect(after).toHaveLength(2);
});

test('an episode marked in_progress is rejected: watch mode has no in_progress', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  const json = payload({
    series: [seriesFixture({ id: 's1', title: 'Twin Peaks', mediaType: 'show', unitLabel: 'episode' })],
    entries: [
      entryFixture({ seriesId: 's1', title: 'Episode 1', ordinal: 1, mediaType: 'episode', status: 'in_progress' }),
    ],
  });

  await expect(importLibrary(db, json)).rejects.toThrow(/not valid for a episode/);
  expect((await listTracks(db, 'backlog')).map((t) => t.title)).toEqual(['Dune']);
});

test('a standalone entry survives an export/import round trip', async () => {
  const source = await freshDb();
  await addTrack(source, { title: 'Dune', category: 'book', count: 1 }, NOW);
  const json = await exportLibrary(source);

  const target = await freshDb();
  await importLibrary(target, json);

  const tracks = await listTracks(target, 'backlog');
  expect(tracks).toHaveLength(1);
  expect(tracks[0]!.title).toBe('Dune');
  expect(tracks[0]!.kind).toBe('entry');
  expect(tracks[0]!.category).toBe('book');
});

test('an entry pointing at a series that is not in the payload is rejected', async () => {
  const db = await freshDb();
  const json = payload({ entries: [entryFixture({ seriesId: 'missing' })] });

  await expect(importLibrary(db, json)).rejects.toThrow(/missing series/);
});

test('an unknown series media type is rejected', async () => {
  const db = await freshDb();
  const json = payload({ series: [seriesFixture({ mediaType: 'podcast' })] });

  await expect(importLibrary(db, json)).rejects.toThrow(/series media type/i);
});

test('an unknown unit label is rejected', async () => {
  const db = await freshDb();
  const json = payload({ series: [seriesFixture({ unitLabel: 'chapter' })] });

  await expect(importLibrary(db, json)).rejects.toThrow(/unit label/i);
});

test('duplicate ids are rejected before the transaction opens', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  const dupEntries = payload({ entries: [entryFixture({ id: 'e1' }), entryFixture({ id: 'e1' })] });
  await expect(importLibrary(db, dupEntries)).rejects.toThrow(/duplicate entry ids/);

  const dupSeries = payload({ series: [seriesFixture({ id: 's1' }), seriesFixture({ id: 's1' })] });
  await expect(importLibrary(db, dupSeries)).rejects.toThrow(/duplicate series ids/);

  expect((await listTracks(db, 'backlog')).map((t) => t.title)).toEqual(['Dune']);
});

test('an empty library exports to a payload that imports cleanly', async () => {
  const source = await freshDb();
  const json = await exportLibrary(source);

  const target = await freshDb();
  await addTrack(target, { title: 'Dune', category: 'book', count: 1 }, NOW);
  await importLibrary(target, json);

  expect(await listTracks(target, 'backlog')).toEqual([]);
  expect(await listTracks(target, 'currently')).toEqual([]);
  expect(await listTracks(target, 'done')).toEqual([]);
});


// --- Entry invariants (domain/validate), enforced on import as well as creation ---

/** Every malformed payload must be rejected *and* leave the existing library intact. */
async function expectRejectedAndLibraryIntact(json: string, message: RegExp): Promise<void> {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, NOW);

  await expect(importLibrary(db, json)).rejects.toThrow(message);
  expect((await listTracks(db, 'backlog')).map((t) => t.title)).toEqual(['Dune']);
}

test('a parentless entry typed as a unit label is rejected', async () => {
  // Would otherwise import as category "episode" — outside the Category union,
  // so it matches no filter chip and cannot be removed without editing JSON.
  await expectRejectedAndLibraryIntact(
    payload({ entries: [entryFixture({ seriesId: null, mediaType: 'episode' })] }),
    /no parent series/,
  );
});

test('a child whose media type disagrees with its series unit label is rejected', async () => {
  // A volume-tracked manga with an "episode" child would advance under
  // watch-mode rules while labelled with read wording.
  await expectRejectedAndLibraryIntact(
    payload({
      series: [seriesFixture({ id: 's1', mediaType: 'manga', unitLabel: 'volume' })],
      entries: [entryFixture({ seriesId: 's1', ordinal: 1, mediaType: 'episode' })],
    }),
    /tracked in volumes/,
  );
});

test('a non-ISO createdAt is rejected — it would corrupt every sort order', async () => {
  await expectRejectedAndLibraryIntact(
    payload({ entries: [entryFixture({ createdAt: 'not-a-date' })] }),
    /createdAt/,
  );
});

test('a negative fractional ordinal is rejected', async () => {
  await expectRejectedAndLibraryIntact(
    payload({
      series: [seriesFixture({ id: 's1' })],
      entries: [entryFixture({ seriesId: 's1', mediaType: 'volume', ordinal: -4.5 })],
    }),
    /non-negative whole number/,
  );
});

test('bad startedAt, finishedAt and series createdAt are all rejected', async () => {
  await expectRejectedAndLibraryIntact(
    payload({ entries: [entryFixture({ startedAt: 'yesterday', status: 'in_progress' })] }),
    /startedAt/,
  );
  await expectRejectedAndLibraryIntact(
    payload({ entries: [entryFixture({ finishedAt: 'soon', status: 'done' })] }),
    /finishedAt/,
  );
  await expectRejectedAndLibraryIntact(
    payload({ series: [seriesFixture({ createdAt: 'whenever' })] }),
    /series.createdAt/,
  );
});
