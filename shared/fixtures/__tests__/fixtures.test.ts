/**
 * @jest-environment ./shared/fixtures/utcEnvironment.js
 */
// Runs under TZ=UTC via the environment above (spec §3), so no recorded
// value depends on the machine's timezone.
import * as fs from 'fs';
import * as path from 'path';
import { isDeepStrictEqual } from 'util';
import { normTitle as norm, testTitles } from '../../testTitles';
import { normalize, registry } from '../registry';
import type { FixtureCase } from '../types';
import { cases as advance } from '../cases/advance';
import { cases as formatters } from '../cases/formatters';
import { cases as genres } from '../cases/genres';
import { cases as mode } from '../cases/mode';
import { cases as rating } from '../cases/rating';
import { cases as seasons } from '../cases/seasons';
import { cases as seriesTitle } from '../cases/seriesTitle';
import { cases as shelf } from '../cases/shelf';
import { cases as validate } from '../cases/validate';
import { cases as trackLabels } from '../cases/trackLabels';
import { cases as whatsNew } from '../cases/whatsNew';

/** Module → its authored cases and the src/domain tests they extract from. */
const MODULES: Record<string, { cases: FixtureCase[]; testFiles: string[] }> = {
  advance: { cases: advance, testFiles: ['advance.test.ts', 'complete.test.ts'] },
  shelf: { cases: shelf, testFiles: ['shelf.test.ts'] },
  mode: { cases: mode, testFiles: ['mode.test.ts'] },
  validate: { cases: validate, testFiles: ['validate.test.ts'] },
  seriesTitle: { cases: seriesTitle, testFiles: ['seriesTitle.test.ts'] },
  genres: { cases: genres, testFiles: ['genres.test.ts'] },
  formatters: { cases: formatters, testFiles: ['formatters.test.ts'] },
  seasons: { cases: seasons, testFiles: ['seasons.test.ts'] },
  rating: { cases: rating, testFiles: ['rating.test.ts'] },
  whatsNew: { cases: whatsNew, testFiles: ['whatsNew.test.ts'] },
  // src/ui: Iris rows must say what Android rows say (I7).
  trackLabels: { cases: trackLabels, testFiles: [] },
};

const FIXTURES = path.resolve(__dirname, '..');
const DOMAIN_TESTS = path.resolve(__dirname, '../../../src/domain/__tests__');
const RECORD = process.env.RECORD_FIXTURES === '1';


function run(c: FixtureCase): Record<string, unknown> {
  const fn = registry[c.fn];
  if (!fn) throw new Error(`No registry entry for "${c.fn}" (case "${c.name}")`);
  try {
    // Call with exactly what the JSON will hold, so Swift replays what TS saw.
    return { name: c.name, fn: c.fn, args: c.args, expect: normalize(fn(...(JSON.parse(JSON.stringify(c.args)) as unknown[]))) };
  } catch (e) {
    return { name: c.name, fn: c.fn, args: c.args, throws: (e as Error).message };
  }
}

test('cases run under UTC', () => {
  expect(new Date('2026-01-01T00:30:00Z').getDate()).toBe(1);
  expect(new Date('2026-01-01T00:30:00Z').getTimezoneOffset()).toBe(0);
});

describe.each(Object.entries(MODULES))('%s', (module, { cases, testFiles }) => {
  test('case names are unique', () => {
    const names = cases.map((c) => c.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  test('covers every test in its src/domain test files', () => {
    const floor = testFiles
      .map((f) => fs.readFileSync(path.join(DOMAIN_TESTS, f), 'utf8').match(/^\s*(it|test)\(/gm)?.length ?? 0)
      .reduce((a, b) => a + b, 0);
    expect(cases.length).toBeGreaterThanOrEqual(floor);
  });

  test(RECORD ? 'records shared/fixtures JSON' : 'matches the committed JSON (re-run `npm run fixtures:record` if TS changed on purpose)', () => {
    const file = path.join(FIXTURES, `${module}.json`);
    const doc = { module, generatedBy: 'npm run fixtures:record', timezone: 'UTC', cases: cases.map(run) };
    if (RECORD) {
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      return;
    }
    expect(fs.existsSync(file)).toBe(true);
    const committed = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof doc;
    // Per case, so a failure names the case that changed.
    expect(committed.cases.map((c) => c.name)).toEqual(doc.cases.map((c) => c.name));
    doc.cases.forEach((actual, i) => expect({ case: actual.name, ...committed.cases[i] }).toEqual({ case: actual.name, ...JSON.parse(JSON.stringify(actual)) }));
  });
});

describe('normalize', () => {
  test('a Map becomes an object in insertion order, not {}', () => {
    expect(normalize(new Map([['b', 1], ['a', 2]]))).toEqual({ b: 1, a: 2 });
    expect(Object.keys(normalize(new Map([['b', 1], ['a', 2]])) as object)).toEqual(['b', 'a']);
  });
  test('undefined fields are dropped and a bare undefined is null', () => {
    expect(normalize({ a: 1, b: undefined })).toEqual({ a: 1 });
    expect(normalize(undefined)).toBeNull();
  });
});

test('rankingScenario walks a session to placement', () => {
  const p = (key: string) => ({ key, creator: null, genres: [], releaseYear: null });
  const ranking = ['a', 'b', 'c'].map((k) => ({ ...p(k), sentiment: 'liked' as const }));
  const out = registry.rankingScenario!(p('new'), 'liked', ranking, ['opponent', 'opponent']) as { placed: boolean; lo: number };
  expect(out.placed).toBe(true);
  expect(out.lo).toBe(3);
});


// src/ui modules have no title list to cover: their tests render components.
describe.each(Object.entries(MODULES).filter(([, m]) => m.testFiles.length > 0))('%s coverage by title', (module, { cases, testFiles }) => {
  test('every src/domain test has a fixture case named after it', () => {
    const names = cases.map((c) => norm(c.name));
    const titles = testFiles.flatMap((f) => testTitles(fs.readFileSync(path.join(DOMAIN_TESTS, f), 'utf8')));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((t) => !names.some((n) => n.includes(norm(t))))).toEqual([]);
  });
});

test('every src/domain test file feeds some fixture module', () => {
  const listed = new Set(Object.values(MODULES).flatMap((m) => m.testFiles));
  const files = fs.readdirSync(DOMAIN_TESTS).filter((f) => f.endsWith('.test.ts') && f !== 'types.test.ts');
  expect(files.filter((f) => !listed.has(f))).toEqual([]);
});

test('every case’s args survive a JSON round trip, so Swift sees what TS saw', () => {
  const lossy = Object.values(MODULES)
    .flatMap((m) => m.cases)
    .filter((c) => !isDeepStrictEqual(JSON.parse(JSON.stringify(c.args)), c.args))
    .map((c) => c.name);
  expect(lossy).toEqual([]);
});

test('placeInRanking vectors use only its declared item shape { key, sentiment }', () => {
  const extra = (items: unknown) =>
    (items as Record<string, unknown>[]).some((it) => Object.keys(it).some((k) => k !== 'key' && k !== 'sentiment'));
  const offenders = MODULES.rating!.cases.filter((c) => c.fn === 'placeInRanking' && extra(c.args[0])).map((c) => c.name);
  expect(offenders).toEqual([]);
});
