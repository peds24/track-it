# Iris I4 — Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IrisCore persists the library in SQLite through GRDB, using the same schema, the same repository behaviour, and the same backup format as the TS app. That sameness is proven by recorded **scenarios**: sequences of repository calls replayed on both platforms, with each step's result and a dump of the database compared.

**Architecture:**
- **Migrations:** `src/db/schema.ts`'s migrations run verbatim in Swift from a file generated off the TS source. This keeps `sqlite_master` text, and therefore `shared/schema/schema.sql`, byte-identical. GRDB's `DatabaseMigrator` would add a `grdb_migrations` table, so it isn't used.
- **Repositories:** they are free functions on a GRDB `Database`, ported from `src/data/*.ts` with the same SQL. The caller wraps a call in `writer.write { db in … }`, so each call is one transaction. `addTrack` is async: it may hydrate through a provider, which arrives in I5, and until then defaults to the manual generator.
- **Scenarios:**
  - Written in TS (`shared/scenarios/cases/*.ts`) and recorded by `npm run fixtures:record`, under the same UTC environment as I2.
  - Generated IDs are random on both sides. Each runtime maps every id to a token (`#1`, `#2`, …) in the order rows were inserted, then compares.
  - Swift replays every scenario on an in-memory GRDB queue.

**Tech Stack:**
- Swift 6.4 and GRDB.swift 7 (SwiftPM), on the system SQLite.
- TS: better-sqlite3 via `test/memoryDriver.ts`, under jest.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md` §2.2 (GRDB, same schema), §3 (schema fixture, backup portability), §8 I4 ("Schema fixture matches; a TS backup imports on iOS and round-trips"), §10, §11. This plan **amends §10/§11**, which said the repository tests "mirror each other". The user chose recorded scenarios on 2026-10-07, and that is recorded as A29 in Task 8.

## Global Constraints

- GRDB "plain SQLite, so the schema can be the *same* schema — not a lookalike" (spec §2.2). The SQL in `src/data/*.ts` is ported verbatim wherever it is SQL.
- `IrisCore` does no UI. `Persistence/` may do I/O, but `Domain/` still may not.
- Error messages are the TS text, verbatim (ids inside them are normalised by the runner).
- Fixtures and scenarios are recorded from TS, never hand-edited. New behaviour means new cases followed by `npm run fixtures:record`.
- **In scope:** `src/data/{trackRepo,addTrack,ratingRepo,whatsNew,backup}.ts`, `src/db/schema.ts`, `src/providers/{manual,images}.ts` and the provider-id table.
- **Out of scope (I5):** `backfillMetadata.ts` and `syncSeriesUnit.ts` (they need real providers), and `addTrack` hydrating a real catalogue match.
- Work on `worktree-iris-persistence` (`.claude/worktrees/iris-persistence`). Merge into `iris` with `--no-ff` and push both branches; the user approved pushing on 2026-10-06.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (substitute the model in use).

## Review Focus

1. **Byte-identical schema.** SQLite stores the DDL text, so whitespace drift in the Swift migration strings would break `schema.sql` parity. Pinned by generating the Swift migrations from TS (Task 1) and an XCTest that compares the dump to `shared/schema/schema.sql` (Task 5).
2. **A real TS export imported on iOS, then exported again** (spec §8's "done when"). Pinned by a backup scenario: TS-authored backup JSON → `importLibrary` → `exportLibrary` (Task 4, replayed in Task 7).
3. **JSON columns written by Swift must match the JS text** (`seasons_json`, `genres_json`): JS `JSON.stringify` doesn't escape `/`, while Swift's `JSONEncoder` does. Pinned by the database dump comparison and a `jsonText` unit test (Task 5).
4. **Ordering ties.** Several tracks share one `createdAt` in tests and in fast real use, and JS's stable sort keeps insertion order. Pinned by scenarios that add several tracks at the same `now` and list them (Task 2); the Swift sort is stable by construction (Task 6).
5. **Atomicity.** A rejected input (bad draft, out-of-range position, invalid backup) leaves the database untouched. Pinned by scenarios whose throwing step is followed by the final dump (Tasks 2–4).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `src/db/schema.ts` | `export` the `MIGRATIONS` array (no behaviour change) |
| `shared/testTitles.ts` | `testTitles(source)`, shared by the I2 fixture test and the scenario test |
| `shared/scenarios/types.ts` | `Scenario`, `Step`, `Ref` |
| `shared/scenarios/registry.ts` | call name → TS repository function |
| `shared/scenarios/play.ts` | `play(scenario)`: run, normalise ids, dump |
| `shared/scenarios/cases/{whatsNew,tracks,progress,ratings,backup}.ts` | authored scenarios |
| `shared/scenarios/{area}.json` | recorded scenarios |
| `shared/scenarios/__tests__/scenarios.test.ts` | record / compare / coverage |
| `shared/schema/__tests__/schema.test.ts` | also emits `Migrations.generated.swift` |
| `apple/IrisCore/Package.swift` | GRDB dependency |
| `apple/IrisCore/Sources/IrisCore/Persistence/Migrations.generated.swift` | GENERATED: the TS migration strings |
| `…/Persistence/{Migrate,JSONText,JSONValue,TrackRepo,AddTrack,RatingRepo,WhatsNewRepo,Backup}.swift` | ports |
| `…/Providers/{ProviderTypes,Manual,Images,ProviderIds}.swift` | what Persistence needs from `src/providers` |
| `apple/IrisCore/Tests/IrisCoreTests/Scenarios/{ScenarioRunner,Registry+*}.swift`, `ScenarioTests.swift`, `SchemaTests.swift` | Swift replay |

---

### Task 1: TS — migrations export, shared title helper, scenario harness, `whatsNew` area

**Files:**
- Modify: `src/db/schema.ts` (`const MIGRATIONS` → `export const MIGRATIONS`)
- Create: `shared/testTitles.ts`. Modify: `shared/fixtures/__tests__/fixtures.test.ts` (import `testTitles`; delete the local copy)
- Modify: `shared/schema/__tests__/schema.test.ts` (emit the Swift migrations)
- Create: `shared/scenarios/{types,registry,play}.ts`, `shared/scenarios/cases/whatsNew.ts`, `shared/scenarios/__tests__/scenarios.test.ts`
- Create (recorded): `shared/scenarios/whatsNew.json`, `apple/IrisCore/Sources/IrisCore/Persistence/Migrations.generated.swift`

**Interfaces:**
- Produces:
  - `Scenario = { name: string; steps: Step[] }` and `Step = { call: string; args: unknown[] }`.
  - `Ref = { $ref: number; path?: string; json?: true }`: an earlier step's result (0-based), with an optional dotted `path` (array indexes allowed). `json: true` passes it `JSON.stringify`'d.
  - Recorded file: `{ area, generatedBy, timezone: "UTC", scenarios: [{ name, steps: [{ call, args, result } | { call, args, throws }], dump: { series, entry, rating, app_meta } }] }`. Rows come in rowid order, and every id is replaced by `#n`, numbered in first-seen order: after each step, series ids then entry ids, each in rowid order.
  - Call names, as Swift must mirror them: `addTrack, createSeriesTrack, createStandaloneTrack, firstEntryOf, listTracks, getTrackDetail, advanceEntry, deleteTrack, renameTrack, returnTrackToBacklog, resumeTrack, setTrackPosition, completeTrack, listRanking, ratingProfileOf, getRating, allScores, saveRating, removeRating, markAnnounced, pendingAnnouncement, exportLibrary, importLibrary, sql, query`.

- [ ] **Step 1: Shared title helper**

`shared/testTitles.ts`:

```ts
/**
 * Every test title in a jest source file (test.each templates cut at the
 * first `%`/`$`). Coverage of a recorded corpus is checked by title, not by
 * count, so a new test with no matching case fails (I2 review).
 */
export function testTitles(source: string): string[] {
  const titles: string[] = [];
  const re = /\b(?:it|test)(\.each)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    if (m[1]) {
      for (let depth = 1; depth > 0 && i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        else if (source[i] === ')') depth -= 1;
      }
      while (source[i] !== '(' && i < source.length) i += 1;
      i += 1;
    }
    const lit = /^\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(source.slice(i));
    if (lit) titles.push(lit[2]!.split(/[%$]/)[0]!.trim());
  }
  return titles;
}

export const normTitle = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
```

In `shared/fixtures/__tests__/fixtures.test.ts`, delete the local `testTitles` and `norm` functions and their doc comment, add `import { normTitle as norm, testTitles } from '../../testTitles';`, and leave everything else unchanged.

Run: `npx jest shared/fixtures`
Expected: the same pass count as before (49).

- [ ] **Step 2: Export the migrations and emit them for Swift**

In `src/db/schema.ts`, change `const MIGRATIONS: readonly string[] = [` to `export const MIGRATIONS: readonly string[] = [`.

In `shared/schema/__tests__/schema.test.ts`, change the import to `import { MIGRATIONS, migrate } from '@/db/schema';` and append:

```ts
const SWIFT_MIGRATIONS = path.resolve(__dirname, '../../../apple/IrisCore/Sources/IrisCore/Persistence/Migrations.generated.swift');

/** A Swift string literal holding `s` exactly. */
function swiftLiteral(s: string): string {
  return `"${s.replace(/[\\"\n\r\t]|[\u0000-\u001f]/g, (c) =>
    c === '\\' ? '\\\\' : c === '"' ? '\\"' : c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t' : `\\u{${c.charCodeAt(0).toString(16)}}`,
  )}"`;
}

function swiftMigrations(): string {
  return [
    '// GENERATED by shared/schema/__tests__/schema.test.ts (npm run fixtures:record) — do not edit.',
    '// The migrations in src/db/schema.ts, verbatim: SQLite stores each CREATE statement\'s',
    '// text, so shared/schema/schema.sql only matches when these exact strings run (Iris I4).',
    '',
    'let migrations: [String] = [',
    ...MIGRATIONS.map((m) => `    ${swiftLiteral(m)},`),
    ']',
    '',
  ].join('\n');
}

test(process.env.RECORD_FIXTURES === '1' ? 'records the Swift migrations' : 'the Swift migrations match src/db/schema.ts (re-run `npm run fixtures:record`)', () => {
  if (process.env.RECORD_FIXTURES === '1') {
    fs.mkdirSync(path.dirname(SWIFT_MIGRATIONS), { recursive: true });
    fs.writeFileSync(SWIFT_MIGRATIONS, swiftMigrations());
    return;
  }
  expect(fs.readFileSync(SWIFT_MIGRATIONS, 'utf8')).toBe(swiftMigrations());
});
```

Run: `npx jest shared/schema`
Expected: FAIL, ENOENT on `Migrations.generated.swift`.

Then run `npm run fixtures:record && npx jest shared/schema`. Expected: PASS. The generated file has 10 literals, each beginning `"\n  `.

- [ ] **Step 3: The scenario harness**

`shared/scenarios/types.ts`:

```ts
/** A value from an earlier step's result (0-based), optionally a dotted path
 * into it (array indexes allowed); `json: true` passes it JSON.stringify'd. */
export type Ref = { $ref: number; path?: string; json?: true };
export type Step = { call: string; args: unknown[] };
/** A sequence of repository calls on a fresh, migrated database (Iris I4). */
export type Scenario = { name: string; steps: Step[] };
```

`shared/scenarios/registry.ts`:

```ts
import { addTrack } from '@/data/addTrack';
import { exportLibrary, importLibrary } from '@/data/backup';
import * as ratings from '@/data/ratingRepo';
import * as tracks from '@/data/trackRepo';
import { markAnnounced, pendingAnnouncement } from '@/data/whatsNew';
import type { SqlDriver } from '@/db/driver';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Call = (db: SqlDriver, ...args: any[]) => Promise<unknown>;
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** Every repository call a scenario may make. Swift's runner mirrors this table. */
export const scenarioCalls: Record<string, Call> = {
  addTrack: (db, input, now) => addTrack(db, input, now),
  createSeriesTrack: (db, draft, now, startAt) => tracks.createSeriesTrack(db, draft, now, opt(startAt)),
  createStandaloneTrack: (db, input, now) => tracks.createStandaloneTrack(db, input, now),
  firstEntryOf: (db, track) => tracks.firstEntryOf(db, track),
  listTracks: (db, shelf, category) => tracks.listTracks(db, shelf, opt(category)),
  getTrackDetail: (db, kind, id) => tracks.getTrackDetail(db, kind, id),
  advanceEntry: (db, entryId, now) => tracks.advanceEntry(db, entryId, now),
  deleteTrack: (db, track) => tracks.deleteTrack(db, track),
  renameTrack: (db, track, title) => tracks.renameTrack(db, track, title),
  returnTrackToBacklog: (db, track) => tracks.returnTrackToBacklog(db, track),
  resumeTrack: (db, track) => tracks.resumeTrack(db, track),
  setTrackPosition: (db, seriesId, target, now) => tracks.setTrackPosition(db, seriesId, target, now),
  completeTrack: (db, track, now) => tracks.completeTrack(db, track, now),
  listRanking: (db, category) => ratings.listRanking(db, category),
  ratingProfileOf: (db, track) => ratings.ratingProfileOf(db, track),
  getRating: (db, track) => ratings.getRating(db, track),
  // A Map: recorded as an object in insertion order.
  allScores: async (db) => Object.fromEntries(await ratings.allScores(db)),
  saveRating: (db, track, sentiment, index, now) => ratings.saveRating(db, track, sentiment, index, now),
  removeRating: (db, track) => ratings.removeRating(db, track),
  markAnnounced: (db, version) => markAnnounced(db, version),
  pendingAnnouncement: (db, version, notes) => pendingAnnouncement(db, version, notes),
  // Recorded as parsed JSON so ids inside can be normalised; key order is irrelevant.
  exportLibrary: async (db) => JSON.parse(await exportLibrary(db)),
  // A JSON syntax error's text is V8's own; both platforms report this instead.
  importLibrary: async (db, json: string) => {
    try {
      JSON.parse(json);
    } catch {
      throw new Error('Backup is not valid JSON');
    }
    return importLibrary(db, json);
  },
  // The raw SQL the TS tests use for setup and inspection. An SQLite error's
  // message is sqlite3_errmsg on both platforms.
  sql: (db, sql: string, params) => db.run(sql, opt(params) ?? []),
  query: (db, sql: string, params) => db.all(sql, opt(params) ?? []),
};
```

`shared/scenarios/play.ts`:

```ts
import type { SqlDriver } from '@/db/driver';
import { migrate } from '@/db/schema';
import { createMemoryDriver } from '../../test/memoryDriver';
import { scenarioCalls } from './registry';
import type { Scenario } from './types';

const TABLES = ['series', 'entry', 'rating', 'app_meta'] as const;

function resolve(value: unknown, results: unknown[]): unknown {
  if (Array.isArray(value)) return value.map((v) => resolve(v, results));
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$ref === 'number') {
      let v: unknown = results[o.$ref];
      for (const key of typeof o.path === 'string' ? o.path.split('.') : []) v = (v as Record<string, unknown>)[key];
      return o.json === true ? JSON.stringify(v) : v;
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, resolve(v, results)]));
  }
  return value;
}

/** Random ids → `#n`, numbered in insertion order: after each step, series
 * then entry ids, each by rowid. Swift numbers its own ids the same way. */
class IdTokens {
  private readonly tokens = new Map<string, string>();

  async learn(db: SqlDriver): Promise<void> {
    for (const table of ['series', 'entry']) {
      for (const { id } of await db.all<{ id: string }>(`SELECT id FROM ${table} ORDER BY rowid`)) {
        if (!this.tokens.has(id)) this.tokens.set(id, `#${this.tokens.size + 1}`);
      }
    }
  }

  normalize(value: unknown): unknown {
    if (value === undefined) return null;
    if (typeof value === 'string') {
      let out = value;
      for (const [id, token] of [...this.tokens].sort((a, b) => b[0].length - a[0].length)) out = out.split(id).join(token);
      return out;
    }
    if (value instanceof Map) return this.normalize(Object.fromEntries(value));
    if (Array.isArray(value)) return value.map((v) => this.normalize(v));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, this.normalize(v)]),
      );
    }
    return value;
  }
}

