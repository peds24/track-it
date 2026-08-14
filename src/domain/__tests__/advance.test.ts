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

test('a watch-mode entry skips in_progress entirely', () => {
  const result = advance(entry({ mediaType: 'episode' }), NOW);
  expect(result.status).toBe('done');
  expect(result.startedAt).toBe(NOW);
  expect(result.finishedAt).toBe(NOW);
});

test('advancing a finished entry throws', () => {
  expect(() => advance(entry({ status: 'done' }), NOW)).toThrow(/already done/);
});

test('advance does not mutate its input', () => {
  const original = entry();
  advance(original, NOW);
  expect(original.status).toBe('unstarted');
});
