import type { Entry, EntryMediaType, Status } from '@/domain/types';
import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/shelf.test.ts.
function child(ordinal: number, status: Status, mediaType: EntryMediaType = 'episode', paused = false): Entry {
  return {
    id: `e${ordinal}`, seriesId: 's1', title: `#${ordinal}`, ordinal, mediaType, status, startedAt: null, finishedAt: null,
    createdAt: '2026-08-12T10:00:00.000Z', paused, externalSource: null, externalId: null,
  };
}

const forEntry = (name: string, e: Entry): FixtureCase => ({ name, fn: 'shelfForEntry', args: [e] });
const forSeries = (name: string, children: Entry[], paused?: boolean): FixtureCase => ({
  name,
  fn: 'shelfForSeries',
  args: paused === undefined ? [children] : [children, paused],
});
const volumes = [child(1, 'in_progress', 'volume'), child(2, 'unstarted', 'volume')];

export const cases: FixtureCase[] = [
  ...(['unstarted', 'in_progress', 'done'] as const).map((s) => forEntry(`shelfForEntry: ${s}`, child(1, s, 'book'))),
  forEntry('A6: a paused entry reads as backlog even mid-way through', child(1, 'in_progress', 'book', true)),
  forEntry('A6: done wins over paused — there is nothing left to resume', child(1, 'done', 'book', true)),
  forSeries('no children done and none in progress is backlog', [child(1, 'unstarted'), child(2, 'unstarted')]),
  forSeries('some done and some not is currently', [child(1, 'done'), child(2, 'unstarted')]),
  forSeries('all done is done', [child(1, 'done'), child(2, 'done')]),
  forSeries('a read-mode child in progress is currently even with nothing done', volumes),
  forSeries('a series with no children is backlog', []),
  forSeries('A6: paused pulls a part-way series back to backlog', [child(1, 'done'), child(2, 'unstarted')], true),
  forSeries('A6: paused overrides an in-progress read-mode child too', volumes, true),
  forSeries('A6: paused overrides an in-progress read-mode child too (2)', volumes, false),
  forSeries('A6: done wins over paused for a fully finished series', [child(1, 'done'), child(2, 'done')], true),
  { name: 'progressFor counts only done children', fn: 'progressFor', args: [[child(1, 'done'), child(2, 'in_progress', 'volume'), child(3, 'unstarted')]] },
  { name: 'progressFor: an empty series is 0 of 0', fn: 'progressFor', args: [[]] },
  { name: 'nextEntry returns the in-progress child first', fn: 'nextEntry', args: [[child(1, 'done'), child(2, 'in_progress', 'volume'), child(3, 'unstarted')]] },
  { name: 'nextEntry otherwise returns the lowest-ordinal unstarted child', fn: 'nextEntry', args: [[child(3, 'unstarted'), child(1, 'done'), child(2, 'unstarted')]] },
  { name: 'nextEntry returns null when everything is done', fn: 'nextEntry', args: [[child(1, 'done')]] },
];