export async function play(scenario: Scenario): Promise<Record<string, unknown>> {
  const db = createMemoryDriver();
  await migrate(db);
  const ids = new IdTokens();
  const results: unknown[] = [];
  const steps: Record<string, unknown>[] = [];
  for (const step of scenario.steps) {
    const call = scenarioCalls[step.call];
    if (!call) throw new Error(`No scenario call "${step.call}" (scenario "${scenario.name}")`);
    try {
      const result = await call(db, ...(resolve(step.args, results) as unknown[]));
      results.push(result);
      await ids.learn(db);
      steps.push({ call: step.call, args: step.args, result: ids.normalize(result) });
    } catch (e) {
      results.push(null);
      await ids.learn(db);
      steps.push({ call: step.call, args: step.args, throws: ids.normalize((e as Error).message) });
    }
  }
  const dump: Record<string, unknown> = {};
  for (const table of TABLES) dump[table] = ids.normalize(await db.all(`SELECT * FROM ${table} ORDER BY rowid`));
  return { name: scenario.name, steps, dump };
}
```

`shared/scenarios/__tests__/scenarios.test.ts`:

```ts
/**
 * @jest-environment ./shared/fixtures/utcEnvironment.js
 */
import * as fs from 'fs';
import * as path from 'path';
import { normTitle, testTitles } from '../../testTitles';
import { play } from '../play';
import type { Scenario } from '../types';
import { scenarios as whatsNew } from '../cases/whatsNew';

/** Area → its scenarios and the src/data tests they carry over. */
const AREAS: Record<string, { scenarios: Scenario[]; testFiles: string[] }> = {
  whatsNew: { scenarios: whatsNew, testFiles: ['whatsNew.test.ts'] },
};

/** src/data tests that are not scenarios yet: they need real providers (I5). */
const LATER = ['backfillMetadata.test.ts', 'syncSeriesUnit.test.ts'];

const HERE = path.resolve(__dirname, '..');
const DATA_TESTS = path.resolve(__dirname, '../../../src/data/__tests__');
const RECORD = process.env.RECORD_FIXTURES === '1';

