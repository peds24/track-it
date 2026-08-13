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
  test('watch-mode entries cannot be in_progress', () => {
    expect(isStatusValid('episode', 'in_progress')).toBe(false);
    expect(isStatusValid('movie', 'in_progress')).toBe(false);
  });

  test('watch-mode entries may be unstarted or done', () => {
    expect(isStatusValid('episode', 'unstarted')).toBe(true);
    expect(isStatusValid('movie', 'done')).toBe(true);
  });

  test('read-mode entries may hold any status', () => {
    expect(isStatusValid('book', 'in_progress')).toBe(true);
    expect(isStatusValid('volume', 'unstarted')).toBe(true);
    expect(isStatusValid('issue', 'done')).toBe(true);
  });
});
