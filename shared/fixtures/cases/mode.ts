import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/mode.test.ts.
export const cases: FixtureCase[] = [
  ...(['episode', 'movie', 'book', 'issue', 'volume'] as const).map((mediaType) => ({
    name: `modeFor: ${mediaType}`,
    fn: 'modeFor',
    args: [mediaType],
  })),
  { name: 'a standalone watch-mode entry cannot be in_progress', fn: 'isStatusValid', args: ['movie', 'in_progress', false] },
  { name: 'a standalone watch-mode entry may be unstarted or done', fn: 'isStatusValid', args: ['movie', 'unstarted', false] },
  { name: 'a standalone watch-mode entry may be unstarted or done (2)', fn: 'isStatusValid', args: ['movie', 'done', false] },
  { name: 'a watch-mode series child may be in_progress', fn: 'isStatusValid', args: ['episode', 'in_progress', true] },
  { name: 'a watch-mode series child may also be unstarted or done', fn: 'isStatusValid', args: ['episode', 'unstarted', true] },
  { name: 'a watch-mode series child may also be unstarted or done (2)', fn: 'isStatusValid', args: ['episode', 'done', true] },
  { name: 'read-mode entries may hold any status, series child or not', fn: 'isStatusValid', args: ['book', 'in_progress', false] },
  { name: 'read-mode entries may hold any status, series child or not (2)', fn: 'isStatusValid', args: ['volume', 'unstarted', true] },
  { name: 'read-mode entries may hold any status, series child or not (3)', fn: 'isStatusValid', args: ['issue', 'done', true] },
];
