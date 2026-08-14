import { shelfForEntry, shelfForSeries, progressFor, nextEntry } from '@/domain/shelf';
import type { Entry, EntryMediaType, Status } from '@/domain/types';

function child(
  ordinal: number,
  status: Status,
  mediaType: EntryMediaType = 'episode',
  paused = false,
): Entry {
  return {
    id: `e${ordinal}`,
    seriesId: 's1',
    title: `#${ordinal}`,
    ordinal,
    mediaType,
    status,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-08-12T10:00:00.000Z',
    paused,
  };
}

describe('shelfForEntry', () => {
  test.each([
    ['unstarted', 'backlog'],
    ['in_progress', 'currently'],
    ['done', 'done'],
  ] as const)('%s -> %s', (status, expected) => {
    expect(shelfForEntry(child(1, status, 'book'))).toBe(expected);
  });

  test('A6: a paused entry reads as backlog even mid-way through', () => {
    expect(shelfForEntry(child(1, 'in_progress', 'book', true))).toBe('backlog');
  });

  test('A6: done wins over paused — there is nothing left to resume', () => {
    expect(shelfForEntry(child(1, 'done', 'book', true))).toBe('done');
  });
});

describe('shelfForSeries', () => {
  test('no children done and none in progress is backlog', () => {
    expect(shelfForSeries([child(1, 'unstarted'), child(2, 'unstarted')])).toBe('backlog');
  });

  test('some done and some not is currently', () => {
    expect(shelfForSeries([child(1, 'done'), child(2, 'unstarted')])).toBe('currently');
  });

  test('all done is done', () => {
    expect(shelfForSeries([child(1, 'done'), child(2, 'done')])).toBe('done');
  });

  test('a read-mode child in progress is currently even with nothing done', () => {
    const volumes = [child(1, 'in_progress', 'volume'), child(2, 'unstarted', 'volume')];
    expect(shelfForSeries(volumes)).toBe('currently');
  });

  test('a series with no children is backlog', () => {
    expect(shelfForSeries([])).toBe('backlog');
  });

  test('A6: paused pulls a part-way series back to backlog', () => {
    const children = [child(1, 'done'), child(2, 'unstarted')];
    expect(shelfForSeries(children, true)).toBe('backlog');
  });

  test('A6: paused overrides an in-progress read-mode child too', () => {
    const volumes = [child(1, 'in_progress', 'volume'), child(2, 'unstarted', 'volume')];
    expect(shelfForSeries(volumes, true)).toBe('backlog');
    expect(shelfForSeries(volumes, false)).toBe('currently');
  });

  test('A6: done wins over paused for a fully finished series', () => {
    expect(shelfForSeries([child(1, 'done'), child(2, 'done')], true)).toBe('done');
  });
});

describe('progressFor', () => {
  test('counts only done children', () => {
    expect(progressFor([child(1, 'done'), child(2, 'in_progress', 'volume'), child(3, 'unstarted')]))
      .toEqual({ done: 1, total: 3 });
  });

  test('an empty series is 0 of 0', () => {
    expect(progressFor([])).toEqual({ done: 0, total: 0 });
  });
});

describe('nextEntry', () => {
  test('returns the in-progress child first', () => {
    const children = [child(1, 'done'), child(2, 'in_progress', 'volume'), child(3, 'unstarted')];
    expect(nextEntry(children)?.ordinal).toBe(2);
  });

  test('otherwise returns the lowest-ordinal unstarted child', () => {
    const children = [child(3, 'unstarted'), child(1, 'done'), child(2, 'unstarted')];
    expect(nextEntry(children)?.ordinal).toBe(2);
  });

  test('returns null when everything is done', () => {
    expect(nextEntry([child(1, 'done')])).toBeNull();
  });
});