describe.each(Object.entries(AREAS))('%s', (area, { scenarios, testFiles }) => {
  test('scenario names are unique', () => {
    const names = scenarios.map((s) => s.name);
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  test('every src/data test has a scenario named after it', () => {
    const names = scenarios.map((s) => normTitle(s.name));
    const titles = testFiles.flatMap((f) => testTitles(fs.readFileSync(path.join(DATA_TESTS, f), 'utf8')));
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((t) => !names.some((n) => n.includes(normTitle(t))))).toEqual([]);
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
```

(The "every test file feeds an area" test fails until Task 4 adds the last area. That's intended: it is Task 4's completion gate. Until then, run `npx jest shared/scenarios -t '^(?!.*every src/data test file)'` to filter it out, or accept the single known failure. **Don't commit** with any other failure.)

`shared/scenarios/cases/whatsNew.ts`, from `src/data/__tests__/whatsNew.test.ts`:

```ts
import type { Scenario } from '../types';

const NOTES = [{ version: '1.4.0', title: 'New', items: [] }];

/** The library row is seeded with raw SQL rather than addTrack, so this area
 * replays in Swift before addTrack is ported (Task 5 before Task 6). */
const SEED_BOOK = {
  call: 'sql',
  args: ["INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES ('book-1', NULL, 'Dune', NULL, 'book', 'unstarted', '2026-10-01T12:00:00.000Z')"],
};

export const scenarios: Scenario[] = [
  {
    name: 'an existing library sees the note until it is dismissed',
    steps: [
      SEED_BOOK,
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'markAnnounced', args: ['1.4.0'] },
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
    ],
  },
  {
    name: 'a fresh install is recorded silently, then announces its next update',
    steps: [
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'query', args: ['SELECT key, value FROM app_meta'] },
      { call: 'pendingAnnouncement', args: ['1.5.0', [{ version: '1.5.0', title: 'Next', items: [] }]] },
    ],
  },
];
```

Add `shared/scenarios` to the record script: in `package.json`, `"fixtures:record"` is already `RECORD_FIXTURES=1 jest shared/`, which covers it.

- [ ] **Step 4: Record and check**

Run: `npm run fixtures:record && npx jest shared/ 2>&1 | grep -E "Tests:|✕"`
Expected: only the known "every src/data test file feeds…" failure.

Read `shared/scenarios/whatsNew.json`. Expected:
- First scenario:
  - the seed gives `null`;
  - both `pendingAnnouncement` steps give the `New` note;
  - markAnnounced gives `null`, then `null`;
  - `dump.entry[0].id` is `'#1'` (the seeded `book-1`, normalised);
  - `dump.app_meta` holds `1.4.0`.
- Second scenario: `null`, then `[{ key: 'last_announced_version', value: '1.4.0' }]`, then the `Next` note.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/db/schema.ts shared/testTitles.ts shared/fixtures/__tests__/fixtures.test.ts shared/schema/__tests__/schema.test.ts shared/scenarios/types.ts shared/scenarios/registry.ts shared/scenarios/play.ts shared/scenarios/cases/whatsNew.ts shared/scenarios/__tests__/scenarios.test.ts shared/scenarios/whatsNew.json apple/IrisCore/Sources/IrisCore/Persistence/Migrations.generated.swift
git commit -m "test(shared): record data-layer scenarios, and generate the Swift migrations

A29 (user decision 2026-10-07): repository parity is proven by replaying
recorded call sequences on both platforms, ids normalised to insertion
order, instead of hand-mirrored tests. The migration SQL is emitted for
Swift verbatim because SQLite stores DDL text and schema.sql must match.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tasks 2–4: Author the remaining scenario areas (TS side)

**How to author a scenario** (the rule for all three tasks):
- For every `test(...)` in the area's test files, write a scenario whose `name` **contains** the test title.
- Its `steps` replay the test's calls. Repository calls go through their registry names. Raw `db.run` becomes `sql`, and `db.all` becomes `query`.
- Ids flow through `{ $ref: n, path: '…' }`. For example, the created track is `{ $ref: 0 }`, and the first currently-shelf row's next entry is `{ $ref: 2, path: '0.nextEntryId' }`.
- Expectations aren't written: they're recorded. After recording, read the JSON and check each scenario's results agree with what the test asserts. Disagreement means wrong steps.
- **Can't be a scenario:** a test that calls a pure helper directly (e.g. `toEntry`) or needs a mocked provider. Write a scenario that reaches the same behaviour through repository calls, named after the test. If even that's impossible, list the title in that area's `NOT_A_SCENARIO` array with a one-line reason, and change the coverage test to skip listed titles. Expect this for very few tests; each one is reported in the I4 summary.
- **Seasons objects** must be written `{ number, episodeCount }` in that key order, because `JSON.stringify` keeps authored key order and the stored `seasons_json` text is compared.

Each task:
1. Add its areas to `AREAS` in `scenarios.test.ts`.
2. Run `npx jest shared/scenarios` and watch the coverage test fail with the missing titles.
3. Author the scenarios.
4. Run `npm run fixtures:record`, then check the JSON against the tests.
5. Run typecheck and the full jest suite, then commit.

#### Task 2: `tracks`

`tracks: { scenarios: tracks, testFiles: ['trackRepo.test.ts', 'trackDetail.test.ts', 'addAndStart.test.ts', 'seriesTitleOrdinal.test.ts'] }`, with cases in `shared/scenarios/cases/tracks.ts`.

Worked example: the first `addAndStart.test.ts` test.

```ts
{
  name: 'addTrack reports what it created, so the caller can start it immediately',
  steps: [
    { call: 'addTrack', args: [{ title: 'Berserk', category: 'manga', count: 3 }, NOW] },
    { call: 'firstEntryOf', args: [{ $ref: 0 }] },
    { call: 'advanceEntry', args: [{ $ref: 1, path: 'id' }, NOW] },
    { call: 'listTracks', args: ['currently'] },
  ],
},
```

Add one scenario beyond the tests, for **Review Focus 4**: `'Iris parity: tracks added at the same instant list in insertion order'`. It adds three books with the same `now`, then lists the backlog.

Also for **Review Focus 5**: `'Iris parity: a rejected draft writes nothing'`. It calls `createSeriesTrack` with an entry whose ordinal is `-1` (it throws), then makes no further steps; the dump must be empty.

Commit message: `test(shared): record track repository scenarios`.

#### Task 3: `progress`

`progress: { scenarios: progress, testFiles: ['advanceTrack.test.ts', 'oneTapAdvance.test.ts', 'ongoing.test.ts', 'setTrackPosition.test.ts', 'completeTrack.test.ts', 'trackActions.test.ts'] }`, with cases in `shared/scenarios/cases/progress.ts`.

Commit message: `test(shared): record advance, position, complete and track-action scenarios`.

#### Task 4: `ratings` and `backup`

- `ratings: { scenarios: ratings, testFiles: ['ratingRepo.test.ts'] }`.
- `backup: { scenarios: backup, testFiles: ['backup.test.ts'] }`.

Add **Review Focus 2**, `'Iris parity: a TS backup imports and round-trips'`. Its first step is `importLibrary` of a literal backup string. Build it in the cases file with `JSON.stringify` from a fixed object, version 1, containing:
- a show with `seasons`, metadata and `genres`;
- an ongoing comic;
- a book with a `metadataCheckedAt`;
- a movie;
- ratings in two categories;
- titles containing `"`, `/` and `é` (so the JSON-column escaping is exercised).

Then `exportLibrary`, then `listTracks('backlog')`, `listTracks('currently')`, `listTracks('done')`.

After this task, the "every src/data test file feeds a scenario area" test **passes**. That's the gate.

Commit message: `test(shared): record rating and backup scenarios, including a cross-platform backup`.

---

### Task 5: Swift — GRDB, migrations, schema parity, JSON text, scenario runner, whatsNew repo

**Files:**
- Modify: `apple/IrisCore/Package.swift`
- Create: `…/Persistence/{Migrate,JSONText,JSONValue,WhatsNewRepo}.swift`
- Create: `apple/IrisCore/Tests/IrisCoreTests/SchemaTests.swift`, `…/Scenarios/{ScenarioRunner,Registry+WhatsNew}.swift`, `…/ScenarioTests.swift`, `…/JSONTextTests.swift`

**Interfaces:**
- Produces:
  - `public func migrate(_ db: Database) throws` and `public func openLibrary(at path: String) throws -> DatabaseQueue` (migrated, foreign keys on).
  - `func jsonText(_ strings: [String]) -> String` and `func jsonText(_ seasons: [SeasonBoundary]) -> String`: JS `JSON.stringify` output.
  - `public enum JSONValue` (Codable, Sendable).
  - `markAnnounced(_:version:)` and `pendingAnnouncement(_:version:notes:)`.
  - Test side: `typealias ScenarioCall = @Sendable (DatabaseQueue, [JSON]) async throws -> JSON` and `func runScenarios(_ area: String, _ calls: [String: ScenarioCall]) async throws -> [String]`.

- [ ] **Step 1: Add GRDB**

`apple/IrisCore/Package.swift`:

```swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "IrisCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [
        .library(name: "IrisCore", targets: ["IrisCore"]),
    ],
    dependencies: [
        // Spec §2.2: plain SQLite, so the schema is the TS app's schema, not a lookalike.
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "7.0.0"),
    ],
    targets: [
        .target(name: "IrisCore", dependencies: [.product(name: "GRDB", package: "GRDB.swift")]),
        .testTarget(name: "IrisCoreTests", dependencies: ["IrisCore", .product(name: "GRDB", package: "GRDB.swift")]),
    ]
)
```

Run: `swift build --package-path apple/IrisCore 2>&1 | tail -3`
Expected: it fetches GRDB and `Build complete!`.

Then `xcodegen generate --spec apple/project.yml --project apple`. The app target links `IrisCore`, so GRDB comes with it transitively, and `project.yml` needs no change. `Package.resolved` now exists under `apple/IrisCore/`: commit it, so builds are reproducible.

- [ ] **Step 2: Write the failing schema and JSON-text tests**

`apple/IrisCore/Tests/IrisCoreTests/SchemaTests.swift`:

```swift
import Foundation
import GRDB
import XCTest
@testable import IrisCore

/// Spec §3: the Swift database must be the TS schema, byte for byte, so a
/// database or backup moves between platforms unchanged.
final class SchemaTests: XCTestCase {
    private static let schemaFile = fixturesDirectory
        .deletingLastPathComponent().appendingPathComponent("schema/schema.sql")

    /// The same text shared/schema/__tests__/schema.test.ts writes.
    private func dump(_ db: Database) throws -> String {
        let version = try Int.fetchOne(db, sql: "SELECT version FROM schema_version") ?? -1
        let sql = try String.fetchAll(db, sql: "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name")
        return [
            "-- GENERATED by shared/schema/__tests__/schema.test.ts (npm run fixtures:record) — do not edit.",
            "-- The schema after every migration in src/db/schema.ts. Iris I4 must reproduce it.",
            "-- schema_version: \(version)",
            "",
            sql.map { jsTrim($0) + ";" }.joined(separator: "\n\n"),
            "",
        ].joined(separator: "\n")
    }

    func testMigratedSchemaIsTheTSSchemaByteForByte() throws {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        let actual = try queue.read { try dump($0) }
        XCTAssertEqual(actual, try String(contentsOf: Self.schemaFile, encoding: .utf8))
    }

    func testMigrateIsIdempotent() throws {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        try queue.write { try migrate($0) }
        XCTAssertEqual(try queue.read { try Int.fetchOne($0, sql: "SELECT version FROM schema_version") }, migrations.count)
    }

    func testSchemaVersionConstantMatchesTheMigrations() {
        XCTAssertEqual(IrisSchema.version, migrations.count)
    }
}
```

`apple/IrisCore/Tests/IrisCoreTests/JSONTextTests.swift`:

```swift
import XCTest
@testable import IrisCore

/// Review Focus 3: JSON columns Swift writes must be the text JS writes.
final class JSONTextTests: XCTestCase {
    func testStringArraysMatchJSONStringify() {
        // JSON.stringify(['Sci-Fi/Fantasy', 'Rock "n" Roll', 'é', 'a\\b', '\n\u0001'])
        XCTAssertEqual(
            jsonText(["Sci-Fi/Fantasy", "Rock \"n\" Roll", "é", "a\\b", "\n\u{01}"]),
            #"["Sci-Fi/Fantasy","Rock \"n\" Roll","é","a\\b","\n\u0001"]"#
        )
        XCTAssertEqual(jsonText([String]()), "[]")
    }

    func testSeasonsMatchJSONStringify() {
        XCTAssertEqual(jsonText([SeasonBoundary(number: 1, episodeCount: 10)]), #"[{"number":1,"episodeCount":10}]"#)
    }
}
```

Run: `swift test --package-path apple/IrisCore 2>&1 | grep error: | sed 's/.*error: //' | sort -u | head`
Expected: `cannot find 'migrate'`, `cannot find 'migrations'`, `cannot find 'jsonText'`.

- [ ] **Step 3: Implement migrate, JSON text and JSONValue**

`…/Persistence/Migrate.swift`:

```swift
import GRDB

/// Port of src/db/schema.ts `migrate`: pending migrations in one transaction,
/// tracked in the TS app's own `schema_version` table (not GRDB's migrator,
/// whose bookkeeping table would make the schema differ from the TS one).
public func migrate(_ db: Database) throws {
    try db.execute(sql: "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)")
    let current = try Int.fetchOne(db, sql: "SELECT version FROM schema_version LIMIT 1") ?? 0
    if current >= migrations.count { return }
    try db.inSavepoint {
        for sql in migrations[current...] { try db.execute(sql: sql) }
        try db.execute(sql: "DELETE FROM schema_version")
        try db.execute(sql: "INSERT INTO schema_version (version) VALUES (?)", arguments: [migrations.count])
        return .commit
    }
}

/// The library database at `path`, migrated. GRDB enables foreign keys by
/// default, which `ON DELETE CASCADE` (deleting a series) relies on.
public func openLibrary(at path: String) throws -> DatabaseQueue {
    let queue = try DatabaseQueue(path: path)
    try queue.write { try migrate($0) }
    return queue
}
```

`…/Persistence/JSONText.swift`:

```swift
/// JS `JSON.stringify` text for the JSON the TS app stores in columns
/// (`genres_json`, `seasons_json`). Swift's JSONEncoder escapes "/" and
/// doesn't promise key order; the stored text is compared across platforms.
func jsonText(_ strings: [String]) -> String {
    "[" + strings.map(jsonString).joined(separator: ",") + "]"
}

func jsonText(_ seasons: [SeasonBoundary]) -> String {
    "[" + seasons.map { "{\"number\":\($0.number),\"episodeCount\":\($0.episodeCount)}" }.joined(separator: ",") + "]"
}

/// JSON.stringify of one string: escapes `"`, `\` and control characters
/// (named where JSON has a name, else \u00XX), nothing else.
func jsonString(_ s: String) -> String {
    var out = "\""
    for scalar in s.unicodeScalars {
        switch scalar {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\u{08}": out += "\\b"
        case "\u{0C}": out += "\\f"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        case _ where scalar.value < 0x20:
            out += "\\u" + String(repeating: "0", count: 4 - String(scalar.value, radix: 16).count) + String(scalar.value, radix: 16)
        default: out.unicodeScalars.append(scalar)
        }
    }
    return out + "\""
}
```

`…/Persistence/JSONValue.swift`:

```swift
import Foundation

/// Untyped JSON, for validating a backup field by field the way backup.ts
/// does (`typeof value === 'string'`, …) before trusting any of it.
public enum JSONValue: Codable, Equatable, Sendable {
    case null, bool(Bool), number(Double), string(String), array([JSONValue]), object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case let .bool(b): try c.encode(b)
        case let .number(n): try c.encode(n)
        case let .string(s): try c.encode(s)
        case let .array(a): try c.encode(a)
        case let .object(o): try c.encode(o)
        }
    }

    var string: String? { if case let .string(s) = self { s } else { nil } }
    var object: [String: JSONValue]? { if case let .object(o) = self { o } else { nil } }

    /// JS `String(value)`, for messages like "Unsupported backup version: 2".
    var jsDescription: String {
        switch self {
        case .null: "null"
        case let .bool(b): b ? "true" : "false"
        case let .number(n): jsNumberString(n)
        case let .string(s): s
        case .array, .object: "[object Object]"
        }
    }
}
```

Run: `swift test --package-path apple/IrisCore --filter "SchemaTests|JSONTextTests"`
Expected: PASS (5 tests). If the schema test fails, look at the first differing line: it's a migration string, so re-run `npm run fixtures:record`. Never hand-edit the generated file.

- [ ] **Step 4: Write the scenario runner and the whatsNew test (red)**

`apple/IrisCore/Tests/IrisCoreTests/Scenarios/ScenarioRunner.swift`:

```swift
import Foundation
import GRDB
@testable import IrisCore

typealias ScenarioCall = @Sendable (DatabaseQueue, [JSON]) async throws -> JSON

private struct ScenarioFile: Decodable {
    let area: String
    let timezone: String
    let scenarios: [RecordedScenario]
}

private struct RecordedScenario: Decodable {
    let name: String
    let steps: [RecordedStep]
    let dump: JSON
}

private struct RecordedStep: Decodable {
    let call: String
    let args: [JSON]
    let result: JSON?
    let `throws`: String?
}

let scenariosDirectory = fixturesDirectory.deletingLastPathComponent().appendingPathComponent("scenarios")

/// `{ "$ref": n, "path": "a.0.b", "json": true }` → the value from step n.
private func resolve(_ value: JSON, _ results: [JSON]) -> JSON {
    switch value {
    case let .array(items): return .array(items.map { resolve($0, results) })
    case let .object(o):
        guard case let .number(n)? = o["$ref"] else { return .object(o.mapValues { resolve($0, results) }) }
        var v = results[Int(n)]
        if case let .string(path)? = o["path"] {
            for key in path.split(separator: ".") {
                switch v {
                case let .array(a): v = Int(key).flatMap { $0 < a.count ? a[$0] : nil } ?? .null
                case let .object(fields): v = fields[String(key)] ?? .null
                default: v = .null
                }
            }
        }
        if case .bool(true)? = o["json"] { return .string(v.description) }
        return v
    default: return value
    }
}

/// Mirrors play.ts: ids → `#n` in insertion order (series, then entry, by rowid).
private final class IdTokens {
    private var order: [String] = []
    private var tokens: [String: String] = [:]

    func learn(_ queue: DatabaseQueue) throws {
        let ids = try queue.read { db in
            try String.fetchAll(db, sql: "SELECT id FROM series ORDER BY rowid")
                + String.fetchAll(db, sql: "SELECT id FROM entry ORDER BY rowid")
        }
        for id in ids where tokens[id] == nil {
            order.append(id)
            tokens[id] = "#\(order.count)"
        }
    }

    func normalize(_ value: JSON) -> JSON {
        switch value {
        case let .string(s):
            var out = s
            for id in order.sorted(by: { $0.count > $1.count }) { out = out.replacingOccurrences(of: id, with: tokens[id]!) }
            return .string(out)
        case let .array(a): return .array(a.map(normalize))
        case let .object(o): return .object(o.mapValues(normalize))
        default: return value
        }
    }
}

private func rowJSON(_ row: Row) -> JSON {
    var object: [String: JSON] = [:]
    for (column, value) in row {
        switch value.storage {
        case .null: object[column] = .null
        case let .int64(i): object[column] = .number(Double(i))
        case let .double(d): object[column] = .number(d)
        case let .string(s): object[column] = .string(s)
        case .blob: object[column] = .string("<blob>")
        }
    }
    return .object(object)
}

private func dump(_ queue: DatabaseQueue) throws -> JSON {
    try queue.read { db in
        var tables: [String: JSON] = [:]
        for table in ["series", "entry", "rating", "app_meta"] {
            tables[table] = .array(try Row.fetchAll(db, sql: "SELECT * FROM \(table) ORDER BY rowid").map(rowJSON))
        }
        return .object(tables)
    }
}

/// Replays every scenario of one area; returns one line per divergence. A
/// call with no Swift entry fails, never skips.
func runScenarios(_ area: String, _ calls: [String: ScenarioCall]) async throws -> [String] {
    let url = scenariosDirectory.appendingPathComponent("\(area).json")
    let file = try JSONDecoder().decode(ScenarioFile.self, from: Data(contentsOf: url))
    guard file.timezone == "UTC" else { return ["\(area): recorded in \(file.timezone), expected UTC"] }
    var failures: [String] = []
    for scenario in file.scenarios {
        let queue = try DatabaseQueue()
        try queue.write { try migrate($0) }
        let ids = IdTokens()
        var results: [JSON] = []
        for (i, step) in scenario.steps.enumerated() {
            let label = "\(scenario.name) — step \(i) \(step.call)"
            guard let call = calls[step.call] else {
                failures.append("\(label): no Swift scenario call")
                results.append(.null)
                continue
            }
            do {
                let raw = try await call(queue, step.args.map { resolve($0, results) })
                results.append(raw)
                try ids.learn(queue)
                let got = ids.normalize(raw)
                if let t = step.throws { failures.append("\(label): expected throw \"\(t)\", got \(got)") }
                else if !fixtureMatches(got, step.result ?? .null) { failures.append("\(label): expected \(step.result ?? .null), got \(got)") }
            } catch {
                results.append(.null)
                try ids.learn(queue)
                let message: String = switch error {
                case let e as DomainError: e.message
                case let e as DatabaseError: e.message ?? "\(e)"
                default: "\(error)"
                }
                let got = ids.normalize(.string(message))
                if got != step.throws.map(JSON.string) {
                    failures.append("\(label): threw \(got), expected \(step.throws.map { "\"\($0)\"" } ?? "a value")")
                }
            }
        }
        let actual = ids.normalize(try dump(queue))
        if !fixtureMatches(actual, scenario.dump) { failures.append("\(scenario.name) — final database: expected \(scenario.dump), got \(actual)") }
    }
    return failures
}

