import type { TrackSummary } from '@/data/trackRepo';
import type { FixtureCase } from '../types';

// Row text from src/ui/trackLabels.ts and src/ui/completionMessage.ts, the
// branches src/ui/__tests__/TrackRow.test.tsx describes. Inputs only; the
// expectations are recorded from TS.
function t(over: Partial<TrackSummary>): TrackSummary {
  return {
    kind: 'series', id: 's1', title: 'Severance', category: 'show', shelf: 'currently', createdAt: '2026-08-12T10:00:00.000Z',
    progress: { done: 3, total: 10 }, ongoing: false, paused: false, seasons: null, nextEntryStatus: 'unstarted',
    nextEntryId: 'e4', nextEntryTitle: 'Episode 4', lastAdvancedAt: null, completionDrops: null, ...over,
  };
}
const SEASONS = [{ number: 1, episodeCount: 9 }, { number: 2, episodeCount: 10 }];
const finished = { shelf: 'done', nextEntryId: null, nextEntryTitle: null, nextEntryStatus: null } as const;

const tracks: [string, TrackSummary][] = [
  ['a watching show', t({})],
  ['a reading series, next unstarted', t({ category: 'manga', title: 'One Piece', nextEntryTitle: 'Volume 31' })],
  ['a reading series, next in progress', t({ category: 'manga', title: 'One Piece', nextEntryStatus: 'in_progress', nextEntryTitle: 'Volume 31' })],
  ['a standalone book in progress', t({ kind: 'entry', category: 'book', title: 'Dune', progress: null, nextEntryStatus: 'in_progress', nextEntryTitle: 'Dune' })],
  ['a standalone movie in backlog', t({ kind: 'entry', category: 'movie', title: 'Arrival', shelf: 'backlog', progress: null, nextEntryId: 'm1', nextEntryTitle: 'Arrival' })],
  ['a backlog show, not started', t({ shelf: 'backlog', progress: { done: 0, total: 10 }, nextEntryTitle: 'Episode 1' })],
  ['a paused series with progress', t({ shelf: 'backlog', paused: true, category: 'manga', title: 'One Piece', progress: { done: 30, total: 108 }, nextEntryTitle: 'Volume 31' })],
  ['a paused standalone', t({ kind: 'entry', shelf: 'backlog', paused: true, category: 'book', title: 'Dune', progress: null, nextEntryTitle: 'Dune' })],
  ['a show with seasons, watching', t({ seasons: SEASONS, progress: { done: 13, total: 19 }, nextEntryTitle: 'Episode 14' })],
  ['a paused show with seasons', t({ seasons: SEASONS, progress: { done: 13, total: 19 }, shelf: 'backlog', paused: true, nextEntryTitle: 'Episode 14' })],
  ['an unstarted backlog show with seasons', t({ seasons: SEASONS, progress: { done: 0, total: 19 }, shelf: 'backlog', nextEntryTitle: 'Episode 1' })],
  ['an ongoing comic about to drop a unit', t({ category: 'comic', title: 'Saga', ongoing: true, progress: { done: 66, total: 67 }, nextEntryTitle: 'Issue 67', completionDrops: 'Issue 67' })],
  ['an ongoing comic with nothing to drop', t({ category: 'comic', title: 'Saga', ongoing: true, progress: { done: 66, total: 67 }, nextEntryStatus: 'in_progress', nextEntryTitle: 'Issue 67' })],
  ['a finished series', t({ ...finished, progress: { done: 10, total: 10 } })],
  ['a finished book', t({ ...finished, kind: 'entry', category: 'book', title: 'Dune', progress: null })],
  ['a finished movie', t({ ...finished, kind: 'entry', category: 'movie', title: 'Arrival', progress: null })],
  ['a series with no total', t({ progress: { done: 0, total: 0 } })],
  ['a title with an apostrophe and emoji', t({ title: 'Bob’s Burgers 🍔', nextEntryTitle: 'Episode 1' })],
];

const each = (fn: string) => tracks.map(([name, track]): FixtureCase => ({ name: `${fn}: ${name}`, fn, args: [track] }));

export const cases: FixtureCase[] = [
  ...(['show', 'movie', 'book', 'comic', 'manga'] as const).map((c): FixtureCase => ({ name: `verbFor: ${c}`, fn: 'verbFor', args: [c] })),
  ...['positionLabel', 'seasonPositionLabel', 'canEditPosition', 'rowAction', 'completionMessage'].flatMap(each),
];
