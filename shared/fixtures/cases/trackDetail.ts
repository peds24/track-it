import type { TrackSummary } from '@/data/trackRepo';
import type { FixtureCase } from '../types';

// Detail-screen text and position-editor rules from src/ui/trackDetail.ts.
// Inputs only; the expectations are recorded from TS.
function t(over: Partial<TrackSummary>): TrackSummary {
  return {
    kind: 'series', id: 's1', title: 'Severance', category: 'show', shelf: 'currently', createdAt: '2026-08-12T10:00:00.000Z',
    progress: { done: 3, total: 10 }, ongoing: false, paused: false, seasons: null, nextEntryStatus: 'unstarted',
    nextEntryId: 'e4', nextEntryTitle: 'Episode 4', lastAdvancedAt: null, completionDrops: null, ...over,
  };
}
const finished = { shelf: 'done', nextEntryId: null, nextEntryTitle: null, nextEntryStatus: null } as const;
const SEASONS = [{ number: 1, episodeCount: 9 }, { number: 2, episodeCount: 10 }];
const NOW = '2026-10-08T12:00:00.000Z';

const metas: [string, TrackSummary, string | null][] = [
  ['a show with a year', t({}), '2022'],
  ['a movie with a year', t({ kind: 'entry', category: 'movie', title: 'Arrival' }), '2016'],
  ['a book with no year', t({ kind: 'entry', category: 'book', title: 'Dune' }), null],
  ['an ongoing comic', t({ category: 'comic', title: 'Saga', ongoing: true }), '2012'],
  ['a manga with an empty year', t({ category: 'manga', title: 'One Piece' }), ''],
];

const primaries: [string, TrackSummary][] = [
  ['watching a show', t({})],
  ['reading a manga', t({ category: 'manga', title: 'One Piece', nextEntryTitle: 'Volume 31' })],
  ['a backlog movie', t({ kind: 'entry', category: 'movie', title: 'Arrival', shelf: 'backlog', progress: null, nextEntryTitle: 'Arrival' })],
  ['a backlog book', t({ kind: 'entry', category: 'book', title: 'Dune', shelf: 'backlog', progress: null, nextEntryTitle: 'Dune' })],
  ['a paused series', t({ shelf: 'backlog', paused: true })],
  ['a finished track', t({ ...finished })],
  ['an empty next entry id', t({ nextEntryId: '' })],
];

const captions: [string, TrackSummary, string | null][] = [
  ['episodes', t({ progress: { done: 13, total: 19 } }), 'episode'],
  ['issues', t({ category: 'comic', progress: { done: 3, total: 4 } }), 'issue'],
  ['volumes', t({ category: 'manga', progress: { done: 30, total: 108 } }), 'volume'],
  ['a total of one', t({ progress: { done: 0, total: 1 } }), 'episode'],
  ['no progress', t({ progress: null }), 'episode'],
  ['no unit (a standalone)', t({ kind: 'entry', category: 'book' }), null],
];

const timelines: [string, { addedAt: string; startedAt: string | null; finishedAt: string | null }, string][] = [
  ['added today', { addedAt: '2026-10-08T09:00:00.000Z', startedAt: null, finishedAt: null }, NOW],
  ['added yesterday, started today', { addedAt: '2026-10-07T09:00:00.000Z', startedAt: '2026-10-08T08:00:00.000Z', finishedAt: null }, NOW],
  ['all three, weeks apart', { addedAt: '2026-08-29T09:00:00.000Z', startedAt: '2026-09-01T09:00:00.000Z', finishedAt: '2026-10-02T09:00:00.000Z' }, NOW],
];

const flat = t({ category: 'manga', title: 'One Piece', progress: { done: 3, total: 10 } });
const show = t({ seasons: SEASONS, progress: { done: 13, total: 19 } });
const edits: [string, TrackSummary, string, string][] = [
  ['flat, nothing typed', flat, '', ''],
  ['flat, a padded number', flat, '', ' 3 '],
  ['flat, not digits', flat, '', '3a'],
  ['flat, zero', flat, '', '0'],
  ['flat, beyond the total', flat, '', '11'],
  ['flat, the last', flat, '', '10'],
  ['flat, a fullwidth digit', flat, '', '３'],
  ['seasons, nothing typed', show, '', ''],
  ['seasons, a season that does not exist', show, '3', '1'],
  ['seasons, an episode beyond its season', show, '2', '11'],
  ['seasons, season 2 episode 5', show, '2', '5'],
  ['seasons, season 1 episode 9', show, '1', '9'],
  ['seasons, the current season by default', show, '', '5'],
  ['seasons, a typed season shows its own total', show, '1', ''],
  ['a show without seasons', t({ progress: { done: 3, total: 10 } }), '', '4'],
  ['Swift parity: a season too long for an Int', show, '99999999999999999999', '5'],
  ['Swift parity: a unit too long for an Int', flat, '', '99999999999999999999'],
];

export const cases: FixtureCase[] = [
  ...metas.map(([n, tr, y]): FixtureCase => ({ name: `detailMeta: ${n}`, fn: 'detailMeta', args: [tr, y] })),
  ...primaries.map(([n, tr]): FixtureCase => ({ name: `detailPrimaryLabel: ${n}`, fn: 'detailPrimaryLabel', args: [tr] })),
  ...captions.map(([n, tr, u]): FixtureCase => ({ name: `progressCaption: ${n}`, fn: 'progressCaption', args: [tr, u] })),
  ...timelines.map(([n, tl, now]): FixtureCase => ({ name: `detailStats: ${n}`, fn: 'detailStats', args: [tl, now] })),
  ...edits.map(([n, tr, s, u]): FixtureCase => ({ name: `positionEdit: ${n}`, fn: 'positionEdit', args: [tr, s, u] })),
];
