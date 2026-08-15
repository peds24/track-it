import { modeFor, isStatusValid } from '@/domain/mode';

describe('modeFor', () => {
  test.each([
    ['episode', 'watch'],
    ['movie', 'watch'],
    ['book', 'read'],
    ['issue', 'read'],
    ['volume', 'read'],
  ] as const)('%s is %s', (mediaType, expected) => {
    expect(modeFor(mediaType)).toBe(expected);
  });
});

describe('isStatusValid', () => {
  // A10: a standalone watch-mode entry (a movie) still has no in_progress
  // state — it has no next unit for a middle state to mean anything about.
  test('a standalone watch-mode entry cannot be in_progress', () => {
    expect(isStatusValid('movie', 'in_progress', false)).toBe(false);
  });

  test('a standalone watch-mode entry may be unstarted or done', () => {
    expect(isStatusValid('movie', 'unstarted', false)).toBe(true);
    expect(isStatusValid('movie', 'done', false)).toBe(true);
  });

  // A10: a watch-mode series child (an episode) is consistent with a
  // read-mode series child (A5/A7) — its granularity comes from its position
  // in the series, not from its mode.
  test('a watch-mode series child may be in_progress', () => {
    expect(isStatusValid('episode', 'in_progress', true)).toBe(true);
  });

  test('a watch-mode series child may also be unstarted or done', () => {
    expect(isStatusValid('episode', 'unstarted', true)).toBe(true);
    expect(isStatusValid('episode', 'done', true)).toBe(true);
  });

  test('read-mode entries may hold any status, series child or not', () => {
    expect(isStatusValid('book', 'in_progress', false)).toBe(true);
    expect(isStatusValid('volume', 'unstarted', true)).toBe(true);
    expect(isStatusValid('issue', 'done', true)).toBe(true);
  });
});
