import type { Scenario, Step } from '../types';

// Extracted from src/data/__tests__/{advanceTrack,oneTapAdvance,ongoing,
// setTrackPosition,completeTrack,trackActions}.test.ts. The tests' "advance
// whatever is next" helpers become explicit list → advance step pairs; which
// shelf the track is on at each tap is fixed by the test, so it is written out.

const NOW = '2026-08-12T10:00:00.000Z';
const NOW13 = '2026-08-13T10:00:00.000Z';
const LATER = '2027-01-31T23:45:00.000Z';
const T0 = '2026-09-01T12:00:00.000Z';
const T22 = '2026-09-22T12:00:00.000Z';

const ref = ($ref: number, path?: string) => (path === undefined ? { $ref } : { $ref, path });
const list = (shelf: string): Step => ({ call: 'listTracks', args: [shelf] });
const query = (sql: string, params: unknown[] = []): Step => ({ call: 'query', args: [sql, params] });
const sql = (text: string, params: unknown[] = []): Step => ({ call: 'sql', args: [text, params] });
const add = (input: Record<string, unknown>, at = NOW13): Step => ({ call: 'addTrack', args: [input, at] });
const advance = (id: unknown, at = NOW13): Step => ({ call: 'advanceEntry', args: [id, at] });
const episodes = (title: string, count: number) => ({
  title,
  mediaType: 'show',
  unitLabel: 'episode',
  entries: Array.from({ length: count }, (_, i) => ({ ordinal: i + 1, title: `Episode ${i + 1}` })),
});
const createShow = (title: string, count: number, at = NOW): Step => ({ call: 'createSeriesTrack', args: [episodes(title, count), at] });
const book = (title: string, category = 'book'): Step => ({ call: 'createStandaloneTrack', args: [{ title, category }, NOW] });
const times = (id: unknown): Step => query('SELECT status, started_at, finished_at FROM entry WHERE id = ?', [id]);

/** `n` taps on the only track, listing the shelf it is on before each tap. */
function taps(shelves: string[], at = NOW13): Step[] {
  const steps: Step[] = [];
  for (const shelf of shelves) {
    steps.push(list(shelf));
    // The list just pushed sits at index (base + steps.length - 1); callers
    // add the base via `offset` below.
    steps.push({ call: 'advanceEntry', args: [{ $ref: -1, path: '0.nextEntryId' }, at] });
  }
  return steps;
}
/** Fix up `taps`' relative refs once the scenario's steps are assembled. */
function scenario(name: string, steps: (Step | Step[])[]): Scenario {
  const flat = steps.flat();
  return {
    name,
    steps: flat.map((step, i) => ({
      ...step,
      args: step.args.map((a) =>
        a !== null && typeof a === 'object' && (a as { $ref?: number }).$ref === -1 ? { ...(a as object), $ref: i - 1 } : a,
      ),
    })),
  };
}