/// Runs `body` as one write transaction, as the app does for each call.
func write<T: Sendable>(_ queue: DatabaseQueue, _ body: @escaping @Sendable (Database) throws -> T) throws -> T {
    try queue.write(body)
}
```

`apple/IrisCore/Tests/IrisCoreTests/ScenarioTests.swift`:

```swift
import Foundation
import XCTest

/// Iris I4 / A29: every recorded data-layer scenario replays identically on GRDB.
final class ScenarioTests: XCTestCase {
    static let pending: Set<String> = ["tracks", "progress", "ratings", "backup"]
    static let ported: Set<String> = ["whatsNew"]

    private func check(_ area: String, _ calls: [String: ScenarioCall]) async throws {
        let failures = try await runScenarios(area, calls)
        XCTAssert(failures.isEmpty, "\(area): \(failures.count) divergence(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryScenarioAreaIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: scenariosDirectory.path)
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
    }

    func testWhatsNew() async throws { try await check("whatsNew", whatsNewCalls.merging(sqlCalls) { a, _ in a }) }
}
```

`…/Scenarios/Registry+WhatsNew.swift`:

```swift
import GRDB
@testable import IrisCore

let whatsNewCalls: [String: ScenarioCall] = [
    "markAnnounced": { q, a in let v: String = try arg(a, 0); try write(q) { try markAnnounced($0, version: v) }; return .null },
    "pendingAnnouncement": { q, a in
        let (v, notes): (String, [ReleaseNote]) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try pendingAnnouncement($0, version: v, notes: notes) })
    },
]

/// Raw SQL steps (test setup/inspection), shared by every area.
let sqlCalls: [String: ScenarioCall] = [
    "sql": { q, a in
        let (sql, params): (String, [JSONValue]?) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try $0.execute(sql: sql, arguments: StatementArguments((params ?? []).map(\.databaseValue))) }
        return .null
    },
    "query": { q, a in
        let (sql, params): (String, [JSONValue]?) = (try arg(a, 0), try arg(a, 1))
        let rows = try q.read { try Row.fetchAll($0, sql: sql, arguments: StatementArguments((params ?? []).map(\.databaseValue))) }
        return .array(rows.map(rowJSONForQuery))
    },
]
```

`rowJSON` is private to `ScenarioRunner.swift`. Make it internal under the name `rowJSONForQuery`, and have `dump` use it too. Add to `JSONValue.swift` (library side) an internal accessor the `sql` call needs:

```swift
import GRDB

extension JSONValue {
    /// A SQL parameter, as better-sqlite3 binds the same JS value.
    var databaseValue: DatabaseValue {
        switch self {
        case .null: .null
        case let .bool(b): (b ? 1 : 0).databaseValue
        case let .number(n): n == n.rounded() && abs(n) < 9e15 ? Int64(n).databaseValue : n.databaseValue
        case let .string(s): s.databaseValue
        case .array, .object: .null
        }
    }
}
```

Run: `swift test --package-path apple/IrisCore --filter ScenarioTests 2>&1 | grep -E "error:|divergence" | head`
Expected: compile errors for `markAnnounced` and `pendingAnnouncement`.

- [ ] **Step 5: Port the whatsNew repository**

`…/Persistence/WhatsNewRepo.swift`:

```swift
import GRDB

/// Port of src/data/whatsNew.ts (A27).
private let lastAnnounced = "last_announced_version"

/// Record that `version` has been announced (or needs no announcing).
public func markAnnounced(_ db: Database, version: String) throws {
    try db.execute(
        sql: "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        arguments: [lastAnnounced, version]
    )
}

/// The note to show on this launch, if any; a launch with nothing to show
/// records the version straight away.
public func pendingAnnouncement(_ db: Database, version: String, notes: [ReleaseNote]) throws -> ReleaseNote? {
    let lastSeen = try String.fetchOne(db, sql: "SELECT value FROM app_meta WHERE key = ?", arguments: [lastAnnounced])
    let count = try Int.fetchOne(
        db, sql: "SELECT (SELECT COUNT(*) FROM series) + (SELECT COUNT(*) FROM entry WHERE series_id IS NULL) AS n"
    ) ?? 0
    let note = announcementFor(current: version, lastSeen: lastSeen, hasLibrary: count > 0, notes: notes)
    if note == nil && lastSeen != version { try markAnnounced(db, version: version) }
    return note
}
```

Run: `swift test --package-path apple/IrisCore --filter ScenarioTests 2>&1 | grep -E "divergence|step|Executed" | head`
Expected: 0 failures. `testWhatsNew` replays both scenarios, including the final dumps.

- [ ] **Step 6: Commit**

```bash
git add apple/IrisCore/Package.swift apple/IrisCore/Package.resolved apple/IrisCore/Sources/IrisCore/Persistence/Migrate.swift apple/IrisCore/Sources/IrisCore/Persistence/JSONText.swift apple/IrisCore/Sources/IrisCore/Persistence/JSONValue.swift apple/IrisCore/Sources/IrisCore/Persistence/WhatsNewRepo.swift apple/IrisCore/Tests/IrisCoreTests/SchemaTests.swift apple/IrisCore/Tests/IrisCoreTests/JSONTextTests.swift apple/IrisCore/Tests/IrisCoreTests/Scenarios/ScenarioRunner.swift apple/IrisCore/Tests/IrisCoreTests/Scenarios/Registry+WhatsNew.swift apple/IrisCore/Tests/IrisCoreTests/ScenarioTests.swift
git commit -m "feat(iris-core): GRDB with the TS schema byte for byte, and a scenario runner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 6: Swift — providers (manual/images/ids), track repository, addTrack

**Files:**
- Create: `…/Providers/{ProviderTypes,Manual,Images,ProviderIds}.swift`, `…/Persistence/{TrackRepo,AddTrack}.swift`, `…/Scenarios/Registry+Tracks.swift`
- Modify: `ScenarioTests.swift` (move `tracks`, `progress` to `ported`; add `testTracks`, `testProgress`)

**Interfaces:**
- Produces:
  - `SearchResult`, `EntryDraft`, `SeriesDraft`, `unitLabelFor`, `generateEntries`, `maxUnits`, `providerIdFor(_:)`, `httpsUrl`, `googleBooksImage`, `sharpCoverUrl`, `tmdbImage`.
  - `TrackKind`, `TrackRef`, `TrackSummary`, `TrackDetail`, `FirstEntry`, `StandaloneInput`, `AddTrackInput`, `unitTitle`.
  - Repository functions: `createSeriesTrack`, `createStandaloneTrack`, `firstEntryOf`, `listTracks`, `getTrackDetail`, `advanceEntry`, `deleteTrack`, `renameTrack`, `returnTrackToBacklog`, `resumeTrack`, `setTrackPosition`, `completeTrack`, `addTrack`, and `newId()`.

- [ ] **Step 1: Register the calls and watch them fail**

`…/Scenarios/Registry+Tracks.swift`:

```swift
import GRDB
@testable import IrisCore

let trackCalls: [String: ScenarioCall] = [
    "addTrack": { q, a in
        let (input, now): (AddTrackInput, String) = (try arg(a, 0), try arg(a, 1))
        return try await toJSON(addTrack(q, input, now: now))
    },
    "createSeriesTrack": { q, a in
        let (draft, now, start): (SeriesDraft, String, Int?) = (try arg(a, 0), try arg(a, 1), try arg(a, 2))
        return try toJSON(write(q) { try createSeriesTrack($0, draft, now: now, startAtOrdinal: start) })
    },
    "createStandaloneTrack": { q, a in
        let (input, now): (StandaloneInput, String) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try createStandaloneTrack($0, input, now: now) })
    },
    "firstEntryOf": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try firstEntryOf($0, t) }) },
    "listTracks": { q, a in
        let (shelf, category): (Shelf, Category?) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try listTracks($0, shelf: shelf, category: category) })
    },
    "getTrackDetail": { q, a in
        let (kind, id): (TrackKind, String) = (try arg(a, 0), try arg(a, 1))
        return try toJSON(write(q) { try getTrackDetail($0, kind: kind, id: id) })
    },
    "advanceEntry": { q, a in
        let (id, now): (String, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try advanceEntry($0, entryId: id, now: now) }
        return .null
    },
    "deleteTrack": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try deleteTrack($0, t) }; return .null },
    "renameTrack": { q, a in
        let (t, title): (TrackRef, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try renameTrack($0, t, title: title) }
        return .null
    },
    "returnTrackToBacklog": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try returnTrackToBacklog($0, t) }; return .null },
    "resumeTrack": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try resumeTrack($0, t) }; return .null },
    "setTrackPosition": { q, a in
        let (id, target, now): (String, Int, String) = (try arg(a, 0), try arg(a, 1), try arg(a, 2))
        try write(q) { try setTrackPosition($0, seriesId: id, targetOrdinal: target, now: now) }
        return .null
    },
    "completeTrack": { q, a in
        let (t, now): (TrackRef, String) = (try arg(a, 0), try arg(a, 1))
        try write(q) { try completeTrack($0, t, now: now) }
        return .null
    },
]
```

In `ScenarioTests.swift`, move `"tracks"` and `"progress"` from `pending` to `ported`, and add:

```swift
    private static let core = trackCalls.merging(sqlCalls) { a, _ in a }
    func testTracks() async throws { try await check("tracks", Self.core) }
    func testProgress() async throws { try await check("progress", Self.core) }
```

Change `testWhatsNew` to use `whatsNewCalls.merging(Self.core) { a, _ in a }`.

Run `swift test --package-path apple/IrisCore` and expect compile errors.

- [ ] **Step 2: Providers — what Persistence needs from `src/providers`**

`…/Providers/ProviderTypes.swift`:

```swift
/// Port of src/providers/types.ts — the parts the data layer uses (I4).
public struct SearchResult: Codable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var category: Category
    /// How many units; a Double because generateEntries rejects a fraction.
    public var count: Double
    public var ongoing: Bool?
    public var creator: String?
    public var year: String?
    public var thumbnailUrl: String?

    public init(id: String, title: String, category: Category, count: Double, ongoing: Bool? = nil,
                creator: String? = nil, year: String? = nil, thumbnailUrl: String? = nil) {
        self.id = id; self.title = title; self.category = category; self.count = count; self.ongoing = ongoing
        self.creator = creator; self.year = year; self.thumbnailUrl = thumbnailUrl
    }
}

public struct EntryDraft: Codable, Equatable, Sendable {
    public var ordinal: Int
    public var title: String
    public init(ordinal: Int, title: String) { self.ordinal = ordinal; self.title = title }
}

public struct SeriesDraft: Codable, Equatable, Sendable {
    public var title: String
    public var mediaType: SeriesMediaType
    public var unitLabel: UnitLabel
    public var entries: [EntryDraft]
    public var ongoing: Bool?
    public var externalSource: String?
    public var externalId: String?
    public var seasons: [SeasonBoundary]?
    public var metaLine: [String]?
    public var blurb: String?
    public var metadata: TrackMetadata?

    public init(title: String, mediaType: SeriesMediaType, unitLabel: UnitLabel, entries: [EntryDraft], ongoing: Bool? = nil,
                externalSource: String? = nil, externalId: String? = nil, seasons: [SeasonBoundary]? = nil,
                metaLine: [String]? = nil, blurb: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.mediaType = mediaType; self.unitLabel = unitLabel; self.entries = entries
        self.ongoing = ongoing; self.externalSource = externalSource; self.externalId = externalId
        self.seasons = seasons; self.metaLine = metaLine; self.blurb = blurb; self.metadata = metadata
    }
}
```

`…/Providers/Manual.swift`:

```swift
/// Port of src/providers/manual.ts: entry generation every provider shares (A9).

/// nil means the category is a standalone entry with no container (D1).
public func unitLabelFor(_ category: Category) -> UnitLabel? {
    switch category {
    case .show: .episode
    case .comic: .issue
    case .manga: .volume
    case .book, .movie: nil
    }
}

/// Upper bound on generated entries — far above any real series, far below a freeze.
public let maxUnits = 5000

public func generateEntries(_ result: SearchResult) throws -> SeriesDraft {
    if result.ongoing != true {
        if result.count < 1 { throw DomainError("A track must have at least 1 unit") }
        if result.count != result.count.rounded(.towardZero) { throw DomainError("A unit count must be a whole number") }
        if result.count > Double(maxUnits) { throw DomainError("A track cannot have more than \(maxUnits) units") }
    }
    guard let unitLabel = unitLabelFor(result.category), let mediaType = SeriesMediaType(rawValue: result.category.rawValue) else {
        throw DomainError("\(result.category.rawValue) is a standalone track and has no entries to generate")
    }
    let length = result.ongoing == true ? 1 : Int(result.count)
    return SeriesDraft(
        title: result.title, mediaType: mediaType, unitLabel: unitLabel,
        entries: (1...max(length, 1)).prefix(length).map { EntryDraft(ordinal: $0, title: "\(unitTitle(unitLabel)) \($0)") },
        ongoing: result.ongoing == true
    )
}
```

`…/Providers/ProviderIds.swift`:

