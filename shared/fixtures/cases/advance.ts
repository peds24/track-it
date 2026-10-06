import type { Entry } from '@/domain/types';
import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/advance.test.ts and complete.test.ts.
// Builders are copied from those files so every arg is a concrete Entry.

const NOW = '2026-08-12T10:00:00.000Z';
const LATER = '2026-08-14T10:00:00.000Z';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'e1', seriesId: null, title: 'Test', ordinal: null, mediaType: 'book', status: 'unstarted',
    startedAt: null, finishedAt: null, createdAt: NOW, paused: false, externalSource: null, externalId: null,
    ...over,
  };
}

function episodes(count: number, over: (ordinal: number) => Partial<Entry> = () => ({})): Entry[] {
  return Array.from({ length: count }, (_, i) => {
    const ordinal = i + 1;
    return entry({ id: `e${ordinal}`, seriesId: 's1', title: `Episode ${ordinal}`, ordinal, mediaType: 'episode', ...over(ordinal) });
  });
}

const C_NOW = '2026-09-22T12:00:00.000Z';
function unit(ordinal: number, over: Partial<Entry> = {}): Entry {
  return {
    id: `e${ordinal}`, seriesId: 's1', title: `Issue ${ordinal}`, ordinal, mediaType: 'issue', status: 'unstarted',
    startedAt: null, finishedAt: null, createdAt: '2026-09-01T12:00:00.000Z', paused: false, externalSource: null, externalId: null,
    ...over,
  };
}
const T2 = '2026-09-10T12:00:00.000Z';
const one = unit(1, { status: 'done', startedAt: '2026-09-05T12:00:00.000Z', finishedAt: '2026-09-06T12:00:00.000Z' });
const two = unit(2, { status: 'done', startedAt: '2026-09-06T12:00:00.000Z', finishedAt: T2, createdAt: '2026-09-06T12:00:00.000Z' });
const appended = unit(3, { status: 'in_progress', startedAt: T2, createdAt: T2 });
const doneAtT2 = unit(3, { status: 'done', startedAt: T2, finishedAt: '2026-09-11T12:00:00.000Z', createdAt: T2 });

const adv = (name: string, e: Entry, now = NOW): FixtureCase => ({ name, fn: 'advance', args: [e, now] });
const pos = (name: string, children: Entry[], target: number, now = NOW): FixtureCase => ({ name, fn: 'setPosition', args: [children, target, now] });
const complete = (name: string, children: Entry[], ongoing: boolean): FixtureCase => ({ name, fn: 'completeUnits', args: [children, ongoing, C_NOW] });
const placeholder = (name: string, children: Entry[], ongoing: boolean): FixtureCase => ({ name, fn: 'ongoingPlaceholder', args: [children, ongoing] });

export const cases: FixtureCase[] = [
  adv('a read-mode entry advances unstarted -> in_progress and stamps startedAt', entry({ mediaType: 'book' })),
  adv('a read-mode entry advances in_progress -> done and stamps finishedAt', entry({ status: 'in_progress', startedAt: NOW }), '2026-08-13T10:00:00.000Z'),
  adv('a standalone watch-mode entry (a movie) skips in_progress entirely', entry({ mediaType: 'movie', seriesId: null })),
  adv('a watch-mode series child (an episode) advances unstarted -> in_progress and stamps startedAt', entry({ mediaType: 'episode', seriesId: 's1' })),
  adv(
    'a watch-mode series child (an episode) advances in_progress -> done and stamps finishedAt',
    entry({ mediaType: 'episode', seriesId: 's1', status: 'in_progress', startedAt: NOW }),
    '2026-08-13T10:00:00.000Z',
  ),
  adv('advancing a finished entry throws', entry({ status: 'done' })),
  adv('advance does not mutate its input (the returned entry)', entry()),
  adv('a comic collection (standalone) advances like a book', entry({ mediaType: 'comic' })),
  pos('setPosition marks every unit before the target done and the target in progress', episodes(9), 5),
  pos('setPosition to 1 leaves nothing done', episodes(9), 1),
  pos('setPosition stamps the units it newly finishes', episodes(9), 3),
  pos(
    'setPosition keeps the original timestamps of units that were already done',
    episodes(9, (o) => (o <= 3 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : {})),
    6,
    LATER,
  ),
  pos(
    'setPosition backwards clears the timestamps of units it un-finishes',
    episodes(9, (o) => (o <= 6 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : {})),
    3,
    LATER,
  ),
  pos(
    'setPosition returns only the units it actually changed',
    episodes(9, (o) => (o < 5 ? { status: 'done', startedAt: NOW, finishedAt: NOW } : o === 5 ? { status: 'in_progress', startedAt: NOW } : {})),
    5,
    LATER,
  ),
  pos('setPosition orders by ordinal, not by the order the rows arrive in', [...episodes(9)].reverse(), 5),
  pos('setPosition rejects a target the series does not have', episodes(9), 10),
  pos('setPosition rejects a target the series does not have (2)', episodes(9), 0),
  complete('every unfinished unit becomes done at now; finished units are left alone', [
    unit(1, { status: 'done', startedAt: '2026-09-02T12:00:00.000Z', finishedAt: '2026-09-03T12:00:00.000Z' }),
    unit(2, { status: 'in_progress', startedAt: '2026-09-04T12:00:00.000Z' }),
    unit(3),
  ], false),
  complete('a standalone entry completes as one unit', [{ ...unit(1), seriesId: null, ordinal: null, mediaType: 'book', title: 'Dune' }], false),
  complete('an ongoing series: drops the auto-appended placeholder created the instant its predecessor finished', [one, two, appended], true),
  complete(
    'an ongoing series: keeps a trailing unit that was not created at its predecessor finish',
    [one, two, unit(3, { status: 'in_progress', startedAt: T2, createdAt: '2026-09-01T12:00:00.000Z' })],
    true,
  ),
  complete('an ongoing series: a lone bootstrap unit is completed, never removed', [unit(1, { status: 'in_progress', startedAt: '2026-09-05T12:00:00.000Z' })], true),
  complete('a finite series never has its last unit removed, even with matching stamps', [one, two, unit(3, { createdAt: T2 })], false),
  complete('sorts children by ordinal before processing', [
    unit(3),
    unit(1, { status: 'done', startedAt: '2026-09-02T12:00:00.000Z', finishedAt: '2026-09-03T12:00:00.000Z' }),
    unit(2, { status: 'in_progress', startedAt: '2026-09-04T12:00:00.000Z' }),
  ], false),
  complete('does not remove a trailing done unit even with matching fingerprint', [one, two, doneAtT2], true),
  placeholder('names the auto-appended unit completeUnits would remove, whatever the input order', [appended, one, two], true),
  placeholder('is null for a finite series', [one, two, appended], false),
  placeholder('is null when the trailing unit was not created at its predecessor finish', [one, two, unit(3, { createdAt: '2026-09-01T12:00:00.000Z' })], true),
  placeholder('is null when the trailing unit is already done', [one, two, doneAtT2], true),
  placeholder('is null for a lone unit or no units', [unit(1, { status: 'in_progress' })], true),
  placeholder('is null for a lone unit or no units (2)', [], true),
];
