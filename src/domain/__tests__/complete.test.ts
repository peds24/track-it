import { completeUnits } from '@/domain/advance';
import type { Entry } from '@/domain/types';

const NOW = '2026-09-22T12:00:00.000Z';

function unit(ordinal: number, over: Partial<Entry> = {}): Entry {
  return {
    id: `e${ordinal}`,
    seriesId: 's1',
    title: `Issue ${ordinal}`,
    ordinal,
    mediaType: 'issue',
    status: 'unstarted',
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-09-01T12:00:00.000Z',
    paused: false,
    externalSource: null,
    externalId: null,
    ...over,
  };
}

test('every unfinished unit becomes done at now; finished units are left alone', () => {
  const done = unit(1, { status: 'done', startedAt: '2026-09-02T12:00:00.000Z', finishedAt: '2026-09-03T12:00:00.000Z' });
  const reading = unit(2, { status: 'in_progress', startedAt: '2026-09-04T12:00:00.000Z' });
  const untouched = unit(3);

  const { updated, removedIds } = completeUnits([done, reading, untouched], false, NOW);

  expect(removedIds).toEqual([]);
  expect(updated).toEqual([
    { ...reading, status: 'done', startedAt: '2026-09-04T12:00:00.000Z', finishedAt: NOW },
    { ...untouched, status: 'done', startedAt: NOW, finishedAt: NOW },
  ]);
});

test('a standalone entry completes as one unit', () => {
  const book: Entry = { ...unit(1), seriesId: null, ordinal: null, mediaType: 'book', title: 'Dune' };
  const { updated } = completeUnits([book], false, NOW);
  expect(updated).toEqual([{ ...book, status: 'done', startedAt: NOW, finishedAt: NOW }]);
});

describe('an ongoing series', () => {
  const T2 = '2026-09-10T12:00:00.000Z';
  const one = unit(1, { status: 'done', startedAt: '2026-09-05T12:00:00.000Z', finishedAt: '2026-09-06T12:00:00.000Z' });
  const two = unit(2, { status: 'done', startedAt: '2026-09-06T12:00:00.000Z', finishedAt: T2, createdAt: '2026-09-06T12:00:00.000Z' });

  test('drops the auto-appended placeholder created the instant its predecessor finished', () => {
    const appended = unit(3, { status: 'in_progress', startedAt: T2, createdAt: T2 });
    const { updated, removedIds } = completeUnits([one, two, appended], true, NOW);
    expect(removedIds).toEqual(['e3']);
    expect(updated).toEqual([]);
  });

  test('keeps a trailing unit that was not created at its predecessor finish', () => {
    const later = unit(3, { status: 'in_progress', startedAt: T2, createdAt: '2026-09-01T12:00:00.000Z' });
    const { updated, removedIds } = completeUnits([one, two, later], true, NOW);
    expect(removedIds).toEqual([]);
    expect(updated.map((u) => u.id)).toEqual(['e3']);
  });

  test('a lone bootstrap unit is completed, never removed', () => {
    const only = unit(1, { status: 'in_progress', startedAt: '2026-09-05T12:00:00.000Z' });
    const { updated, removedIds } = completeUnits([only], true, NOW);
    expect(removedIds).toEqual([]);
    expect(updated.map((u) => u.status)).toEqual(['done']);
  });

  test('a finite series never has its last unit removed, even with matching stamps', () => {
    const appended = unit(3, { createdAt: T2 });
    const { removedIds } = completeUnits([one, two, appended], false, NOW);
    expect(removedIds).toEqual([]);
  });

  test('sorts children by ordinal before processing', () => {
    const three = unit(3);
    const done = unit(1, { status: 'done', startedAt: '2026-09-02T12:00:00.000Z', finishedAt: '2026-09-03T12:00:00.000Z' });
    const two = unit(2, { status: 'in_progress', startedAt: '2026-09-04T12:00:00.000Z' });
    const { updated, removedIds } = completeUnits([three, done, two], false, NOW);
    expect(removedIds).toEqual([]);
    expect(updated.map((u) => u.id)).toEqual(['e2', 'e3']);
  });

  test('does not remove a trailing done unit even with matching fingerprint', () => {
    const alreadyDone = unit(3, { status: 'done', startedAt: T2, finishedAt: '2026-09-11T12:00:00.000Z', createdAt: T2 });
    const { updated, removedIds } = completeUnits([one, two, alreadyDone], true, NOW);
    expect(removedIds).toEqual([]);
    expect(updated).toEqual([]);
  });
});