```swift
/// The id each category's registered provider records as `externalSource`
/// (src/providers/registry.ts). The providers themselves arrive in I5.
public func providerIdFor(_ category: Category) -> String {
    switch category {
    case .book: "google-books"
    case .manga: "anilist"
    case .comic: "metron"
    case .show, .movie: "tmdb"
    }
}
```

`…/Providers/Images.swift`:

```swift
import Foundation

/// Port of src/providers/images.ts (A22, A25).

public func httpsUrl(_ url: String?) -> String? {
    guard let url, !url.isEmpty else { return nil }
    return url.replacing(jsRegex(#/^http:\/\//#).ignoresCase(), with: "https://", maxReplacements: 1)
}

public func tmdbImage(_ path: String?, size: String) -> String? {
    guard let path, !path.isEmpty else { return nil }
    return "https://image.tmdb.org/t/p/\(size)\(path)"
}

private func isGoogleBooksContent(_ url: String) -> Bool {
    url.firstMatch(of: jsRegex(#/^https:\/\/books\.google\.[a-z.]+\/books\/(publisher\/)?content\?/#).ignoresCase()) != nil
}

public func googleBooksImage(_ url: String?, width: Int) -> String? {
    guard let secure = httpsUrl(url), isGoogleBooksContent(secure) else { return httpsUrl(url) }
    let parts = secure.split(separator: "?", omittingEmptySubsequences: false)
    let base = String(parts[0])
    let query = parts.count > 1 ? String(parts[1]) : ""
    let params = query.split(separator: "&", omittingEmptySubsequences: false)
        .map(String.init)
        .filter { !$0.isEmpty && $0 != "edge=curl" && !$0.hasPrefix("fife=") }
    return "\(base)?\((params + ["fife=w\(width)"]).joined(separator: "&"))"
}

/// A25: covers at detail-screen size, applied on store and on read.
public func sharpCoverUrl(_ url: String?) -> String? {
    guard let secure = httpsUrl(url) else { return nil }
    if isGoogleBooksContent(secure) { return googleBooksImage(secure, width: 600) }
    return secure
        .replacing(jsRegex(#/^(https:\/\/image\.tmdb\.org\/t\/p\/)w(92|154|185|342|500)\//#), maxReplacements: 1) { "\($0.1)w780/" }
        .replacing(jsRegex(#/(anilistcdn\/media\/[a-z]+\/cover\/)(small|medium)\//#), maxReplacements: 1) { "\($0.1)large/" }
}
```

- [ ] **Step 3: The track repository**

`…/Persistence/TrackRepo.swift`:

```swift
import Foundation
import GRDB

/// Port of src/data/trackRepo.ts. Each function runs inside the caller's
/// `writer.write { db in … }` — one transaction per call.

public enum TrackKind: String, Codable, Sendable { case series, entry }

public struct TrackRef: Codable, Hashable, Sendable {
    public var kind: TrackKind
    public var id: String
    public init(kind: TrackKind, id: String) { self.kind = kind; self.id = id }
}

public struct TrackSummary: Codable, Equatable, Sendable {
    public var kind: TrackKind
    public var id: String
    public var title: String
    public var category: Category
    public var shelf: Shelf
    public var createdAt: String
    public var progress: Progress?
    /// A4: still being published — no total, no bar, never reaches Done.
    public var ongoing: Bool
    /// A6: in Backlog with progress intact.
    public var paused: Bool
    /// A11: TMDB only.
    public var seasons: [SeasonBoundary]?
    public var nextEntryStatus: Status?
    public var nextEntryId: String?
    public var nextEntryTitle: String?
    /// When this track last moved forward (D3: derived, never stored).
    public var lastAdvancedAt: String?
    /// A23: the unit completing this track would remove, if any.
    public var completionDrops: String?
}

public struct TrackDetail: Codable, Equatable, Sendable {
    public var summary: TrackSummary
    public var metadata: TrackMetadata
    public var timeline: Timeline
    /// nil for a standalone track.
    public var unitLabel: UnitLabel?
}

public struct FirstEntry: Codable, Equatable, Sendable {
    public var id: String
    public var status: Status
}

public struct StandaloneInput: Codable, Equatable, Sendable {
    public var title: String
    public var category: Category
    public var externalSource: String?
    public var externalId: String?
    public var metadata: TrackMetadata?
    public init(title: String, category: Category, externalSource: String? = nil, externalId: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.category = category; self.externalSource = externalSource
        self.externalId = externalId; self.metadata = metadata
    }
}

/// Matches the titles generateEntries produces, so both paths read alike.
public func unitTitle(_ label: UnitLabel) -> String {
    switch label {
    case .episode: "Episode"
    case .issue: "Issue"
    case .volume: "Volume"
    }
}

/// Same shape as the TS ids: base-36 milliseconds, a dash, 8 random base-36 digits.
func newId() -> String {
    let digits = Array("0123456789abcdefghijklmnopqrstuvwxyz")
    let millis = Int64(Date().timeIntervalSince1970 * 1000)
    return String(millis, radix: 36) + "-" + String((0..<8).map { _ in digits.randomElement()! })
}

// MARK: Rows

/// CHECK constraints guarantee the enum columns, so the force-unwraps can't fire.
func toEntry(_ row: Row) -> Entry {
    Entry(
        id: row["id"], seriesId: row["series_id"], title: row["title"], ordinal: row["ordinal"],
        mediaType: EntryMediaType(rawValue: row["media_type"])!, status: Status(rawValue: row["status"])!,
        startedAt: row["started_at"], finishedAt: row["finished_at"], createdAt: row["created_at"],
        paused: (row["paused"] as Int? ?? 0) == 1, externalSource: row["external_source"], externalId: row["external_id"]
    )
}

private func metadataOf(_ row: Row) -> TrackMetadata {
    TrackMetadata(
        coverUrl: sharpCoverUrl(row["cover_url"]), creator: row["creator"],
        description: row["description"], releaseYear: row["release_year"]
    )
}

/// '[]' once a catalogue answered, NULL while it never has (A26).
private func genresColumn(_ metadata: TrackMetadata?) -> String? {
    metadata.map { jsonText($0.genres ?? []) }
}

private func metadataColumns(_ metadata: TrackMetadata?, now: String) -> [(any DatabaseValueConvertible)?] {
    [metadata?.coverUrl, metadata?.creator, metadata?.description, metadata?.releaseYear,
     metadata == nil ? nil : now, genresColumn(metadata)]
}

private func seasonsOf(_ row: Row) -> [SeasonBoundary]? {
    guard let json: String = row["seasons_json"], let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode([SeasonBoundary].self, from: data)
}

// MARK: Create

public func createSeriesTrack(_ db: Database, _ draft: SeriesDraft, now: String, startAtOrdinal: Int? = nil) throws -> String {
    let seriesId = newId()
    let validStart: Int? = startAtOrdinal.flatMap {
        $0 >= 1 && (draft.ongoing == true || $0 <= draft.entries.count) ? $0 : nil
    }
    // A4/A10: an ongoing series' lone bootstrap entry is renumbered to the parsed ordinal.
    let entries = draft.ongoing == true && validStart != nil
        ? [EntryDraft(ordinal: validStart!, title: "\(unitTitle(draft.unitLabel)) \(validStart!)")]
        : draft.entries

    // Invariants first: a rejected draft never touches the database.
    try assertIsoTimestamp(now, field: "series createdAt")
    for entry in entries {
        try assertEntryInvariants(EntryInvariants(
            label: "Entry \"\(entry.title)\"", mediaType: EntryMediaType(rawValue: draft.unitLabel.rawValue)!,
            parentUnitLabel: draft.unitLabel, ordinal: Double(entry.ordinal), createdAt: now
        ))
    }

    try db.execute(
        sql: """
        INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, external_source, external_id, seasons_json,
                            cover_url, creator, description, release_year, metadata_checked_at, genres_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        arguments: StatementArguments([
            seriesId, draft.title, draft.mediaType.rawValue, draft.unitLabel.rawValue, now,
            draft.ongoing == true ? 1 : 0, draft.externalSource, draft.externalId, draft.seasons.map(jsonText),
        ] + metadataColumns(draft.metadata, now: now))
    )
    for entry in entries {
        // A11: starting at N means 1…N-1 already happened.
        let status: Status = validStart.map { entry.ordinal < $0 ? .done : entry.ordinal == $0 ? .inProgress : .unstarted } ?? .unstarted
        try db.execute(
            sql: """
            INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: [newId(), seriesId, entry.title, entry.ordinal, draft.unitLabel.rawValue, status.rawValue,
                        status != .unstarted ? now : nil, status == .done ? now : nil, now]
        )
    }
    return seriesId
}

public func createStandaloneTrack(_ db: Database, _ input: StandaloneInput, now: String) throws -> String {
    let id = newId()
    // TS casts the category; a non-standalone one fails the same invariant with the same message.
    guard isStandaloneMediaType(input.category.rawValue), let mediaType = EntryMediaType(rawValue: input.category.rawValue) else {
        throw DomainError("Entry \"\(input.title)\" has no parent series, so its media type must be book or movie, got: \(input.category.rawValue)")
    }
    try assertEntryInvariants(EntryInvariants(label: "Entry \"\(input.title)\"", mediaType: mediaType, parentUnitLabel: nil, createdAt: now))
    try db.execute(
        sql: """
        INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at, external_source, external_id,
                           cover_url, creator, description, release_year, metadata_checked_at, genres_json)
        VALUES (?, NULL, ?, NULL, ?, 'unstarted', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        arguments: StatementArguments([id, input.title, mediaType.rawValue, now, input.externalSource, input.externalId]
            + metadataColumns(input.metadata, now: now))
    )
    return id
}

public func firstEntryOf(_ db: Database, _ track: TrackRef) throws -> FirstEntry {
    if track.kind == .entry {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [track.id]) else {
            throw DomainError("Entry \(track.id) not found")
        }
        return FirstEntry(id: row["id"], status: Status(rawValue: row["status"])!)
    }
    let rows = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ? ORDER BY ordinal ASC", arguments: [track.id])
    if rows.isEmpty { throw DomainError("Series \(track.id) has no entries") }
    let target = rows.first { $0["status"] == "in_progress" } ?? rows[0]
    return FirstEntry(id: target["id"], status: Status(rawValue: target["status"])!)
}

// MARK: Read

/// The later of an entry's two timestamps (ISO strings sort chronologically).
private func lastAdvanceOf(_ e: Entry) -> String? {
    guard let started = e.startedAt else { return e.finishedAt }
    guard let finished = e.finishedAt else { return started }
    return finished >= started ? finished : started
}

private func lastAdvanceAcross(_ children: [Entry]) -> String? {
    children.compactMap(lastAdvanceOf).max()
}

private func buildSummaries(_ seriesRows: [Row], _ entries: [Entry]) -> [TrackSummary] {
    var summaries: [TrackSummary] = []
    for row in seriesRows {
        let id: String = row["id"]
        let children = entries.filter { $0.seriesId == id }
        let next = nextEntry(children)
        let ongoing = (row["ongoing"] as Int? ?? 0) == 1
        let paused = (row["paused"] as Int? ?? 0) == 1
        summaries.append(TrackSummary(
            kind: .series, id: id, title: row["title"], category: Category(rawValue: row["media_type"])!,
            shelf: shelfForSeries(children, paused: paused), createdAt: row["created_at"],
            progress: ongoing ? nil : progressFor(children), ongoing: ongoing, paused: paused, seasons: seasonsOf(row),
            nextEntryStatus: next?.status, nextEntryId: next?.id, nextEntryTitle: next?.title,
            lastAdvancedAt: lastAdvanceAcross(children),
            completionDrops: ongoingPlaceholder(children, ongoing: ongoing)?.title
        ))
    }
    for entry in entries where entry.seriesId == nil {
        // An older build's row outside the standalone union is left out, not mis-filed.
        guard isStandaloneMediaType(entry.mediaType.rawValue), let category = Category(rawValue: entry.mediaType.rawValue) else { continue }
        let advanceable = entry.status != .done
        summaries.append(TrackSummary(
            kind: .entry, id: entry.id, title: entry.title, category: category, shelf: shelfForEntry(entry),
            createdAt: entry.createdAt, progress: nil, ongoing: false, paused: entry.paused, seasons: nil,
            nextEntryStatus: advanceable ? entry.status : nil, nextEntryId: advanceable ? entry.id : nil,
            nextEntryTitle: advanceable ? entry.title : nil, lastAdvancedAt: lastAdvanceOf(entry), completionDrops: nil
        ))
    }
    return summaries
}

/// D9 (newest first) or D12 (most recently advanced first); ties keep input
/// order, as JS's stable sort does (Review Focus 4).
private func sortedForShelf(_ tracks: [TrackSummary], _ shelf: Shelf) -> [TrackSummary] {
    func byDateAdded(_ a: TrackSummary, _ b: TrackSummary) -> Int { a.createdAt == b.createdAt ? 0 : (b.createdAt < a.createdAt ? -1 : 1) }
    func byMostRecentlyAdvanced(_ a: TrackSummary, _ b: TrackSummary) -> Int {
        switch (a.lastAdvancedAt, b.lastAdvancedAt) {
        case (nil, .some): return 1
        case (.some, nil): return -1
        case let (.some(x), .some(y)) where x != y: return y < x ? -1 : 1
        default: return byDateAdded(a, b)
        }
    }
    let compare = shelf == .currently ? byMostRecentlyAdvanced : byDateAdded
    return tracks.enumerated()
        .sorted { let c = compare($0.element, $1.element); return c != 0 ? c < 0 : $0.offset < $1.offset }
        .map(\.element)
}

/// Shelf is computed in the domain, never queried for (D3).
public func listTracks(_ db: Database, shelf: Shelf, category: Category? = nil) throws -> [TrackSummary] {
    let seriesRows = try Row.fetchAll(db, sql: "SELECT * FROM series")
    let entries = try Row.fetchAll(db, sql: "SELECT * FROM entry").map(toEntry)
    let matching = buildSummaries(seriesRows, entries).filter { $0.shelf == shelf && (category == nil || $0.category == category) }
    return sortedForShelf(matching, shelf)
}

public func getTrackDetail(_ db: Database, kind: TrackKind, id: String) throws -> TrackDetail? {
    if kind == .series {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [id]) else { return nil }
        let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [id]).map(toEntry)
        return TrackDetail(
            summary: buildSummaries([row], children)[0], metadata: metadataOf(row),
            timeline: timelineOf(addedAt: row["created_at"], units: children.map(\.times)), unitLabel: UnitLabel(rawValue: row["unit_label"])
        )
    }
    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ? AND series_id IS NULL", arguments: [id]) else { return nil }
    let entry = toEntry(row)
    guard let summary = buildSummaries([], [entry]).first else { return nil }
    return TrackDetail(summary: summary, metadata: metadataOf(row), timeline: timelineOf(addedAt: entry.createdAt, units: [entry.times]), unitLabel: nil)
}

// MARK: Advance

/// Transition rules live in the domain; this persists them (D8), then A4/A5.
public func advanceEntry(_ db: Database, entryId: String, now: String) throws {
    guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [entryId]) else {
        throw DomainError("Entry \(entryId) not found")
    }
    let updated = try advance(toEntry(row), now: now)
    try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                   arguments: [updated.status.rawValue, updated.startedAt, updated.finishedAt, updated.id])
    if updated.status == .done {
        try appendNextOngoingEntry(db, finished: updated, now: now)
        try startNextInSeries(db, finished: updated, now: now)
    }
}

/// A4: finishing an ongoing series' last entry appends the next one.
private func appendNextOngoingEntry(_ db: Database, finished: Entry, now: String) throws {
    guard let seriesId = finished.seriesId,
          let series = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]),
          (series["ongoing"] as Int? ?? 0) == 1 else { return }
    let ordinals = try Int?.fetchAll(db, sql: "SELECT ordinal FROM entry WHERE series_id = ?", arguments: [seriesId])
    let highest = ordinals.reduce(0) { max($0, $1 ?? 0) }
    if (finished.ordinal ?? 0) < highest { return }
    let ordinal = highest + 1
    let unitLabel: String = series["unit_label"]
    try db.execute(
        sql: "INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES (?, ?, ?, ?, ?, 'unstarted', ?)",
        arguments: [newId(), seriesId, "\(unitTitle(UnitLabel(rawValue: unitLabel)!)) \(ordinal)", ordinal, unitLabel, now]
    )
}

/// A5/A10: the next unit starts the moment the previous one is finished.
private func startNextInSeries(_ db: Database, finished: Entry, now: String) throws {
    guard let seriesId = finished.seriesId else { return }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
    guard let next = nextEntry(children), next.status == .unstarted else { return }
    try db.execute(sql: "UPDATE entry SET status = 'in_progress', started_at = ? WHERE id = ?", arguments: [now, next.id])
}

// MARK: Track actions

private func table(_ kind: TrackKind) -> String { kind == .series ? "series" : "entry" }

public func deleteTrack(_ db: Database, _ track: TrackRef) throws {
    try db.execute(sql: "DELETE FROM \(table(track.kind)) WHERE id = ?", arguments: [track.id])
    // A26: a rating points at a series or an entry, so no cascade reaches it.
    try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
}

public func renameTrack(_ db: Database, _ track: TrackRef, title: String) throws {
    let trimmed = jsTrim(title)
    if trimmed.isEmpty { throw DomainError("A track needs a title") }
    try db.execute(sql: "UPDATE \(table(track.kind)) SET title = ? WHERE id = ?", arguments: [trimmed, track.id])
}

/// A6: pause a track with something left; reset one that is fully finished (D4).
public func returnTrackToBacklog(_ db: Database, _ track: TrackRef) throws {
    if track.kind == .series {
        let statuses = try String.fetchAll(db, sql: "SELECT status FROM entry WHERE series_id = ?", arguments: [track.id])
        if !statuses.isEmpty && statuses.allSatisfy({ $0 == "done" }) {
            try db.execute(sql: "UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL WHERE series_id = ?", arguments: [track.id])
            try db.execute(sql: "UPDATE series SET paused = 0 WHERE id = ?", arguments: [track.id])
        } else {
            try db.execute(sql: "UPDATE series SET paused = 1 WHERE id = ?", arguments: [track.id])
        }
        return
    }
    guard let status = try String.fetchOne(db, sql: "SELECT status FROM entry WHERE id = ?", arguments: [track.id]) else { return }
    if status == "done" {
        try db.execute(sql: "UPDATE entry SET status = 'unstarted', started_at = NULL, finished_at = NULL, paused = 0 WHERE id = ?", arguments: [track.id])
    } else {
        try db.execute(sql: "UPDATE entry SET paused = 1 WHERE id = ?", arguments: [track.id])
    }
}

public func resumeTrack(_ db: Database, _ track: TrackRef) throws {
    try db.execute(sql: "UPDATE \(table(track.kind)) SET paused = 0 WHERE id = ?", arguments: [track.id])
}

/// A12: put a series at a position directly; naming where you are resumes it.
public func setTrackPosition(_ db: Database, seriesId: String, targetOrdinal: Int, now: String) throws {
    guard try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]) != nil else {
        throw DomainError("Series \(seriesId) not found")
    }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
    let changed = try setPosition(children, targetOrdinal: targetOrdinal, now: now)
    for e in changed {
        try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                       arguments: [e.status.rawValue, e.startedAt, e.finishedAt, e.id])
    }
    try db.execute(sql: "UPDATE series SET paused = 0 WHERE id = ?", arguments: [seriesId])
}

/// A23: finish a track by hand — the only way an ongoing series reaches Done.
public func completeTrack(_ db: Database, _ track: TrackRef, now: String) throws {
    func write(_ e: Entry) throws {
        try db.execute(sql: "UPDATE entry SET status = ?, started_at = ?, finished_at = ? WHERE id = ?",
                       arguments: [e.status.rawValue, e.startedAt, e.finishedAt, e.id])
    }
    if track.kind == .entry {
        guard let row = try Row.fetchOne(db, sql: "SELECT * FROM entry WHERE id = ?", arguments: [track.id]) else {
            throw DomainError("Entry \(track.id) not found")
        }
        for e in completeUnits([toEntry(row)], ongoing: false, now: now).updated { try write(e) }
        try db.execute(sql: "UPDATE entry SET paused = 0 WHERE id = ?", arguments: [track.id])
        return
    }
    guard let series = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [track.id]) else {
        throw DomainError("Series \(track.id) not found")
    }
    let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [track.id]).map(toEntry)
    let result = completeUnits(children, ongoing: (series["ongoing"] as Int? ?? 0) == 1, now: now)
    for e in result.updated { try write(e) }
    for id in result.removedIds { try db.execute(sql: "DELETE FROM entry WHERE id = ?", arguments: [id]) }
    try db.execute(sql: "UPDATE series SET ongoing = 0, paused = 0 WHERE id = ?", arguments: [track.id])
}
```