export const scenarios: Scenario[] = [
  // --- advanceTrack.test.ts ---
  scenario('advancing the first episode moves a show from backlog to currently, and starts it', [
    createShow('Severance', 2),
    taps(['backlog'], NOW),
    list('backlog'),
    list('currently'),
  ]),
  scenario('finishing the in-progress episode marks it done and starts the next one', [createShow('Severance', 2), taps(['backlog', 'currently'], NOW), list('currently')]),
  scenario('advancing a book once makes it currently, not done', [book('Dune'), advance(ref(0), NOW), list('currently'), advance(ref(0), NOW), list('done')]),
  scenario('advancing a movie once completes it', [book('Arrival', 'movie'), advance(ref(0), NOW), list('done')]),
  scenario('advancing a finished entry throws and leaves the row unchanged', [book('Arrival', 'movie'), advance(ref(0), NOW), advance(ref(0), NOW), list('done')]),
  scenario('advancing an unknown entry throws', [advance('nope', NOW)]),
  scenario('advancing a movie persists both started_at and finished_at', [book('Arrival', 'movie'), advance(ref(0), NOW), times(ref(0))]),
  scenario('starting a book persists started_at and leaves finished_at null', [book('Dune'), advance(ref(0), NOW), times(ref(0))]),
  scenario('finishing a book persists finished_at without clobbering started_at', [book('Dune'), advance(ref(0), NOW), advance(ref(0), LATER), times(ref(0))]),
  scenario('a rejected advance leaves the stored timestamps byte-identical', [
    book('Arrival', 'movie'),
    advance(ref(0), NOW),
    times(ref(0)),
    advance(ref(0), LATER),
    times(ref(0)),
  ]),

  // --- oneTapAdvance.test.ts ---
  scenario('the first tap on a series volume starts it, not finishes it', [add({ title: 'Berserk', category: 'manga', count: 4 }), taps(['backlog']), list('currently')]),
  scenario('finishing an in-progress volume starts the next one in the same tap', [
    add({ title: 'Berserk', category: 'manga', count: 4 }),
    taps(['backlog', 'currently']),
    list('currently'),
  ]),
  scenario('a standalone book still needs two taps', [
    add({ title: 'Dune', category: 'book', count: 1 }),
    list('backlog'),
    advance(ref(1, '0.nextEntryId')),
    list('currently'),
    list('done'),
    advance(ref(1, '0.id')),
    list('done'),
  ]),
  scenario('the first tap on a show episode starts it, not finishes it', [add({ title: 'Severance', category: 'show', count: 3 }), taps(['backlog']), list('currently')]),
  scenario('finishing an in-progress episode starts the next one in the same tap', [
    add({ title: 'Severance', category: 'show', count: 3 }),
    taps(['backlog', 'currently']),
    list('currently'),
  ]),
  scenario('a show goes add -> Start -> Watching Episode 1 -> Done -> Watching Episode 2', [
    add({ title: 'Severance', category: 'show', count: 3 }),
    taps(['backlog', 'currently']),
    list('currently'),
  ]),
  scenario('a standalone movie still completes in a single tap', [add({ title: 'Sicario', category: 'movie', count: 1 }), taps(['backlog']), list('currently'), list('done')]),
  scenario('the final volume completes the series rather than starting nothing', [
    add({ title: 'Berserk', category: 'manga', count: 2 }),
    taps(['backlog', 'currently', 'currently']),
    list('done'),
  ]),

  // --- ongoing.test.ts ---
  scenario('an ongoing series starts with a single entry and no total', [
    add({ title: 'One Piece', category: 'manga', count: 0, ongoing: true }),
    list('backlog'),
    query('SELECT id FROM entry ORDER BY rowid'),
  ]),
  scenario('finishing the last entry appends the next one', [
    add({ title: 'One Piece', category: 'manga', count: 0, ongoing: true }),
    taps(['backlog', 'currently']),
    query('SELECT title FROM entry ORDER BY ordinal'),
    list('currently'),
  ]),
  scenario('an ongoing series never reaches the Done shelf', [
    add({ title: 'One Piece', category: 'manga', count: 0, ongoing: true }),
    taps(['backlog', 'currently', 'currently', 'currently']),
    list('done'),
    list('currently'),
  ]),
  scenario('a finite series is unaffected — no entry is appended', [
    add({ title: 'Berserk', category: 'manga', count: 2 }),
    taps(['backlog', 'currently', 'currently']),
    query('SELECT id FROM entry ORDER BY rowid'),
    list('done'),
  ]),
  scenario('an ongoing show appends episodes, not volumes', [
    add({ title: 'Severance', category: 'show', count: 0, ongoing: true }),
    taps(['backlog', 'currently']),
    query('SELECT title FROM entry ORDER BY ordinal'),
  ]),
  scenario('finishing an earlier entry out of order does not append', [
    add({ title: 'One Piece', category: 'manga', count: 0, ongoing: true }),
    taps(['backlog', 'currently']),
    query('SELECT id FROM entry WHERE ordinal = 1'),
    sql("UPDATE entry SET status = 'unstarted' WHERE id = ?", [ref(5, '0.id')]),
    advance(ref(5, '0.id')),
    advance(ref(5, '0.id')),
    query('SELECT id FROM entry ORDER BY rowid'),
  ]),

  // --- setTrackPosition.test.ts ---
  scenario('setting a position moves the track to currently with the progress it implies', [
    createShow('House', 24),
    { call: 'setTrackPosition', args: [ref(0), 12, LATER] },
    list('currently'),
  ]),
  scenario('setting a position backwards un-finishes the units it drops below', [
    createShow('House', 24),
    { call: 'setTrackPosition', args: [ref(0), 20, NOW] },
    { call: 'setTrackPosition', args: [ref(0), 4, LATER] },
    list('currently'),
  ]),
  scenario('setting a position sorts the track to the front of currently', [
    createShow('House', 24),
    createShow('Severance', 2),
    { call: 'setTrackPosition', args: [ref(1), 2, NOW] },
    { call: 'setTrackPosition', args: [ref(0), 5, LATER] },
    list('currently'),
  ]),
  scenario('setting a position rejects a unit the series does not have', [createShow('House', 24), { call: 'setTrackPosition', args: [ref(0), 25, LATER] }, list('backlog')]),
  scenario('setting a position on a paused track brings it back to currently', [
    createShow('House', 24),
    sql('UPDATE series SET paused = 1 WHERE id = ?', [ref(0)]),
    { call: 'setTrackPosition', args: [ref(0), 7, LATER] },
    list('backlog'),
    list('currently'),
  ]),
  scenario('setting a position on a series that does not exist fails loudly', [{ call: 'setTrackPosition', args: ['nope', 1, LATER] }]),

  // --- completeTrack.test.ts ---
  scenario('a backlog book completes straight to Done with start and finish at now', [
    add({ title: 'Dune', category: 'book', count: 1 }, T0),
    { call: 'completeTrack', args: [ref(0), T22] },
    list('done'),
    query('SELECT started_at, finished_at FROM entry'),
  ]),
  scenario('a paused, half-read series completes and keeps earlier finish stamps', [
    add({ title: 'Berserk', category: 'manga', count: 3 }, T0),
    query('SELECT id FROM entry ORDER BY ordinal LIMIT 1'),
    advance(ref(1, '0.id'), T0),
    advance(ref(1, '0.id'), T0),
    sql('UPDATE series SET paused = 1'),
    { call: 'completeTrack', args: [ref(0), T22] },
    list('done'),
    query('SELECT ordinal, finished_at FROM entry ORDER BY ordinal'),
    query('SELECT paused FROM series'),
  ]),
  scenario('an ongoing series drops the auto-appended next unit and stops being ongoing', [
    add({ title: 'Saga', category: 'comic', count: 0, ongoing: true }, T0),
    list('backlog'),
    advance(ref(1, '0.nextEntryId'), '2026-09-02T12:00:00.000Z'),
    list('currently'),
    advance(ref(3, '0.nextEntryId'), '2026-09-03T12:00:00.000Z'),
    list('currently'),
    advance(ref(5, '0.nextEntryId'), '2026-09-04T12:00:00.000Z'),
    { call: 'completeTrack', args: [ref(0), T22] },
    list('done'),
  ]),
  scenario('an ongoing series lists the auto-appended unit completing would drop', [
    add({ title: 'Saga', category: 'comic', count: 0, ongoing: true }, T0),
    list('backlog'),
    advance(ref(1, '0.nextEntryId'), '2026-09-02T12:00:00.000Z'),
    list('currently'),
    advance(ref(3, '0.nextEntryId'), '2026-09-03T12:00:00.000Z'),
    list('currently'),
    advance(ref(5, '0.nextEntryId'), '2026-09-04T12:00:00.000Z'),
    list('currently'),
  ]),
  scenario('finite series and standalone entries never drop a unit', [
    add({ title: 'Berserk', category: 'manga', count: 3 }, T0),
    add({ title: 'Dune', category: 'book', count: 1 }, T0),
    list('backlog'),
  ]),
  scenario('completing an already-finished track is a harmless no-op', [
    add({ title: 'Arrival', category: 'movie', count: 1 }, T0),
    { call: 'completeTrack', args: [ref(0), T0] },
    { call: 'completeTrack', args: [ref(0), T22] },
    query('SELECT finished_at FROM entry'),
  ]),
  scenario('an unknown track id is an error', [{ call: 'completeTrack', args: [{ kind: 'series', id: 'nope' }, T22] }]),

  // --- trackActions.test.ts: deleteTrack ---
  scenario('deleting a series removes its entries too', [
    add({ title: 'Berserk', category: 'manga', count: 3 }),
    list('backlog'),
    { call: 'deleteTrack', args: [{ kind: 'series', id: ref(1, '0.id') }] },
    query('SELECT id FROM series ORDER BY rowid'),
    query('SELECT id FROM entry ORDER BY rowid'),
    list('backlog'),
  ]),
  scenario('deleting a standalone track removes only that entry', [
    add({ title: 'Dune', category: 'book', count: 1 }),
    add({ title: 'Solaris', category: 'book', count: 1 }),
    list('backlog'),
    { call: 'deleteTrack', args: [{ kind: 'entry', id: ref(0, 'id') }] },
    list('backlog'),
  ]),
  scenario('deleting one track leaves its neighbours alone', [
    add({ title: 'Berserk', category: 'manga', count: 2 }),
    add({ title: 'Vagabond', category: 'manga', count: 2 }),
    { call: 'deleteTrack', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('backlog'),
  ]),

  // --- trackActions.test.ts: returnTrackToBacklog ---
  scenario('A6: a part-way series is paused, not reset — its progress survives', [
    add({ title: 'Severance', category: 'show', count: 4 }),
    taps(['backlog']),
    list('currently'),
    { call: 'returnTrackToBacklog', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('currently'),
    list('backlog'),
  ]),
  scenario('A6: timestamps survive the pause, unlike the old reset', [
    add({ title: 'Severance', category: 'show', count: 2 }),
    taps(['backlog']),
    { call: 'returnTrackToBacklog', args: [{ kind: 'series', id: ref(0, 'id') }] },
    query('SELECT status, started_at, finished_at FROM entry WHERE ordinal = 1'),
  ]),
  scenario('A6: a fully finished series is reset, not paused — nothing is left to resume', [
    add({ title: 'Chainsaw Man', category: 'manga', count: 1 }),
    taps(['backlog', 'currently']),
    list('done'),
    { call: 'returnTrackToBacklog', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('done'),
    list('backlog'),
  ]),
  scenario('a finished standalone track can still be sent back to the backlog and reset', [
    add({ title: 'Arrival', category: 'movie', count: 1 }),
    taps(['backlog']),
    list('done'),
    { call: 'returnTrackToBacklog', args: [{ kind: 'entry', id: ref(0, 'id') }] },
    list('done'),
    list('backlog'),
  ]),
  scenario('a standalone track still reading is paused, keeping its status', [
    add({ title: 'Dune', category: 'book', count: 1 }),
    taps(['backlog']),
    { call: 'returnTrackToBacklog', args: [{ kind: 'entry', id: ref(0, 'id') }] },
    list('backlog'),
    query('SELECT status FROM entry WHERE id = ?', [ref(0, 'id')]),
  ]),
  scenario('returning one track does not disturb another', [
    add({ title: 'Berserk', category: 'manga', count: 2 }),
    taps(['backlog']),
    add({ title: 'Dune', category: 'book', count: 1 }),
    list('backlog'),
    advance(ref(4, '0.nextEntryId')),
    { call: 'returnTrackToBacklog', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('currently'),
  ]),

  // --- trackActions.test.ts: resumeTrack ---
  scenario('A6: resuming a paused series restores Currently without touching progress', [
    add({ title: 'Severance', category: 'show', count: 4 }),
    taps(['backlog']),
    { call: 'returnTrackToBacklog', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('currently'),
    { call: 'resumeTrack', args: [{ kind: 'series', id: ref(0, 'id') }] },
    list('currently'),
  ]),
  scenario('A6: resuming a paused standalone entry restores Currently', [
    add({ title: 'Dune', category: 'book', count: 1 }),
    taps(['backlog']),
    { call: 'returnTrackToBacklog', args: [{ kind: 'entry', id: ref(0, 'id') }] },
    { call: 'resumeTrack', args: [{ kind: 'entry', id: ref(0, 'id') }] },
    list('currently'),
  ]),
];
