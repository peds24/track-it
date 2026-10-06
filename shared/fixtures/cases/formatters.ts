import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/formatters.test.ts. The original's
// local-time tests (`new Date(2026, 7, 12, 23, 30)`) become literal ISO
// strings: fixtures run under UTC, so those are the same calendar moments
// the tests meant, and they sit right at midnight (spec §3, I2 plan).
type Case = [name: string, fn: string, ...args: unknown[]];
const c = ([name, fn, ...args]: Case): FixtureCase => ({ name, fn, args });

const ADDED = '2026-08-01T12:00:00.000Z';
const NOW = '2026-08-22T12:00:00.000Z';
const LATE_TONIGHT = '2026-08-12T23:30:00.000Z';
const EARLY_TOMORROW = '2026-08-13T00:30:00.000Z';
const LATER_TONIGHT = '2026-08-12T23:59:00.000Z';
const BR_TAGS = ['line 1<br class="x"/>line 2', 'line 1<br style="clear:both">line 2', 'text<BR STYLE="DISPLAY:BLOCK"/>more'];
const IDEMPOTENT = '<p>First <b>bold</b> line.</p><p>Second<br>third</p>';

export const cases: FixtureCase[] = ([
  ['cleanDescription strips tags, turning paragraph and line breaks into newlines', 'cleanDescription', IDEMPOTENT],
  ['cleanDescription decodes named and numeric entities', 'cleanDescription', 'Tom &amp; Jerry &quot;hi&quot; &#39;yo&#39; &#x2014; ok&hellip;'],
  ['cleanDescription collapses runs of whitespace and blank lines', 'cleanDescription', '  a   b \n\n\n\n c  '],
  ['cleanDescription returns null for empty, missing, or markup-only input', 'cleanDescription', null],
  ['cleanDescription returns null for empty, missing, or markup-only input (2)', 'cleanDescription', '   '],
  ['cleanDescription returns null for empty, missing, or markup-only input (3)', 'cleanDescription', '<p> </p>'],
  ['decodeEntities leaves an unknown entity as written rather than dropping it', 'decodeEntities', 'a &madeup; b'],
  ['cleanDescription: encoded brackets like &lt;PG-13&gt; decode', 'cleanDescription', 'Rating: &lt;PG-13&gt; content, also x &lt; y and y &gt; z ok.'],
  ['cleanDescription is idempotent: a decoded pass-1 result is unchanged', 'cleanDescription', 'Rating: <PG-13> content, also x < y and y > z ok.'],
  ['cleanDescription: unknown bracketed words like <PG-13> survive in raw input', 'cleanDescription', '<PG-13> rated'],
  ['cleanDescription: unknown bracketed words like <PG-13> survive in raw input (2)', 'cleanDescription', 'before <unknown-tag> after'],
  ['cleanDescription is idempotent over existing fixtures', 'cleanDescription', 'First bold line.\n\nSecond\nthird'],
  ['cleanDescription: <br> with attributes becomes a line break', 'cleanDescription', '<br class="x"/>'],
  ...BR_TAGS.map((raw, i): Case => [`cleanDescription: <br> with attributes becomes a line break (${i + 2})`, 'cleanDescription', raw]),
  ...(['2020-09-15', '1965', '20', null] as const).map((v, i): Case => [`yearOf takes the leading four-digit year only${i ? ` (${i + 1})` : ''}`, 'yearOf', v]),
  ...['The Expanse', 'dune', '  '].map((v, i): Case => [`initialsOf uses the first letters of the first two words${i ? ` (${i + 1})` : ''}`, 'initialsOf', v]),
  ...([['book', 'Frank Herbert'], ['manga', 'Kentaro Miura'], ['show', 'Dan Erickson'], ['movie', 'Denis Villeneuve'], ['book', null], ['comic', 'Tom King']] as const).map(
    ([cat, who], i): Case => [`creatorLine phrases the credit per category${i ? ` (${i + 1})` : ''}`, 'creatorLine', cat, who],
  ),
  ['timelineOf: an untouched track has only its added date', 'timelineOf', ADDED, [{ status: 'unstarted', startedAt: null, finishedAt: null }]],
  ['timelineOf: started is the earliest start; finished only once every unit is done', 'timelineOf', ADDED, [
    { status: 'done', startedAt: '2026-08-03T12:00:00.000Z', finishedAt: '2026-08-04T12:00:00.000Z' },
    { status: 'in_progress', startedAt: '2026-08-02T12:00:00.000Z', finishedAt: null },
  ]],
  ['timelineOf: a fully done track reports its latest finish', 'timelineOf', ADDED, [
    { status: 'done', startedAt: '2026-08-02T12:00:00.000Z', finishedAt: '2026-08-09T12:00:00.000Z' },
    { status: 'done', startedAt: '2026-08-02T12:00:00.000Z', finishedAt: '2026-08-05T12:00:00.000Z' },
  ]],
  ['timelineOf: a series with no units has no start or finish', 'timelineOf', ADDED, []],
  ...[0, 1, 12, 21, 90, 365, 800, 13, 14, 59, 60, 729, 730].map((d, i): Case => [`formatDuration scales days to the largest sensible unit${i ? ` (${i + 1})` : ''}`, 'formatDuration', d]),
  ['formatRelative speaks in days-ago terms', 'formatRelative', '2026-08-22T08:00:00.000Z', NOW],
  ['formatRelative speaks in days-ago terms (2)', 'formatRelative', '2026-08-21T12:00:00.000Z', NOW],
  ['formatRelative speaks in days-ago terms (3)', 'formatRelative', '2026-08-01T12:00:00.000Z', NOW],
  ['formatDate is a short month-day-year date', 'formatDate', '2026-08-12T12:00:00.000Z'],
  ['formatDate uses the device calendar, so a late-evening add is not tomorrow', 'formatDate', LATE_TONIGHT],
  ['formatDate uses the device calendar, so a late-evening add is not tomorrow (2)', 'formatDate', '2026-08-13T00:15:00.000Z'],
  ['formatDate near a year boundary', 'formatDate', '2026-12-31T23:59:59.000Z'],
  ['daysBetween counts local calendar days, not 24-hour blocks', 'daysBetween', LATE_TONIGHT, EARLY_TOMORROW],
  ['daysBetween counts local calendar days, not 24-hour blocks (2)', 'daysBetween', LATE_TONIGHT, LATER_TONIGHT],
  ['daysBetween counts local calendar days, not 24-hour blocks (3)', 'daysBetween', EARLY_TOMORROW, LATE_TONIGHT],
  ['daysBetween across midnight UTC', 'daysBetween', '2026-03-01T23:30:00.000Z', '2026-03-02T00:10:00.000Z'],
  ['formatRelative: late tonight seen early tomorrow is yesterday', 'formatRelative', LATE_TONIGHT, EARLY_TOMORROW],
  ['activityLine: in progress reads as reading for a duration', 'activityLine', 'book', { addedAt: ADDED, startedAt: '2026-08-10T12:00:00.000Z', finishedAt: null }, NOW],
  ['activityLine: in progress reads as watching for a duration', 'activityLine', 'show', { addedAt: ADDED, startedAt: '2026-08-10T12:00:00.000Z', finishedAt: null }, NOW],
  ['activityLine: finished reads as finished in a duration from start', 'activityLine', 'manga', {
    addedAt: ADDED, startedAt: '2026-08-10T12:00:00.000Z', finishedAt: '2026-08-14T12:00:00.000Z',
  }, NOW],
  ['activityLine: never started has no activity line', 'activityLine', 'book', { addedAt: NOW, startedAt: null, finishedAt: null }, NOW],
  ['activityLine: started just before midnight, seen just after', 'activityLine', 'comic', { addedAt: ADDED, startedAt: LATE_TONIGHT, finishedAt: null }, EARLY_TOMORROW],
] as Case[]).map(c);
