import { advance } from '@/domain/advance';
import type { Entry } from '@/domain/types';

const NOW = '2026-08-12T10:00:00.000Z';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    seriesId: null,
    title: 'Test',
    ordinal: null,
    mediaType: 'book',
    status: 'unstarted',
    startedAt: null,
    finishedAt: null,
    createdAt: NOW,
    paused: false,
    externalSource: null,
    externalId: null,
    ...over,
  };
}

test('a read-mode entry advances unstarted -> in_progress and stamps startedAt', () => {
  const result = advance(entry({ mediaType: 'book' }), NOW);
  expect(result.status).toBe('in_progress');
  expect(result.startedAt).toBe(NOW);
  expect(result.finishedAt).toBeNull();
});

test('a read-mode entry advances in_progress -> done and stamps finishedAt', () => {
  const started = entry({ status: 'in_progress', startedAt: NOW });
  const result = advance(started, '2026-08-13T10:00:00.000Z');
  expect(result.status).toBe('done');
  expect(result.finishedAt).toBe('2026-08-13T10:00:00.000Z');
  expect(result.startedAt).toBe(NOW);
});

// A10: a standalone watch-mode entry (a movie) has no series to belong to and
// no next unit to reveal, so D2's original binary rule still applies to it
// exactly as it always did.
test('a standalone watch-mode entry (a movie) skips in_progress entirely', () => {
  const result = advance(entry({ mediaType: 'movie', seriesId: null }), NOW);
  expect(result.status).toBe('done');
  expect(result.startedAt).toBe(NOW);
  expect(result.finishedAt).toBe(NOW);
});

// A10: a watch-mode series child (an episode) is now consistent with a
// read-mode series child (A5/A7) — its granularity comes from its position in
// the series, not from its mode.
test('a watch-mode series child (an episode) advances unstarted -> in_progress and stamps startedAt', () => {
  const result = advance(entry({ mediaType: 'episode', seriesId: 's1' }), NOW);
  expect(result.status).toBe('in_progress');
  expect(result.startedAt).toBe(NOW);
  expect(result.finishedAt).toBeNull();
});

test('a watch-mode series child (an episode) advances in_progress -> done and stamps finishedAt', () => {
  const started = entry({
    mediaType: 'episode',
    seriesId: 's1',
    status: 'in_progress',
    startedAt: NOW,
  });
  const result = advance(started, '2026-08-13T10:00:00.000Z');
  expect(result.status).toBe('done');
  expect(result.finishedAt).toBe('2026-08-13T10:00:00.000Z');
  expect(result.startedAt).toBe(NOW);
});

test('advancing a finished entry throws', () => {
  expect(() => advance(entry({ status: 'done' }), NOW)).toThrow(/already done/);
});

test('advance does not mutate its input', () => {
  const original = entry();
  advance(original, NOW);
  expect(original.status).toBe('unstarted');
});
