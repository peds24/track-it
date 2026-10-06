/**
 * @jest-environment ./shared/fixtures/utcEnvironment.js
 */
// Runs under TZ=UTC via the environment above (spec §3), so no recorded
// value depends on the machine's timezone.
import * as fs from 'fs';
import * as path from 'path';
import { normalize, registry } from '../registry';
import type { FixtureCase } from '../types';
import { cases as whatsNew } from '../cases/whatsNew';

/** Module → its authored cases and the src/domain tests they extract from. */
const MODULES: Record<string, { cases: FixtureCase[]; testFiles: string[] }> = {
  whatsNew: { cases: whatsNew, testFiles: ['whatsNew.test.ts'] },
};

const FIXTURES = path.resolve(__dirname, '..');
const DOMAIN_TESTS = path.resolve(__dirname, '../../../src/domain/__tests__');
const RECORD = process.env.RECORD_FIXTURES === '1';


function run(c: FixtureCase): Record<string, unknown> {
  const fn = registry[c.fn];
  if (!fn) throw new Error(`No registry entry for "${c.fn}" (case "${c.name}")`);
  try {
    return { name: c.name, fn: c.fn, args: c.args, expect: normalize(fn(...structuredClone(c.args))) };
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