(Fix any `arguments:` literal the compiler rejects for mixed optional types by wrapping it in `StatementArguments([…] as [(any DatabaseValueConvertible)?])`. That's a type-inference adjustment, not a behaviour change; no ruling is needed.)

- [ ] **Step 4: addTrack**

`…/Persistence/AddTrack.swift`:

```swift
import GRDB

/// Port of src/data/addTrack.ts's input (A9–A22).
public struct AddTrackInput: Codable, Equatable, Sendable {
    public var title: String
    public var category: Category
    public var count: Double
    public var ongoing: Bool?
    public var match: SearchResult?
    public var startAtOrdinal: Int?
    public var draft: SeriesDraft?
    public var standalone: Bool?
    public var externalSource: String?
    public var metadata: TrackMetadata?

    public init(title: String, category: Category, count: Double, ongoing: Bool? = nil, match: SearchResult? = nil,
                startAtOrdinal: Int? = nil, draft: SeriesDraft? = nil, standalone: Bool? = nil,
                externalSource: String? = nil, metadata: TrackMetadata? = nil) {
        self.title = title; self.category = category; self.count = count; self.ongoing = ongoing; self.match = match
        self.startAtOrdinal = startAtOrdinal; self.draft = draft; self.standalone = standalone
        self.externalSource = externalSource; self.metadata = metadata
    }
}

/// Until I5 brings real providers, an unmatched (hand-typed) result hydrates
/// exactly as every TS provider does for one: generateEntries.
public let manualHydrate: @Sendable (SearchResult) async throws -> SeriesDraft = { try generateEntries($0) }

/// Port of src/data/addTrack.ts. Hydrates (possibly over the network, I5)
/// *before* opening the write, as TS does.
public func addTrack(
    _ writer: some DatabaseWriter, _ input: AddTrackInput, now: String,
    hydrate: @Sendable (SearchResult) async throws -> SeriesDraft = manualHydrate
) async throws -> TrackRef {
    let title = jsTrim(input.title)
    if title.isEmpty { throw DomainError("A track needs a title") }
    let providerId = providerIdFor(input.category)

    if unitLabelFor(input.category) == nil || input.standalone == true {
        let matched = input.match != nil
        let standalone = StandaloneInput(
            title: title, category: input.category,
            externalSource: matched ? (input.externalSource ?? providerId) : nil,
            externalId: matched ? input.match?.id : nil,
            metadata: matched ? input.metadata : nil
        )
        let id = try await writer.write { try createStandaloneTrack($0, standalone, now: now) }
        return TrackRef(kind: .entry, id: id)
    }

    var result = input.match ?? SearchResult(id: providerId, title: title, category: input.category, count: input.count)
    result.title = title
    result.count = input.count
    result.ongoing = input.ongoing == true
    let draft: SeriesDraft
    if let given = input.draft { draft = given } else { draft = try await hydrate(result) }
    let start = input.startAtOrdinal
    let id = try await writer.write { try createSeriesTrack($0, draft, now: now, startAtOrdinal: start) }
    return TrackRef(kind: .series, id: id)
}
```

- [ ] **Step 5: Run, and watch them pass**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "error:|divergence|Executed" | head -20`
Expected: `testTracks`, `testProgress` and `testWhatsNew` pass.

Each divergence line names the scenario, the step and both values. Fix the **Swift** port: the recordings are TS truth. Typical causes are a column not written (compare the TS INSERT), a sort tie, or JSON column text.

- [ ] **Step 6: Review Focus 5 spot check, then commit**

Find the `'Iris parity: a rejected draft writes nothing'` scenario in `shared/scenarios/tracks.json` and confirm its `dump` has empty `series` and `entry`. It passing in Swift is the check.

```bash
git add apple/IrisCore/Sources/IrisCore/Providers apple/IrisCore/Sources/IrisCore/Persistence/TrackRepo.swift apple/IrisCore/Sources/IrisCore/Persistence/AddTrack.swift apple/IrisCore/Tests/IrisCoreTests/Scenarios/Registry+Tracks.swift apple/IrisCore/Tests/IrisCoreTests/ScenarioTests.swift
git commit -m "feat(iris-core): port the track repository and addTrack onto GRDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Swift — rating repository and backup

**Files:**
- Create: `…/Persistence/{RatingRepo,Backup}.swift`, `…/Scenarios/Registry+Ratings.swift`
- Modify: `ScenarioTests.swift` (`pending` becomes empty; add `testRatings`, `testBackup`, `testEveryScenarioAreaIsPorted`)

- [ ] **Step 1: Register and watch them fail**

`…/Scenarios/Registry+Ratings.swift`:

```swift
import Foundation
import GRDB
@testable import IrisCore

let ratingCalls: [String: ScenarioCall] = [
    "listRanking": { q, a in let c: Category = try arg(a, 0); return try toJSON(write(q) { try listRanking($0, category: c) }) },
    "ratingProfileOf": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try ratingProfileOf($0, t) }) },
    "getRating": { q, a in let t: TrackRef = try arg(a, 0); return try toJSON(write(q) { try getRating($0, t) }) },
    "allScores": { q, _ in
        let pairs = try write(q) { try allScores($0) }
        return .object(Dictionary(uniqueKeysWithValues: pairs.map { ($0.key, JSON.number($0.score)) }))
    },
    "saveRating": { q, a in
        let (t, s, i, now): (RatableTrack, Sentiment, Int, String) = (try arg(a, 0), try arg(a, 1), try arg(a, 2), try arg(a, 3))
        try write(q) { try saveRating($0, t, sentiment: s, indexInBucket: i, now: now) }
        return .null
    },
    "removeRating": { q, a in let t: TrackRef = try arg(a, 0); try write(q) { try removeRating($0, t) }; return .null },
    "exportLibrary": { q, _ in
        let text = try write(q) { try exportLibrary($0) }
        return try JSONDecoder().decode(JSON.self, from: Data(text.utf8))
    },
    "importLibrary": { q, a in let json: String = try arg(a, 0); try write(q) { try importLibrary($0, json: json) }; return .null },
]
```

In `ScenarioTests.swift`, set `pending` to `[]` and `ported` to all five areas. Change `core` to `trackCalls.merging(ratingCalls) { a, _ in a }.merging(whatsNewCalls) { a, _ in a }.merging(sqlCalls) { a, _ in a }`, use `Self.core` for every area, and add:

```swift
    func testRatings() async throws { try await check("ratings", Self.core) }
    func testBackup() async throws { try await check("backup", Self.core) }
    func testEveryScenarioAreaIsPorted() { XCTAssertEqual(Self.pending, []) }
```

(Every area uses the full call table, because a ratings scenario also adds tracks.)

Run `swift test --package-path apple/IrisCore` and expect compile errors.

- [ ] **Step 2: The rating repository**

`…/Persistence/RatingRepo.swift`:

```swift
import Foundation
import GRDB

/// Port of src/data/ratingRepo.ts (A26).

public struct RatableTrack: Codable, Hashable, Sendable {
    public var kind: TrackKind
    public var id: String
    public var category: Category
    public init(kind: TrackKind, id: String, category: Category) { self.kind = kind; self.id = id; self.category = category }
    public var ref: TrackRef { TrackRef(kind: kind, id: id) }
}

/// One row of a category's ranking, joined to what the screens show.
public struct RankedTrack: Codable, Equatable, Sendable {
    public var key: String
    public var kind: TrackKind
    public var id: String
    public var title: String
    public var coverUrl: String?
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?
    public var sentiment: Sentiment
    public var score: Double
    /// 1-based.
    public var rank: Int
}

/// `kind:id` — the key the domain layer ranks by.
public func ratingKey(_ track: TrackRef) -> String { "\(track.kind.rawValue):\(track.id)" }

private func parseGenres(_ json: String?) -> [String] {
    guard let json, let data = json.data(using: .utf8),
          case let .array(items)? = try? JSONDecoder().decode(JSONValue.self, from: data) else { return [] }
    return items.compactMap(\.string)
}

/// A category's ranking, best first, with each track's derived score; a row
/// whose track no longer exists is left out.
public func listRanking(_ db: Database, category: Category) throws -> [RankedTrack] {
    let rows = try Row.fetchAll(db, sql: """
        SELECT r.track_kind, r.track_id, r.sentiment,
               COALESCE(s.title, e.title) AS title,
               COALESCE(s.cover_url, e.cover_url) AS cover_url,
               COALESCE(s.creator, e.creator) AS creator,
               COALESCE(s.genres_json, e.genres_json) AS genres_json,
               COALESCE(s.release_year, e.release_year) AS release_year
        FROM rating r
        LEFT JOIN series s ON r.track_kind = 'series' AND s.id = r.track_id
        LEFT JOIN entry e ON r.track_kind = 'entry' AND e.id = r.track_id
        WHERE r.category = ?
        ORDER BY r.position ASC, r.rated_at ASC
        """, arguments: [category.rawValue]).filter { ($0["title"] as String?) != nil }
    let items = rows.map {
        KeyedSentiment(key: ratingKey(TrackRef(kind: TrackKind(rawValue: $0["track_kind"])!, id: $0["track_id"])),
                       sentiment: Sentiment(rawValue: $0["sentiment"])!)
    }
    let scores = Dictionary(scoresFor(items).map { ($0.key, $0.score) }, uniquingKeysWith: { _, last in last })
    return rows.enumerated().map { i, row in
        RankedTrack(
            key: items[i].key, kind: TrackKind(rawValue: row["track_kind"])!, id: row["track_id"], title: row["title"],
            coverUrl: sharpCoverUrl(row["cover_url"]), creator: row["creator"], genres: parseGenres(row["genres_json"]),
            releaseYear: row["release_year"], sentiment: items[i].sentiment, score: scores[items[i].key]!, rank: i + 1
        )
    }
}

public func ratingProfileOf(_ db: Database, _ track: TrackRef) throws -> RatingProfile? {
    let table = track.kind == .series ? "series" : "entry"
    guard let row = try Row.fetchOne(db, sql: "SELECT creator, genres_json, release_year FROM \(table) WHERE id = ?", arguments: [track.id]) else {
        return nil
    }
    return RatingProfile(key: ratingKey(track), creator: row["creator"], genres: parseGenres(row["genres_json"]), releaseYear: row["release_year"])
}

public func getRating(_ db: Database, _ track: TrackRef) throws -> RatingSummary? {
    guard let raw = try String.fetchOne(db, sql: "SELECT category FROM rating WHERE track_kind = ? AND track_id = ?",
                                        arguments: [track.kind.rawValue, track.id]),
          let category = Category(rawValue: raw) else { return nil }
    let ranking = try listRanking(db, category: category)
    guard let mine = ranking.first(where: { $0.key == ratingKey(track) }) else { return nil }
    return RatingSummary(sentiment: mine.sentiment, score: mine.score, rank: mine.rank, outOf: ranking.count, category: category)
}

/// Every rated track's score keyed by `kind:id`, in category-then-rank order (a Map in TS).
public func allScores(_ db: Database) throws -> [(key: String, score: Double)] {
    var order: [String] = []
    var scores: [String: Double] = [:]
    for raw in try String.fetchAll(db, sql: "SELECT DISTINCT category FROM rating") {
        guard let category = Category(rawValue: raw) else { continue }
        for ranked in try listRanking(db, category: category) {
            if scores[ranked.key] == nil { order.append(ranked.key) }
            scores[ranked.key] = ranked.score
        }
    }
    return order.map { ($0, scores[$0]!) }
}

/// Place `track` at `indexInBucket` within its sentiment and rewrite the
/// category's order (the caller's write makes it one transaction).
public func saveRating(_ db: Database, _ track: RatableTrack, sentiment: Sentiment, indexInBucket: Int, now: String) throws {
    try assertIsoTimestamp(now, field: "rating ratedAt")
    let key = ratingKey(track.ref)
    let current = try listRanking(db, category: track.category).filter { $0.key != key }
    let order = placeInRanking(current.map { KeyedSentiment(key: $0.key, sentiment: $0.sentiment) }, key: key, sentiment: sentiment, indexInBucket: indexInBucket)
    var refs: [String: TrackRef] = [key: track.ref]
    for r in current { refs[r.key] = TrackRef(kind: r.kind, id: r.id) }

    try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
    try db.execute(
        sql: "INSERT INTO rating (track_kind, track_id, category, sentiment, position, rated_at) VALUES (?, ?, ?, ?, 0, ?)",
        arguments: [track.kind.rawValue, track.id, track.category.rawValue, sentiment.rawValue, now]
    )
    for (position, item) in order.enumerated() {
        let ref = refs[item.key]!
        try db.execute(sql: "UPDATE rating SET position = ? WHERE track_kind = ? AND track_id = ?",
                       arguments: [position, ref.kind.rawValue, ref.id])
    }
}

public func removeRating(_ db: Database, _ track: TrackRef) throws {
    try db.execute(sql: "DELETE FROM rating WHERE track_kind = ? AND track_id = ?", arguments: [track.kind.rawValue, track.id])
}
```

- [ ] **Step 3: Backup**

`…/Persistence/Backup.swift`:

```swift
import Foundation
import GRDB

/// Port of src/data/backup.ts — the cross-platform backup (spec §3). Version 1.
private let backupVersion = 1.0

// MARK: Export

private func exportMetadata(_ row: Row, into out: inout [String: JSONValue]) {
    for (column, key) in [("cover_url", "coverUrl"), ("creator", "creator"), ("description", "description"),
                          ("release_year", "releaseYear"), ("metadata_checked_at", "metadataCheckedAt")] {
        if let value: String = row[column], !value.isEmpty { out[key] = .string(value) }
    }
    if let genres: String = row["genres_json"], let parsed = try? JSONDecoder().decode(JSONValue.self, from: Data(genres.utf8)) {
        out["genres"] = parsed
    }
}

private func text(_ row: Row, _ column: String) -> JSONValue { (row[column] as String?).map(JSONValue.string) ?? .null }

public func exportLibrary(_ db: Database) throws -> String {
    let series: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM series").map { r in
        var o: [String: JSONValue] = [
            "id": text(r, "id"), "title": text(r, "title"), "mediaType": text(r, "media_type"), "unitLabel": text(r, "unit_label"),
            "createdAt": text(r, "created_at"), "ongoing": .bool((r["ongoing"] as Int? ?? 0) == 1),
            "paused": .bool((r["paused"] as Int? ?? 0) == 1), "externalSource": text(r, "external_source"), "externalId": text(r, "external_id"),
        ]
        if let seasons: String = r["seasons_json"], !seasons.isEmpty,
           let parsed = try? JSONDecoder().decode(JSONValue.self, from: Data(seasons.utf8)) { o["seasons"] = parsed }
        exportMetadata(r, into: &o)
        return .object(o)
    }
    let entries: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM entry").map { r in
        var o: [String: JSONValue] = [
            "id": text(r, "id"), "seriesId": text(r, "series_id"), "title": text(r, "title"),
            "ordinal": (r["ordinal"] as Int?).map { .number(Double($0)) } ?? .null,
            "mediaType": text(r, "media_type"), "status": text(r, "status"), "startedAt": text(r, "started_at"),
            "finishedAt": text(r, "finished_at"), "createdAt": text(r, "created_at"), "paused": .bool((r["paused"] as Int? ?? 0) == 1),
            "externalSource": text(r, "external_source"), "externalId": text(r, "external_id"),
        ]
        exportMetadata(r, into: &o)
        return .object(o)
    }
    let ratings: [JSONValue] = try Row.fetchAll(db, sql: "SELECT * FROM rating ORDER BY category, position").map { r in
        .object([
            "trackKind": text(r, "track_kind"), "trackId": text(r, "track_id"), "category": text(r, "category"),
            "sentiment": text(r, "sentiment"), "position": .number(Double(r["position"] as Int? ?? 0)), "ratedAt": text(r, "rated_at"),
        ])
    }
    let payload = JSONValue.object(["version": .number(backupVersion), "series": .array(series), "entries": .array(entries), "ratings": .array(ratings)])
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes, .sortedKeys]
    return String(decoding: try encoder.encode(payload), as: UTF8.self)
}

// MARK: Import — validate everything first (a half-imported library reads as corruption)

private struct SeriesRecord {
    var id, title: String
    var mediaType: SeriesMediaType
    var unitLabel: UnitLabel
    var createdAt: String
    var ongoing, paused: Bool
    var externalSource, externalId: String?
    var seasons: [SeasonBoundary]?
    var metadata: MetadataRecord
}

private struct EntryRecord {
    var id: String
    var seriesId: String?
    var title: String
    var ordinal: Double?
    var mediaType: EntryMediaType
    var status: Status
    var startedAt, finishedAt: String?
    var createdAt: String
    var paused: Bool
    var externalSource, externalId: String?
    var metadata: MetadataRecord
}

private struct MetadataRecord {
    var coverUrl, creator, description, releaseYear, metadataCheckedAt: String?
    var genres: [String]?
    var params: [(any DatabaseValueConvertible)?] { [coverUrl, creator, description, releaseYear, metadataCheckedAt, genres.map(jsonText)] }
}

private struct RatingRecord {
    var trackKind: TrackKind
    var trackId: String
    var category: Category
    var sentiment: Sentiment
    var position: Int
    var ratedAt: String
}

private func requireString(_ v: JSONValue?, _ field: String) throws -> String {
    guard case let .string(s)? = v else { throw DomainError("Backup field \(field) must be text") }
    return s
}

private func requireNullableString(_ v: JSONValue?, _ field: String) throws -> String? {
    switch v {
    case nil, .null?: return nil
    case let .string(s)?: return s
    default: throw DomainError("Backup field \(field) must be text or null")
    }
}

private func requireOptionalSeasons(_ v: JSONValue?, _ field: String) throws -> [SeasonBoundary]? {
    switch v {
    case nil, .null?: return nil
    case let .array(items)?:
        return try items.enumerated().map { i, item in
            guard let o = item.object else { throw DomainError("Backup field \(field)[\(i)] is not an object") }
            guard case let .number(n)? = o["number"] else { throw DomainError("Backup field \(field)[\(i)].number must be a number") }
            guard case let .number(c)? = o["episodeCount"] else { throw DomainError("Backup field \(field)[\(i)].episodeCount must be a number") }
            return SeasonBoundary(number: Int(n), episodeCount: Int(c))
        }
    default: throw DomainError("Backup field \(field) must be a list")
    }
}

private func requireOptionalStrings(_ v: JSONValue?, _ field: String) throws -> [String]? {
    switch v {
    case nil, .null?: return nil
    case let .array(items)? where items.allSatisfy({ $0.string != nil }): return items.compactMap(\.string)
    default: throw DomainError("Backup field \(field) must be a list of text")
    }
}

private func parseMetadata(_ o: [String: JSONValue], _ kind: String) throws -> MetadataRecord {
    MetadataRecord(
        coverUrl: try requireNullableString(o["coverUrl"], "\(kind).coverUrl"),
        creator: try requireNullableString(o["creator"], "\(kind).creator"),
        description: try requireNullableString(o["description"], "\(kind).description"),
        releaseYear: try requireNullableString(o["releaseYear"], "\(kind).releaseYear"),
        metadataCheckedAt: try requireNullableString(o["metadataCheckedAt"], "\(kind).metadataCheckedAt"),
        genres: try requireOptionalStrings(o["genres"], "\(kind).genres")
    )
}

/// Field order matches backup.ts's object literal, so the *first* error is the same one.
private func parseSeries(_ value: JSONValue) throws -> SeriesRecord {
    guard let o = value.object else { throw DomainError("A series in the backup is not an object") }
    let mediaTypeRaw = try requireString(o["mediaType"], "series.mediaType")
    guard let mediaType = SeriesMediaType(rawValue: mediaTypeRaw) else { throw DomainError("Unknown series media type: \(mediaTypeRaw)") }
    let unitLabelRaw = try requireString(o["unitLabel"], "series.unitLabel")
    guard let unitLabel = UnitLabel(rawValue: unitLabelRaw) else { throw DomainError("Unknown unit label: \(unitLabelRaw)") }
    let createdAt = try requireString(o["createdAt"], "series.createdAt")
    try assertIsoTimestamp(createdAt, field: "series.createdAt")
    let id = try requireString(o["id"], "series.id")
    let title = try requireString(o["title"], "series.title")
    return SeriesRecord(
        id: id, title: title, mediaType: mediaType, unitLabel: unitLabel, createdAt: createdAt,
        ongoing: o["ongoing"] == .bool(true), paused: o["paused"] == .bool(true),
        externalSource: try requireNullableString(o["externalSource"], "series.externalSource"),
        externalId: try requireNullableString(o["externalId"], "series.externalId"),
        seasons: try requireOptionalSeasons(o["seasons"], "series.seasons"),
        metadata: try parseMetadata(o, "series")
    )
}

private func parseEntry(_ value: JSONValue, _ unitLabels: [String: UnitLabel]) throws -> EntryRecord {
    guard let o = value.object else { throw DomainError("An entry in the backup is not an object") }
    let id = try requireString(o["id"], "entry.id")
    let mediaTypeRaw = try requireString(o["mediaType"], "entry.mediaType")
    guard let mediaType = EntryMediaType(rawValue: mediaTypeRaw) else { throw DomainError("Unknown media type: \(mediaTypeRaw)") }
    let statusRaw = try requireString(o["status"], "entry.status")
    guard let status = Status(rawValue: statusRaw) else { throw DomainError("Unknown status: \(statusRaw)") }
    let seriesId = try requireNullableString(o["seriesId"], "entry.seriesId")
    if let seriesId, unitLabels[seriesId] == nil { throw DomainError("Entry \(id) refers to a missing series") }
    if !isStatusValid(mediaType, status: status, isSeriesChild: seriesId != nil) {
        throw DomainError("Status \(statusRaw) is not valid for a \(mediaTypeRaw)")
    }
    let ordinal: Double?
    switch o["ordinal"] {
    case nil, .null?: ordinal = nil
    case let .number(n)?: ordinal = n
    default: throw DomainError("Entry \(id) has a non-numeric ordinal")
    }
    let startedAt = try requireNullableString(o["startedAt"], "entry.startedAt")
    let finishedAt = try requireNullableString(o["finishedAt"], "entry.finishedAt")
    let createdAt = try requireString(o["createdAt"], "entry.createdAt")
    try assertEntryInvariants(EntryInvariants(
        label: "Entry \(id)", mediaType: mediaType, parentUnitLabel: seriesId.flatMap { unitLabels[$0] },
        ordinal: ordinal, createdAt: createdAt, startedAt: startedAt, finishedAt: finishedAt
    ))
    let title = try requireString(o["title"], "entry.title")
    return EntryRecord(
        id: id, seriesId: seriesId, title: title, ordinal: ordinal, mediaType: mediaType, status: status,
        startedAt: startedAt, finishedAt: finishedAt, createdAt: createdAt, paused: o["paused"] == .bool(true),
        externalSource: try requireNullableString(o["externalSource"], "entry.externalSource"),
        externalId: try requireNullableString(o["externalId"], "entry.externalId"),
        metadata: try parseMetadata(o, "entry")
    )
}

private func parseRating(_ value: JSONValue, exists: (TrackKind, String) -> Bool) throws -> RatingRecord {
    guard let o = value.object else { throw DomainError("A rating in the backup is not an object") }
    let kindRaw = try requireString(o["trackKind"], "rating.trackKind")
    guard let kind = TrackKind(rawValue: kindRaw) else { throw DomainError("Unknown rating track kind: \(kindRaw)") }
    let trackId = try requireString(o["trackId"], "rating.trackId")
    if !exists(kind, trackId) { throw DomainError("Rating for missing \(kindRaw) \(trackId)") }
    let categoryRaw = try requireString(o["category"], "rating.category")
    guard let category = Category(rawValue: categoryRaw) else { throw DomainError("Unknown rating category: \(categoryRaw)") }
    let sentimentRaw = try requireString(o["sentiment"], "rating.sentiment")
    guard let sentiment = Sentiment(rawValue: sentimentRaw) else { throw DomainError("Unknown rating sentiment: \(sentimentRaw)") }
    guard case let .number(position)? = o["position"], position == position.rounded(.towardZero) else {
        throw DomainError("Backup field rating.position must be a whole number")
    }
    let ratedAt = try requireString(o["ratedAt"], "rating.ratedAt")
    try assertIsoTimestamp(ratedAt, field: "rating.ratedAt")
    return RatingRecord(trackKind: kind, trackId: trackId, category: category, sentiment: sentiment, position: Int(position), ratedAt: ratedAt)
}

/// Replace the whole library with `json` — validated in full first, then
/// written in the caller's one transaction.
public func importLibrary(_ db: Database, json: String) throws {
    guard let raw = try? JSONDecoder().decode(JSONValue.self, from: Data(json.utf8)) else {
        throw DomainError("Backup is not valid JSON")
    }
    guard let root = raw.object else { throw DomainError("Backup is not an object") }
    if root["version"] != .number(backupVersion) {
        throw DomainError("Unsupported backup version: \(root["version"]?.jsDescription ?? "undefined")")
    }
    guard case let .array(seriesValues)? = root["series"], case let .array(entryValues)? = root["entries"] else {
        throw DomainError("Backup is missing its series or entries list")
    }
    let series = try seriesValues.map(parseSeries)
    var unitLabels: [String: UnitLabel] = [:]
    for s in series { unitLabels[s.id] = s.unitLabel }
    if unitLabels.count != series.count { throw DomainError("Backup contains duplicate series ids") }
    let entries = try entryValues.map { try parseEntry($0, unitLabels) }
    let entryIds = Set(entries.map(\.id))
    if entryIds.count != entries.count { throw DomainError("Backup contains duplicate entry ids") }
    let ratingValues: [JSONValue]
    switch root["ratings"] {
    case nil: ratingValues = []
    case let .array(items)?: ratingValues = items
    default: throw DomainError("Backup ratings must be a list")
    }
    let ratings = try ratingValues.map { try parseRating($0) { kind, id in kind == .series ? unitLabels[id] != nil : entryIds.contains(id) } }
    if Set(ratings.map { "\($0.trackKind.rawValue):\($0.trackId)" }).count != ratings.count {
        throw DomainError("Backup rates the same track twice")
    }

    try db.execute(sql: "DELETE FROM rating")
    try db.execute(sql: "DELETE FROM entry")
    try db.execute(sql: "DELETE FROM series")
    for s in series {
        try db.execute(
            sql: """
            INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, paused, external_source, external_id, seasons_json, cover_url, creator, description, release_year, metadata_checked_at, genres_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: StatementArguments([s.id, s.title, s.mediaType.rawValue, s.unitLabel.rawValue, s.createdAt, s.ongoing ? 1 : 0,
                                           s.paused ? 1 : 0, s.externalSource, s.externalId, s.seasons.map(jsonText)] + s.metadata.params)
        )
    }
    for e in entries {
        try db.execute(
            sql: """
            INSERT INTO entry (id, series_id, title, ordinal, media_type, status, started_at, finished_at, created_at, paused, external_source, external_id, cover_url, creator, description, release_year, metadata_checked_at, genres_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            arguments: StatementArguments([e.id, e.seriesId, e.title, e.ordinal.map { Int($0) }, e.mediaType.rawValue, e.status.rawValue,
                                           e.startedAt, e.finishedAt, e.createdAt, e.paused ? 1 : 0, e.externalSource, e.externalId]
                                          + e.metadata.params)
        )
    }
    for r in ratings {
        try db.execute(
            sql: "INSERT INTO rating (track_kind, track_id, category, sentiment, position, rated_at) VALUES (?, ?, ?, ?, ?, ?)",
            arguments: [r.trackKind.rawValue, r.trackId, r.category.rawValue, r.sentiment.rawValue, r.position, r.ratedAt]
        )
    }
}
```

- [ ] **Step 4: Run, watch everything pass, and check the full app**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "error:|divergence|Executed" | tail -5`
Expected: 0 failures, and `testEveryScenarioAreaIsPorted` passes.

Run: `apple/scripts/test.sh && npm run typecheck && npx jest 2>&1 | tail -3`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apple/IrisCore/Sources/IrisCore/Persistence/RatingRepo.swift apple/IrisCore/Sources/IrisCore/Persistence/Backup.swift apple/IrisCore/Tests/IrisCoreTests/Scenarios/Registry+Ratings.swift apple/IrisCore/Tests/IrisCoreTests/ScenarioTests.swift
git commit -m "feat(iris-core): port ratings and the cross-platform backup onto GRDB

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Spec amendment, docs, merge

**Files:**
- Modify: `docs/superpowers/specs/2026-08-12-track-it-design.md` (A29), `docs/superpowers/specs/2026-10-06-iris-design.md` (§3, §10, §11), `docs/HANDOFF.md`, `DEVLOG.md`, `shared/README.md`, `apple/README.md`

- [ ] **Step 1: A29**

After A28 in the design record, add:

```markdown
**A29 — Iris: the data layer is held to the TS app by recorded scenarios.**
Amends A28's testing approach (and §10/§11 of `2026-10-06-iris-design.md`,
which said the repository test suites would "mirror each other"). Decided
2026-10-07. `shared/scenarios/` records sequences of repository calls on a
fresh database — every step's result and a dump of every table afterwards
— from TS, and the Swift persistence layer (GRDB) must replay each one
identically. Random ids are normalised to insertion order (`#1`, `#2`, …)
on both sides. Why: hand-mirrored tests drift silently when android changes
the data layer; a recording turns that change into a red Swift test. The
SQLite DDL is shared too: Swift runs `src/db/schema.ts`'s migration strings
verbatim, generated into `Migrations.generated.swift`, so `schema.sql`
matches byte for byte. Out of scope until I5: the metadata backfill and
comic-unit sync, which need real catalogue providers.
```

In `2026-10-06-iris-design.md`:
- §10's IrisCore bullet: replace "in-memory GRDB repository tests mirroring `src/data/__tests__`" with "recorded data-layer scenarios (`shared/scenarios/`, A29) replayed on in-memory GRDB".
- §11's first risk: replace "The repository test suites mirror each other for that reason." with "Recorded scenarios (A29) cover that layer the way fixtures cover the domain."

- [ ] **Step 2: HANDOFF, DEVLOG, READMEs**

`docs/HANDOFF.md`, "Iris kicked off": update **Status** to I4 done. Persistence is on GRDB with the TS schema byte for byte. N scenarios across 5 areas replay identically, listing any `NOT_A_SCENARIO` titles. The decision record is now at A29, so the next amendment is A30. Next is I5 (providers: TMDB, Google Books, Metron, AniList, metadata backfill, `syncSeriesUnit`, plus the two scenario areas listed as `LATER`).

`DEVLOG.md`, new top entry:

```markdown
## 2026-10-07 — Iris I4: persistence on GRDB

