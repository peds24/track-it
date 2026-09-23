import {
  activityLine,
  cleanDescription,
  creatorLine,
  decodeEntities,
  formatDate,
  formatDuration,
  formatRelative,
  initialsOf,
  timelineOf,
  yearOf,
} from '@/domain/formatters';

describe('cleanDescription', () => {
  test('strips tags, turning paragraph and line breaks into newlines', () => {
    expect(cleanDescription('<p>First <b>bold</b> line.</p><p>Second<br>third</p>')).toBe(
      'First bold line.\n\nSecond\nthird',
    );
  });

  test('decodes named and numeric entities', () => {
    expect(cleanDescription('Tom &amp; Jerry &quot;hi&quot; &#39;yo&#39; &#x2014; ok&hellip;')).toBe(
      'Tom & Jerry "hi" \'yo\' — ok…',
    );
  });

  test('collapses runs of whitespace and blank lines', () => {
    expect(cleanDescription('  a   b \n\n\n\n c  ')).toBe('a b\n\nc');
  });

  test('returns null for empty, missing, or markup-only input', () => {
    expect(cleanDescription(null)).toBeNull();
    expect(cleanDescription(undefined)).toBeNull();
    expect(cleanDescription('   ')).toBeNull();
    expect(cleanDescription('<p> </p>')).toBeNull();
  });

  test('leaves an unknown entity as written rather than dropping it', () => {
    expect(decodeEntities('a &madeup; b')).toBe('a &madeup; b');
  });
});

test('yearOf takes the leading four-digit year only', () => {
  expect(yearOf('2020-09-15')).toBe('2020');
  expect(yearOf('1965')).toBe('1965');
  expect(yearOf('20')).toBeNull();
  expect(yearOf(null)).toBeNull();
  expect(yearOf(undefined)).toBeNull();
});

test('initialsOf uses the first letters of the first two words', () => {
  expect(initialsOf('The Expanse')).toBe('TE');
  expect(initialsOf('dune')).toBe('D');
  expect(initialsOf('  ')).toBe('?');
});

test('creatorLine phrases the credit per category', () => {
  expect(creatorLine('book', 'Frank Herbert')).toBe('By Frank Herbert');
  expect(creatorLine('manga', 'Kentaro Miura')).toBe('By Kentaro Miura');
  expect(creatorLine('show', 'Dan Erickson')).toBe('Created by Dan Erickson');
  expect(creatorLine('movie', 'Denis Villeneuve')).toBe('Directed by Denis Villeneuve');
  expect(creatorLine('book', null)).toBeNull();
});

describe('timelineOf', () => {
  const ADDED = '2026-08-01T12:00:00.000Z';

  test('an untouched track has only its added date', () => {
    expect(timelineOf(ADDED, [{ status: 'unstarted', startedAt: null, finishedAt: null }])).toEqual({
      addedAt: ADDED,
      startedAt: null,
      finishedAt: null,
    });
  });

  test('started is the earliest start; finished only once every unit is done', () => {
    const units = [
      { status: 'done' as const, startedAt: '2026-08-03T12:00:00.000Z', finishedAt: '2026-08-04T12:00:00.000Z' },
      { status: 'in_progress' as const, startedAt: '2026-08-02T12:00:00.000Z', finishedAt: null },
    ];
    expect(timelineOf(ADDED, units)).toEqual({
      addedAt: ADDED,
      startedAt: '2026-08-02T12:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a fully done track reports its latest finish', () => {
    const units = [
      { status: 'done' as const, startedAt: '2026-08-02T12:00:00.000Z', finishedAt: '2026-08-09T12:00:00.000Z' },
      { status: 'done' as const, startedAt: '2026-08-02T12:00:00.000Z', finishedAt: '2026-08-05T12:00:00.000Z' },
    ];
    expect(timelineOf(ADDED, units).finishedAt).toBe('2026-08-09T12:00:00.000Z');
  });

  test('a series with no units has no start or finish', () => {
    expect(timelineOf(ADDED, [])).toEqual({ addedAt: ADDED, startedAt: null, finishedAt: null });
  });
});

test('formatDuration scales days to the largest sensible unit', () => {
  expect(formatDuration(0)).toBe('less than a day');
  expect(formatDuration(1)).toBe('1 day');
  expect(formatDuration(12)).toBe('12 days');
  expect(formatDuration(21)).toBe('3 weeks');
  expect(formatDuration(90)).toBe('3 months');
  expect(formatDuration(365)).toBe('12 months');
  expect(formatDuration(800)).toBe('2 years');
});

test('formatRelative speaks in days-ago terms', () => {
  const now = '2026-08-22T12:00:00.000Z';
  expect(formatRelative('2026-08-22T08:00:00.000Z', now)).toBe('today');
  expect(formatRelative('2026-08-21T12:00:00.000Z', now)).toBe('yesterday');
  expect(formatRelative('2026-08-01T12:00:00.000Z', now)).toBe('3 weeks ago');
});

test('formatDate is a short month-day-year date', () => {
  expect(formatDate('2026-08-12T12:00:00.000Z')).toBe('Aug 12, 2026');
});

describe('activityLine', () => {
  const now = '2026-08-22T12:00:00.000Z';

  test('in progress reads as reading/watching for a duration', () => {
    const t = { addedAt: '2026-08-01T12:00:00.000Z', startedAt: '2026-08-10T12:00:00.000Z', finishedAt: null };
    expect(activityLine('book', t, now)).toBe('Reading for 12 days');
    expect(activityLine('show', t, now)).toBe('Watching for 12 days');
  });

  test('finished reads as finished in a duration from start', () => {
    const t = {
      addedAt: '2026-08-01T12:00:00.000Z',
      startedAt: '2026-08-10T12:00:00.000Z',
      finishedAt: '2026-08-14T12:00:00.000Z',
    };
    expect(activityLine('manga', t, now)).toBe('Finished in 4 days');
  });

  test('never started has no activity line', () => {
    expect(activityLine('book', { addedAt: now, startedAt: null, finishedAt: null }, now)).toBeNull();
  });
});
