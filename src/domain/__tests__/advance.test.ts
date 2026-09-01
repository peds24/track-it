import { advance, setPosition } from '@/domain/advance';
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

// A18: setting a position directly, instead of tapping forward one unit at a
// time. `episodes(n)` builds a flat, unstarted series of n children.
function episodes(count: number, over: (ordinal: number) => Partial<Entry> = () => ({})): Entry[] {
  return Array.from({ length: count }, (_, i) => {
    const ordinal = i + 1;
    return entry({
      id: `e${ordinal}`,
      seriesId: 's1',
      title: `Episode ${ordinal}`,
      ordinal,
      mediaType: 'episode',
      ...over(ordinal),
    });
  });
}

/** The children, as `setPosition` leaves them: changed rows merged back in. */
function applied(children: Entry[], target: number, now: string): Entry[] {
  const changes = new Map(setPosition(children, target, now).map((e) => [e.id, e]));
  return children.map((c) => changes.get(c.id) ?? c);
}

const LATER = '2026-08-14T10:00:00.000Z';

test('setPosition marks every unit before the target done and the target in progress', () => {
  const result = applied(episodes(9), 5, NOW);
  expect(result.slice(0, 4).map((e) => e.status)).toEqual(['done', 'done', 'done', 'done']);
  expect(result[4]!.status).toBe('in_progress');
  expect(result.slice(5).map((e) => e.status)).toEqual(['unstarted', 'unstarted', 'unstarted', 'unstarted']);
});

test('setPosition to 1 leaves nothing done', () => {
  const result = applied(episodes(9), 1, NOW);
  expect(result.filter((e) => e.status === 'done')).toHaveLength(0);
  expect(result[0]!.status).toBe('in_progress');
});

test('setPosition stamps the units it newly finishes', () => {
  const result = applied(episodes(9), 3, NOW);
  expect(result[0]!.startedAt).toBe(NOW);
  expect(result[0]!.finishedAt).toBe(NOW);
  expect(result[2]!.startedAt).toBe(NOW);
  expect(result[2]!.finishedAt).toBeNull();
});

test('setPosition keeps the original timestamps of units that were already done', () => {
  const watched = episodes(9, (o) =>
    o <= 3 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : {},
  );
  const result = applied(watched, 6, LATER);
  expect(result[0]!.finishedAt).toBe(NOW);
  expect(result[4]!.finishedAt).toBe(LATER);
});

test('setPosition backwards clears the timestamps of units it un-finishes', () => {
  const watched = episodes(9, (o) =>
    o <= 6 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : {},
  );
  const result = applied(watched, 3, LATER);
  expect(result[2]!.status).toBe('in_progress');
  expect(result[5]!.status).toBe('unstarted');
  expect(result[5]!.startedAt).toBeNull();
  expect(result[5]!.finishedAt).toBeNull();
});

test('setPosition returns only the units it actually changed', () => {
  const watched = episodes(9, (o) =>
    o < 5 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : o === 5 ? { status: 'in_progress', startedAt: NOW } : {},
  );
  expect(setPosition(watched, 5, LATER)).toEqual([]);
});

test('setPosition orders by ordinal, not by the order the rows arrive in', () => {
  const shuffled = [...episodes(9)].reverse();
  const changes = setPosition(shuffled, 5, NOW);
  const done = changes.filter((e) => e.status === 'done').map((e) => e.ordinal).sort((a, b) => a! - b!);
  expect(done).toEqual([1, 2, 3, 4]);
});

test('setPosition rejects a target the series does not have', () => {
  expect(() => setPosition(episodes(9), 10, NOW)).toThrow(/out of range/i);
  expect(() => setPosition(episodes(9), 0, NOW)).toThrow(/out of range/i);
});