- `apple/IrisCore/Sources/IrisCore/Persistence/` ports `src/db` and the
  repositories in `src/data` (tracks, addTrack, ratings, what's-new, backup).
- **Why recorded scenarios (A29)**: the user's choice over hand-mirrored
  tests — a data-layer change on android re-records, and Swift goes red.
- **Why not GRDB's migrator**: its bookkeeping table would make the schema
  differ; the TS `schema_version` table and migration strings are reused.
- **Why hand-written JSON column text**: JSONEncoder escapes "/", and
  `genres_json`/`seasons_json` text is compared across platforms.
```

`shared/README.md`, append a `## scenarios/` section describing the format, the `$ref`/`path`/`json` steps, id normalisation, `sql`/`query` steps, and the `LATER` list.

`apple/README.md`, append to **Rules**: "`IrisCore/Persistence` ports `src/data` and `src/db`, held to them by `shared/scenarios` (A29). Never hand-edit `Migrations.generated.swift`; it comes from `npm run fixtures:record`."

- [ ] **Step 3: Verify, commit, merge, push**

```bash
npm run typecheck && npx jest 2>&1 | tail -3 && apple/scripts/test.sh
git add docs/superpowers/specs/2026-08-12-track-it-design.md docs/superpowers/specs/2026-10-06-iris-design.md docs/HANDOFF.md DEVLOG.md shared/README.md apple/README.md
git commit -m "docs(iris): record A29 and I4 — persistence held to TS by scenarios

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run the final whole-branch review. Then, from the main checkout, `git worktree add .claude/worktrees/iris-integration iris` and in it `git merge --no-ff worktree-iris-persistence -m "Merge worktree-iris-persistence: GRDB persistence held to TS by scenarios (I4)"`. Re-verify on the merged tree, remove the worktree, and `git push origin iris worktree-iris-persistence`.
