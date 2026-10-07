import * as fs from 'fs';
import * as path from 'path';
import { normTitle, testTitles } from '../../testTitles';
import { recordCase } from '../record';
import type { ProviderCase } from '../types';
import { cases as googleBooks } from '../cases/googleBooks';
import { cases as pure } from '../cases/pure';
import { cases as tmdb } from '../cases/tmdb';

/** Area → its cases and the tests they carry over. Paths are repo-relative. */
const AREAS: Record<string, { cases: ProviderCase[]; testFiles: string[] }> = {
  pure: {
    cases: pure,
    testFiles: ['src/providers/__tests__/images.test.ts', 'src/providers/__tests__/manual.test.ts', 'src/providers/__tests__/registry.test.ts'],
  },  tmdb: { cases: tmdb, testFiles: ['src/providers/__tests__/tmdb.test.ts'] },
  googleBooks: { cases: googleBooks, testFiles: ['src/providers/__tests__/googleBooks.test.ts'] },
};

const ROOT = path.resolve(__dirname, '../../..');
const HERE = path.resolve(__dirname, '..');
const RECORD = process.env.RECORD_FIXTURES === '1';

describe.each(Object.entries(AREAS))('%s', (area, { cases, testFiles }) => {
  test('case names are unique', () => {
    const names = cases.map((c) => c.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  test('every test has a case named after it', () => {
    const names = cases.map((c) => normTitle(c.name));
    const titles = testFiles.flatMap((f) => testTitles(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((t) => !names.some((n) => n.includes(normTitle(t))))).toEqual([]);
  });

  test(RECORD ? 'records shared/providers JSON' : 'matches the committed JSON (re-run `npm run fixtures:record` if TS changed on purpose)', async () => {
    const recorded: Record<string, unknown>[] = [];
    for (const c of cases) recorded.push(await recordCase(c));
    const doc = { area, generatedBy: 'npm run fixtures:record', cases: recorded };
    const file = path.join(HERE, `${area}.json`);
    if (RECORD) {
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      return;
    }
    const committed = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof doc;
    expect(committed.cases.map((c) => c.name)).toEqual(recorded.map((c) => c.name));
    recorded.forEach((actual, i) => expect({ case: actual.name, ...committed.cases[i] }).toEqual({ case: actual.name, ...actual }));
  });
});

test('every provider test file feeds an area', () => {
  const listed = new Set(Object.values(AREAS).flatMap((a) => a.testFiles));
  const dir = 'src/providers/__tests__';
  const files = fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.test.ts')).map((f) => `${dir}/${f}`);
  expect(files.filter((f) => !listed.has(f))).toEqual([]);
});
