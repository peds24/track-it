/**
 * @jest-environment ./shared/fixtures/utcEnvironment.js
 */
import * as fs from 'fs';
import * as path from 'path';
import { normTitle, testTitles } from '../../testTitles';
import { play } from '../play';
import type { Scenario } from '../types';
import { scenarios as backfill } from '../cases/backfill';
import { NOT_A_SCENARIO as backupNot, scenarios as backup } from '../cases/backup';
import { scenarios as progress } from '../cases/progress';
import { scenarios as ratings } from '../cases/ratings';
import { scenarios as sync } from '../cases/sync';
import { NOT_A_SCENARIO as tracksNot, scenarios as tracks } from '../cases/tracks';
import { scenarios as whatsNew } from '../cases/whatsNew';

/** Area → its scenarios, the src/data tests they carry over, and any test
 * titles that cannot be a scenario (each with its reason in the cases file). */
const AREAS: Record<string, { scenarios: Scenario[]; testFiles: string[]; notAScenario?: string[] }> = {
  whatsNew: { scenarios: whatsNew, testFiles: ['whatsNew.test.ts'] },
  tracks: {
    scenarios: tracks,
    testFiles: ['trackRepo.test.ts', 'trackDetail.test.ts', 'addAndStart.test.ts', 'seriesTitleOrdinal.test.ts'],
    notAScenario: tracksNot,
  },
  progress: {
    scenarios: progress,
    testFiles: ['advanceTrack.test.ts', 'oneTapAdvance.test.ts', 'ongoing.test.ts', 'setTrackPosition.test.ts', 'completeTrack.test.ts', 'trackActions.test.ts'],
  },
  ratings: { scenarios: ratings, testFiles: ['ratingRepo.test.ts'] },
  backup: { scenarios: backup, testFiles: ['backup.test.ts'], notAScenario: backupNot },
  backfill: { scenarios: backfill, testFiles: ['backfillMetadata.test.ts'] },
  sync: { scenarios: sync, testFiles: ['syncSeriesUnit.test.ts'] },
};

/** src/data tests that are not scenarios yet (none since I5 added stub providers). */
const LATER: string[] = [];

const HERE = path.resolve(__dirname, '..');
const DATA_TESTS = path.resolve(__dirname, '../../../src/data/__tests__');
const RECORD = process.env.RECORD_FIXTURES === '1';

describe.each(Object.entries(AREAS))('%s', (area, { scenarios, testFiles, notAScenario = [] }) => {
  test('scenario names are unique', () => {
    const names = scenarios.map((s) => s.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  test('every src/data test has a scenario named after it', () => {
    const names = scenarios.map((s) => normTitle(s.name));
    const titles = testFiles.flatMap((f) => testTitles(fs.readFileSync(path.join(DATA_TESTS, f), 'utf8')));
    expect(titles.length).toBeGreaterThan(0);
    const exempt = new Set(notAScenario.map(normTitle));
    expect(titles.filter((t) => !exempt.has(normTitle(t)) && !names.some((n) => n.includes(normTitle(t))))).toEqual([]);
  });

  test(RECORD ? 'records shared/scenarios JSON' : 'matches the committed JSON (re-run `npm run fixtures:record` if TS changed on purpose)', async () => {
    const file = path.join(HERE, `${area}.json`);
    const played: Record<string, unknown>[] = [];
    for (const s of scenarios) played.push(await play(s));
    const doc = { area, generatedBy: 'npm run fixtures:record', timezone: 'UTC', scenarios: played };
    if (RECORD) {
      fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
      return;
    }
    const committed = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof doc;
    expect(committed.scenarios.map((s) => s.name)).toEqual(played.map((s) => s.name));
    played.forEach((actual, i) => expect({ scenario: actual.name, ...committed.scenarios[i] }).toEqual({ scenario: actual.name, ...JSON.parse(JSON.stringify(actual)) }));
  });
});

test('every src/data test file feeds a scenario area, or is listed for I5', () => {
  const listed = new Set([...Object.values(AREAS).flatMap((a) => a.testFiles), ...LATER]);
  expect(fs.readdirSync(DATA_TESTS).filter((f) => f.endsWith('.test.ts') && !listed.has(f))).toEqual([]);
});

test('every scenario step is JSON-safe, so Swift replays what TS ran', () => {
  const lossy = Object.values(AREAS)
    .flatMap((a) => a.scenarios)
    .filter((s) => JSON.stringify(JSON.parse(JSON.stringify(s.steps))) !== JSON.stringify(s.steps))
    .map((s) => s.name);
  expect(lossy).toEqual([]);
});
