# Iris I5 — Catalogue Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IrisCore talks to the same catalogues as the TS app — TMDB, Google Books, Metron, AniList — with the same requests and the same answers, and runs the metadata backfill (A22/A26) and Metron's issue sync (A25), proven by recordings rather than live network.

**Architecture:** Providers take an injected `HTTPClient` (URLSession in the app, a fake in tests) and their API keys (from `Secrets.xcconfig` via Info.plist). A new corpus, **provider recordings** (`shared/providers/`), runs each TS provider call against canned HTTP responses served by a fake `fetch` and records every request it made (method, URL, headers, body) and what it returned; Swift replays each case through a fake `HTTPClient` and must make identical requests and return identical results. The backfill and issue sync become two more **scenario** areas (A29) whose steps carry stub providers as data, recording which lookups ran and how long the pacing slept.

**Tech Stack:** Swift 6.4, Foundation `URLSession`, GRDB (I4), XCTest; TS: jest with a fake `global.fetch`.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md` §2.2 (`URLSession` + `Codable`, no third-party networking; keys in a git-ignored `.xcconfig`), §8 I5 ("Recorded-response tests per provider"), §10 ("no live network in tests"). A29 (scenarios) for the data side.

## Global Constraints

- No third-party networking; `URLSession` only (spec §2.2). No live network in any test (spec §10).
- API keys: `apple/Iris/Config/Secrets.xcconfig` (git-ignored) → Info.plist → `ProviderKeys.fromBundle()`; names `TMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `METRON_USERNAME`, `METRON_PASSWORD` (already documented in `Secrets.example.xcconfig`). Error messages keep the TS text verbatim, env-var names included.
- Request URLs are byte-identical to TS: `encodeURIComponent` semantics (unreserved `A–Z a–z 0–9 - _ . ! ~ * ' ( )`), the same query order; Metron's Basic auth uses the TS encoder (UTF-16 based, quirks included).
- Provider responses are read as untyped JSON (`JSONValue`) with TS's optional-chaining/`??`/truthiness rules, not strict `Codable` structs — a field of an unexpected type must behave as TS does, not fail the whole decode.
- In scope: `src/providers/{tmdb,googleBooks,metron,anilist,registry}.ts`, `src/data/{backfillMetadata,syncSeriesUnit}.ts`, `addTrack`'s hydrate via the registry. Out of scope: barcode scanning UI (VisionKit, I9), Add/search screens (I9).
- Work on `worktree-iris-providers`; merge into `iris` with `--no-ff`, push both (approved 2026-10-06).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Byte-identical requests** — a key or query with spaces, `&`, `é`, `'`: Swift's percent-encoding must match `encodeURIComponent`. Pinned by recordings with such queries (Task 2) replayed in Swift (Task 5).
2. **Never-throws contracts** — `details`, `preview`, `unitAt`, show/movie detail fetches must turn network errors, non-2xx, and missing keys into `null`/fallback, while `search` and AniList/Metron `hydrate` must throw with TS's message. Pinned by recordings with `networkError` and 500 responses for each method (Tasks 2–3).
3. **Pacing** — Metron 3.5 s / AniList 2 s between lookups of the same source, none for TMDB/Google Books, never before a source's first lookup. Pinned by backfill scenarios recording `sleeps` (Task 4).
4. **Loose JSON** — a hit with a numeric title, a missing `results`, `null` fields: TS filters or falls back; Swift must not throw a decode error. Pinned by "Iris parity: loose JSON" recordings per provider (Tasks 2–3).
5. **Exhausted fake responses** — a Swift port that makes *more* requests than TS would read a response that isn't there. The runner fails a case whose request count or order differs. Pinned in Task 5, Step 1.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `shared/providers/types.ts` | `ProviderCase`, `FakeResponse` |
| `shared/providers/registry.ts` | provider/call name → TS function; env + fake `fetch` |
| `shared/providers/record.ts` | `recordCase(case)` → `{ requests, result | throws }` |
| `shared/providers/cases/{tmdb,googleBooks,metron,anilist,pure}.ts` | authored cases |
| `shared/providers/{area}.json`, `__tests__/providers.test.ts` | recordings; record/compare/coverage |
| `shared/scenarios/cases/{backfill,sync}.ts` (+ `registry.ts` stub calls) | the two `LATER` areas |
| `apple/IrisCore/Sources/IrisCore/Providers/HTTP.swift` | `HTTPRequest`, `HTTPResponse`, `HTTPClient`, `URLSessionHTTPClient` |
| `…/Providers/MetadataProvider.swift` | protocols, `MatchPreview`, `UnitRecord`, `ManualProvider` |
| `…/Providers/{TMDB,GoogleBooks,Metron,AniList}Provider.swift` | ports |
| `…/Providers/ProviderRegistry.swift`, `ProviderKeys.swift` | `providerFor`/`providerForSource`, keys from Info.plist |
| `…/Domain/JSCompat.swift` | + `encodeURIComponent` |
| `…/Persistence/JSONValue.swift` | + JS-style accessors |
| `…/Persistence/{BackfillMetadata,SyncSeriesUnit}.swift` | ports |
| `apple/IrisCore/Tests/IrisCoreTests/ProviderRecordings/{FakeHTTP,RecordingRunner,Recordings+*}.swift`, `ProviderRecordingTests.swift` | replay |
| `apple/project.yml`, `apple/Iris/Info.plist` (generated, ignored) | keys reach the bundle |

---

### Task 1: TS — the provider-recording harness, with the pure provider functions

**Files:**
- Create: `shared/providers/{types,registry,record}.ts`, `shared/providers/cases/pure.ts`, `shared/providers/__tests__/providers.test.ts`, recorded `shared/providers/pure.json`

**Interfaces:**
- Produces:
  - `ProviderCase = { name; provider?: ProviderName; env?: Partial<Record<KeyName, string>>; call: string; args: unknown[]; responses?: FakeResponse[] }`
  - `ProviderName = 'tmdb-show' | 'tmdb-movie' | 'google-books-book' | 'google-books-manga' | 'google-books-comic' | 'metron' | 'anilist' | 'manual'`
  - `KeyName = 'TMDB_API_KEY' | 'GOOGLE_BOOKS_API_KEY' | 'METRON_USERNAME' | 'METRON_PASSWORD'` (set as `EXPO_PUBLIC_<name>` while recording; every other one unset)
  - `FakeResponse = { status?: number; body?: unknown } | { networkError: true }` (status defaults to 200)
  - Recorded: `{ area, generatedBy, cases: [{ name, provider, env, call, args, responses, requests: [{ method, url, headers, body }], result | throws }] }` — `headers` is the plain object passed to `fetch` (`{}` when none); `body` is the request body `JSON.parse`d, or `null`.
  - Call names: provider methods `search`, `hydrate`, `preview`, `details`, `unitAt`, `searchByUpc`; pure `sumEpisodeCount`, `seasonBreakdown`, `httpsUrl`, `tmdbImage`, `googleBooksImage`, `sharpCoverUrl`, `unitLabelFor`, `generateEntries`, `providerFor`, `providerForSource` (the last two record `{ id, category }`, `category` read from the instance or `null`).

- [ ] **Step 1: Types and registry**

`shared/providers/types.ts`:

```ts
export type ProviderName =
  | 'tmdb-show' | 'tmdb-movie'
  | 'google-books-book' | 'google-books-manga' | 'google-books-comic'
  | 'metron' | 'anilist' | 'manual';
export type KeyName = 'TMDB_API_KEY' | 'GOOGLE_BOOKS_API_KEY' | 'METRON_USERNAME' | 'METRON_PASSWORD';
export type FakeResponse = { status?: number; body?: unknown } | { networkError: true };
/** One provider call against canned HTTP responses (Iris I5). */
export type ProviderCase = {
  name: string;
  provider?: ProviderName;
  env?: Partial<Record<KeyName, string>>;
  call: string;
  args: unknown[];
  responses?: FakeResponse[];
};
```

`shared/providers/registry.ts`:

```ts
import { AnilistProvider } from '@/providers/anilist';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { googleBooksImage, httpsUrl, sharpCoverUrl, tmdbImage } from '@/providers/images';
import { generateEntries, ManualProvider, unitLabelFor } from '@/providers/manual';
import { MetronProvider } from '@/providers/metron';
import { providerFor, providerForSource } from '@/providers/registry';
import { seasonBreakdown, sumEpisodeCount, TmdbProvider } from '@/providers/tmdb';
import type { MetadataProvider } from '@/providers/types';
import type { ProviderName } from './types';

export function makeProvider(name: ProviderName): MetadataProvider & Record<string, unknown> {
  switch (name) {
    case 'tmdb-show': return new TmdbProvider('show') as never;
    case 'tmdb-movie': return new TmdbProvider('movie') as never;
    case 'google-books-book': return new GoogleBooksProvider('book') as never;
    case 'google-books-manga': return new GoogleBooksProvider('manga') as never;
    case 'google-books-comic': return new GoogleBooksProvider('comic') as never;
    case 'metron': return new MetronProvider() as never;
    case 'anilist': return new AnilistProvider() as never;
    case 'manual': return new ManualProvider() as never;
  }
}

/** What a resolved provider is, as data both platforms can report. */
const describe = (p: MetadataProvider | null) =>
  p === null ? null : { id: p.id, category: ((p as unknown as { category?: string }).category ?? null) };

/* eslint-disable @typescript-eslint/no-explicit-any */
export const pureCalls: Record<string, (...args: any[]) => unknown> = {
  sumEpisodeCount,
  seasonBreakdown,
  httpsUrl,
  tmdbImage,
  googleBooksImage,
  sharpCoverUrl,
  unitLabelFor,
  generateEntries,
  providerFor: (category) => describe(providerFor(category)),
  providerForSource: (source, category) => describe(providerForSource(source, category)),
};
```

`shared/providers/record.ts`:

```ts
import { makeProvider, pureCalls } from './registry';
import type { FakeResponse, KeyName, ProviderCase } from './types';

const KEYS: KeyName[] = ['TMDB_API_KEY', 'GOOGLE_BOOKS_API_KEY', 'METRON_USERNAME', 'METRON_PASSWORD'];

type RecordedRequest = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** Runs one case: env set exactly as given, fetch faked from `responses`. */
export async function recordCase(c: ProviderCase): Promise<Record<string, unknown>> {
  const savedEnv = Object.fromEntries(KEYS.map((k) => [k, process.env[`EXPO_PUBLIC_${k}`]]));
  const savedFetch = global.fetch;
  const queue: FakeResponse[] = [...(c.responses ?? [])];
  const requests: RecordedRequest[] = [];
  for (const k of KEYS) {
    if (c.env?.[k] !== undefined) process.env[`EXPO_PUBLIC_${k}`] = c.env[k];
    else delete process.env[`EXPO_PUBLIC_${k}`];
  }
  global.fetch = (async (url: string, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? 'GET',
      url,
      headers: (init?.headers as Record<string, string> | undefined) ?? {},
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const next = queue.shift();
    if (!next) throw new Error('no recorded response');
    if ('networkError' in next) throw new TypeError('Network request failed');
    const status = next.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => next.body } as Response;
  }) as typeof fetch;
  try {
    const target = c.provider ? makeProvider(c.provider) : null;
    const fn = target ? (target[c.call] as ((...a: unknown[]) => unknown) | undefined)?.bind(target) : pureCalls[c.call];
    if (!fn) throw new Error(`No ${c.provider ?? 'pure'} call "${c.call}" (case "${c.name}")`);
    try {
      const result = await fn(...(JSON.parse(JSON.stringify(c.args)) as unknown[]));
      return { ...c, requests, unusedResponses: queue.length, result: JSON.parse(JSON.stringify(result ?? null)) };
    } catch (e) {
      return { ...c, requests, unusedResponses: queue.length, throws: (e as Error).message };
    }
  } finally {
    global.fetch = savedFetch;
    for (const k of KEYS) {
      if (savedEnv[k] === undefined) delete process.env[`EXPO_PUBLIC_${k}`];
      else process.env[`EXPO_PUBLIC_${k}`] = savedEnv[k];
    }
  }
}
```

(`process.env` writes here are fine — they are read by the provider in the same jest context; only `TZ` needed the custom environment.)

- [ ] **Step 2: The test, red**

`shared/providers/__tests__/providers.test.ts`:

```ts
import * as fs from 'fs';
import * as path from 'path';
import { normTitle, testTitles } from '../../testTitles';
import { recordCase } from '../record';
import type { ProviderCase } from '../types';
import { cases as pure } from '../cases/pure';

/** Area → its cases and the tests they carry over. Paths are repo-relative. */
const AREAS: Record<string, { cases: ProviderCase[]; testFiles: string[] }> = {
  pure: {
    cases: pure,
    testFiles: ['src/providers/__tests__/images.test.ts', 'src/providers/__tests__/manual.test.ts', 'src/providers/__tests__/registry.test.ts'],
  },
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
```

Create `shared/providers/cases/pure.ts` as `export const cases: ProviderCase[] = [];` (with the type import). Run `npx jest shared/providers` → FAIL (coverage: every images/manual/registry title missing; and "every provider test file" lists the four provider files — that one stays red until Task 3).

- [ ] **Step 3: Author `pure.ts`**

One case per test in `images.test.ts`, `manual.test.ts`, `registry.test.ts`, named after it, `call` the function, `args` its inputs; `manual.test.ts`'s `hydrate`/`search` tests use `provider: 'manual'`. Registry tests: one case per `providerFor`/`providerForSource` call the test makes (suffix ` (2)` …). Record (`npm run fixtures:record`) and check each recorded `result` against the test's assertion (e.g. `providerFor('manga')` → `{ id: 'anilist', category: null }`, `providerFor('book')` → `{ id: 'google-books', category: 'book' }`).

- [ ] **Step 4: Commit** (with the "every provider test file feeds an area" test as the single known red — Task 3 closes it; note it in the ledger)

```bash
git add shared/providers
git commit -m "test(shared): record provider calls against canned HTTP responses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tasks 2–3: TS — record each provider

**Authoring rule (both tasks).** For every test in the provider's test file, a case named after it: `provider`, the `env` the test sets (`'test-key'`, `'user'`/`'pass'` as the test uses), `call`, `args`, and `responses` — the test's `mockFetchSequence` bodies in order (`ok: false` → `{ status: 500, body: … }`). Record, then check each case's `result`/`throws` and `requests[].url` against what the test asserts. Add, per provider, **Iris parity** cases:

- *Encoding (Review Focus 1):* a `search` for `"Spirited Away & Co. — Ça va?"` and a key containing `+/=` — the recorded URL is the spec Swift must reproduce.
- *Never-throws (Review Focus 2):* for every method TS documents as never throwing, one `{ networkError: true }` case and one `{ status: 500 }` case; for every throwing method, the same two (they record `throws`).
- *Loose JSON (Review Focus 4):* a response with a numeric title, a `null` list, and an extra unknown field.

#### Task 2: `tmdb` and `googleBooks`

Areas `tmdb: { cases, testFiles: ['src/providers/__tests__/tmdb.test.ts'] }`, `googleBooks: { …'googleBooks.test.ts' }`. `provider` is `tmdb-show`/`tmdb-movie`, `google-books-book`/`-manga`/`-comic` per test. Commit: `test(shared): record TMDB and Google Books provider calls`.

#### Task 3: `metron` and `anilist`

Areas `metron` (`metron.test.ts`), `anilist` (`anilist.test.ts`). Metron cases set `METRON_USERNAME`/`METRON_PASSWORD`; add one with a non-ASCII password (`'pässwörd'`) for the Basic-auth encoder. AniList requests record the parsed GraphQL body — Swift must send the exact `query` text. The "every provider test file feeds an area" test passes after this task. Commit: `test(shared): record Metron and AniList provider calls`.

---

### Task 4: TS — the backfill and issue-sync scenario areas

**Files:**
- Modify: `shared/scenarios/registry.ts` (stub-provider calls), `shared/scenarios/__tests__/scenarios.test.ts` (areas; `LATER` becomes empty)
- Create: `shared/scenarios/cases/{backfill,sync}.ts`, recorded `{backfill,sync}.json`

**Interfaces:**
- Produces scenario calls:
  - `backfillMetadata(stubs, now)` → `{ filled, skipped, failed, calls: string[], sleeps: number[] }`
  - `syncSeriesUnit(seriesId, stubs)` / `syncUnitForEntry(entryId, stubs)` → `{ changed: boolean, calls: string[] }`
  - `stubs: Record<source, { details?: Record<externalId, TrackMetadata | null | { throws: string }>, unitAt?: Record<'<externalId>#<ordinal>', UnitRecord | null> }>` — a source absent from `stubs` resolves to no provider; present without `details`/`unitAt`, a provider lacking that method. An externalId/key absent from the map answers `null`. `calls` lists `details:<externalId>` / `unitAt:<externalId>#<ordinal>` in order.

- [ ] **Step 1: Stub calls**

Append to `scenarioCalls` in `shared/scenarios/registry.ts`:

```ts
  backfillMetadata: async (db, stubs: Stubs, now: string) => {
    const calls: string[] = [];
    const sleeps: number[] = [];
    const result = await backfillMetadata(db, (source) => stubProvider(stubs[source], calls), () => now, async (ms) => {
      sleeps.push(ms);
    });
    return { ...result, calls, sleeps };
  },
  syncSeriesUnit: async (db, seriesId: string, stubs: Stubs) => {
    const calls: string[] = [];
    return { changed: await syncSeriesUnit(db, seriesId, (source) => stubProvider(stubs[source], calls)), calls };
  },
  syncUnitForEntry: async (db, entryId: string, stubs: Stubs) => {
    const calls: string[] = [];
    return { changed: await syncUnitForEntry(db, entryId, (source) => stubProvider(stubs[source], calls)), calls };
  },
```

and above the table:

```ts
import { backfillMetadata } from '@/data/backfillMetadata';
import { syncSeriesUnit, syncUnitForEntry } from '@/data/syncSeriesUnit';
import type { TrackMetadata } from '@/domain/types';
import type { MetadataProvider, UnitRecord } from '@/providers/types';

type StubSpec = { details?: Record<string, TrackMetadata | null | { throws: string }>; unitAt?: Record<string, UnitRecord | null> };
type Stubs = Record<string, StubSpec>;

/** A provider described as data, so Swift builds the same one (Iris I5). */
function stubProvider(spec: StubSpec | undefined, calls: string[]): MetadataProvider | null {
  if (!spec) return null;
  const provider: MetadataProvider = { id: 'stub', search: async () => [], hydrate: async () => { throw new Error('stub'); } };
  if (spec.details) {
    const answers = spec.details;
    provider.details = async (externalId) => {
      calls.push(`details:${externalId}`);
      const answer = answers[externalId];
      if (answer && 'throws' in answer) throw new Error(answer.throws);
      return answer ?? null;
    };
  }
  if (spec.unitAt) {
    const answers = spec.unitAt;
    provider.unitAt = async (externalId, ordinal) => {
      calls.push(`unitAt:${externalId}#${ordinal}`);
      return answers[`${externalId}#${ordinal}`] ?? null;
    };
  }
  return provider;
}
```

- [ ] **Step 2: Areas and cases**

In `scenarios.test.ts`: `LATER = []`; add `backfill: { scenarios: backfill, testFiles: ['backfillMetadata.test.ts'] }`, `sync: { scenarios: sync, testFiles: ['syncSeriesUnit.test.ts'] }`. Author one scenario per test (rows seeded with `sql`, as the tests do; their `fakeProvider(details)` becomes a `stubs` entry keyed by the row's `external_source`). The pacing tests (Review Focus 3) record `sleeps`. Record, check every result against the tests, commit: `test(shared): record backfill and issue-sync scenarios with stub providers`.

---

### Task 5: Swift — HTTP, JSON accessors, encodeURIComponent, provider protocols, recording runner, TMDB + Google Books

**Files:**
- Create: `…/Providers/{HTTP,MetadataProvider,TMDBProvider,GoogleBooksProvider}.swift`
- Modify: `…/Domain/JSCompat.swift`, `…/Persistence/JSONValue.swift`, `…/Providers/ProviderTypes.swift`
- Create (tests): `…/ProviderRecordings/{FakeHTTP,RecordingRunner,Recordings+TMDB,Recordings+GoogleBooks,Recordings+Pure}.swift`, `…/ProviderRecordingTests.swift`

**Interfaces:**
- Produces: `HTTPRequest { method, url: String, headers: [String: String], body: Data? }`, `HTTPResponse { status: Int, body: Data; ok; json() }`, `protocol HTTPClient: Sendable { func send(_:) async throws -> HTTPResponse }`, `URLSessionHTTPClient`; `protocol MetadataProvider: Sendable { var id: String; var category: Category? { get }; search; hydrate }`, `protocol PreviewingProvider`, `DetailsProvider` (`details(_:) async -> TrackMetadata?`), `UnitProvider` (`unitAt(_:ordinal:) async -> UnitRecord?`); `MatchPreview`, `UnitRecord`; `ManualProvider`; `encodeURIComponent(_:)`; `JSONValue` subscript/`array`/`number`/`bool`; `TMDBProvider(category:apiKey:http:)`, `GoogleBooksProvider(category:apiKey:http:)`, `sumEpisodeCount`, `seasonBreakdown`.

- [ ] **Step 1: The recording runner first (red)**

`…/ProviderRecordings/FakeHTTP.swift`:

```swift
import Foundation
@testable import IrisCore

/// Serves recorded responses in order and records every request (Iris I5).
actor FakeHTTP: HTTPClient {
    private var responses: [JSON]
    private(set) var requests: [JSON] = []

    init(_ responses: [JSON]) { self.responses = responses }

    nonisolated func send(_ request: HTTPRequest) async throws -> HTTPResponse { try await serve(request) }

    private func serve(_ request: HTTPRequest) throws -> HTTPResponse {
        let body: JSON = request.body.flatMap { try? JSONDecoder().decode(JSON.self, from: $0) } ?? .null
        requests.append(.object([
            "method": .string(request.method), "url": .string(request.url),
            "headers": .object(request.headers.mapValues(JSON.string)), "body": body,
        ]))
        guard !responses.isEmpty else { throw URLError(.resourceUnavailable) }
        let next = responses.removeFirst()
        guard case let .object(o) = next else { throw URLError(.badServerResponse) }
        if case .bool(true)? = o["networkError"] { throw URLError(.notConnectedToInternet) }
        let status = o["status"].flatMap { if case let .number(n) = $0 { Int(n) } else { nil } } ?? 200
        let data = try JSONEncoder().encode(o["body"] ?? .null)
        return HTTPResponse(status: status, body: data)
    }

    var unused: Int { responses.count }
}
```

`…/ProviderRecordings/RecordingRunner.swift`:

```swift
import Foundation
@testable import IrisCore

private struct RecordingFile: Decodable { let area: String; let cases: [RecordedCase] }
private struct RecordedCase: Decodable {
    let name: String
    let provider: String?
    let env: [String: String]?
    let call: String
    let args: [JSON]
    let responses: [JSON]?
    let requests: [JSON]
    let unusedResponses: Int
    let result: JSON?
    let `throws`: String?
}

/// (provider name, keys, http) → a Swift provider, mirroring makeProvider in shared/providers/registry.ts.
func makeProvider(_ name: String, keys: ProviderKeys, http: HTTPClient) -> (any MetadataProvider)? {
    let registry = ProviderRegistry(keys: keys, http: http)
    switch name {
    case "tmdb-show": return registry.provider(for: .show)
    case "tmdb-movie": return registry.provider(for: .movie)
    case "google-books-book": return GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
    case "google-books-manga": return GoogleBooksProvider(category: .manga, apiKey: keys.googleBooks, http: http)
    case "google-books-comic": return GoogleBooksProvider(category: .comic, apiKey: keys.googleBooks, http: http)
    case "metron": return registry.provider(for: .comic)
    case "anilist": return registry.provider(for: .manga)
    case "manual": return ManualProvider()
    default: return nil
    }
}

typealias RecordingCall = @Sendable ((any MetadataProvider)?, [JSON]) async throws -> JSON

let providersDirectory = fixturesDirectory.deletingLastPathComponent().appendingPathComponent("providers")

/// Replays one area; a case fails if any request differs (count, order,
/// method, URL, headers, body), if responses are left unread or run out, or
/// if the result/throw differs.
func runRecordings(_ area: String, _ calls: [String: RecordingCall]) async throws -> [String] {
    let file = try JSONDecoder().decode(RecordingFile.self, from: Data(contentsOf: providersDirectory.appendingPathComponent("\(area).json")))
    var failures: [String] = []
    for c in file.cases {
        let env = c.env ?? [:]
        let keys = ProviderKeys(tmdb: env["TMDB_API_KEY"], googleBooks: env["GOOGLE_BOOKS_API_KEY"],
                                metronUsername: env["METRON_USERNAME"], metronPassword: env["METRON_PASSWORD"])
        let http = FakeHTTP(c.responses ?? [])
        let provider = c.provider.flatMap { makeProvider($0, keys: keys, http: http) }
        if c.provider != nil && provider == nil { failures.append("\(c.name): no Swift provider \(c.provider!)"); continue }
        guard let call = calls[c.call] else { failures.append("\(c.name): no Swift call \(c.call)"); continue }
        var outcome: (JSON?, String?)
        do { outcome = (try await call(provider, c.args), nil) }
        catch let e as DomainError { outcome = (nil, e.message) }
        catch { outcome = (nil, "\(error)") }
        let requests = await http.requests
        if !fixtureMatches(.array(requests), .array(c.requests)) {
            failures.append("\(c.name): requests differ\n  expected \(JSON.array(c.requests))\n  got      \(JSON.array(requests))")
        }
        let unused = await http.unused
        if unused != c.unusedResponses { failures.append("\(c.name): \(unused) responses unread, expected \(c.unusedResponses)") }
        switch (outcome, c.throws) {
        case let ((nil, message?), expected?) where message == expected: break
        case let ((got?, nil), nil) where fixtureMatches(got, c.result ?? .null): break
        default: failures.append("\(c.name): expected \(c.throws.map { "throw \"\($0)\"" } ?? "\(c.result ?? .null)"), got \(outcome.1.map { "throw \"\($0)\"" } ?? "\(outcome.0 ?? .null)")")
        }
    }
    return failures
}
```

`…/ProviderRecordingTests.swift`:

```swift
import XCTest

/// Iris I5: every recorded provider call replays with identical requests and results.
final class ProviderRecordingTests: XCTestCase {
    static let pending: Set<String> = ["metron", "anilist"]
    static let ported: Set<String> = ["pure", "tmdb", "googleBooks"]

    private func check(_ area: String, _ calls: [String: RecordingCall]) async throws {
        let failures = try await runRecordings(area, calls)
        XCTAssert(failures.isEmpty, "\(area): \(failures.count) divergence(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryAreaIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: providersDirectory.path)
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
    }

    func testPure() async throws { try await check("pure", providerCalls) }
    func testTMDB() async throws { try await check("tmdb", providerCalls) }
    func testGoogleBooks() async throws { try await check("googleBooks", providerCalls) }
}
```

`…/ProviderRecordings/Recordings+Calls.swift` — one table for every call (provider methods dispatch on capability):

```swift
import Foundation
@testable import IrisCore

private func require<P>(_ p: (any MetadataProvider)?, _ type: P.Type) throws -> P {
    guard let typed = p as? P else { throw FixtureError("provider lacks \(type)") }
    return typed
}

private func describe(_ p: (any MetadataProvider)?) -> JSON {
    guard let p else { return .null }
    return .object(["id": .string(p.id), "category": p.category.map { .string($0.rawValue) } ?? .null])
}

let providerCalls: [String: RecordingCall] = [
    "search": { p, a in try toJSON(await require(p, (any MetadataProvider).self).search(arg(a, 0))) },
    "hydrate": { p, a in try toJSON(await require(p, (any MetadataProvider).self).hydrate(arg(a, 0))) },
    "preview": { p, a in try toJSON(await require(p, (any PreviewingProvider).self).preview(arg(a, 0))) },
    "details": { p, a in try toJSON(await require(p, (any DetailsProvider).self).details(arg(a, 0))) },
    "unitAt": { p, a in try toJSON(await require(p, (any UnitProvider).self).unitAt(arg(a, 0), ordinal: arg(a, 1))) },
    "searchByUpc": { p, a in try toJSON(await require(p, MetronProvider.self).searchByUpc(arg(a, 0), ean5: arg(a, 1))) },
    "sumEpisodeCount": { _, a in try toJSON(sumEpisodeCount(arg(a, 0))) },
    "seasonBreakdown": { _, a in try toJSON(seasonBreakdown(arg(a, 0))) },
    "httpsUrl": { _, a in try toJSON(httpsUrl(arg(a, 0))) },
    "tmdbImage": { _, a in try toJSON(tmdbImage(arg(a, 0), size: arg(a, 1))) },
    "googleBooksImage": { _, a in try toJSON(googleBooksImage(arg(a, 0), width: arg(a, 1))) },
    "sharpCoverUrl": { _, a in try toJSON(sharpCoverUrl(arg(a, 0))) },
    "unitLabelFor": { _, a in try toJSON(unitLabelFor(arg(a, 0))) },
    "generateEntries": { _, a in try toJSON(generateEntries(arg(a, 0))) },
    "providerFor": { _, a in
        let c: IrisCore.Category = try arg(a, 0)
        return describe(ProviderRegistry(keys: ProviderKeys(), http: FakeHTTP([])).provider(for: c))
    },
    "providerForSource": { _, a in
        let (s, c): (String, IrisCore.Category) = (try arg(a, 0), try arg(a, 1))
        return describe(ProviderRegistry(keys: ProviderKeys(), http: FakeHTTP([])).provider(forSource: s, category: c))
    },
]
```

Run: `swift test --package-path apple/IrisCore --filter ProviderRecordingTests` → compile errors (no `HTTPClient`, `ProviderKeys`, …).

- [ ] **Step 2: JS compat, JSON accessors, HTTP, protocols**

Append to `JSCompat.swift`:

```swift
/// `encodeURIComponent`: percent-encode UTF-8 bytes of everything except
/// A–Z a–z 0–9 - _ . ! ~ * ' ( ) — URLs must match the TS app byte for byte.
func encodeURIComponent(_ s: String) -> String {
    let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()".utf8)
    var out = ""
    for byte in s.utf8 {
        if unreserved.contains(byte) { out.unicodeScalars.append(Unicode.Scalar(byte)) }
        else { out += String(format: "%%%02X", byte) }
    }
    return out
}

/// JS `String(value)` for an untyped JSON value read off a catalogue response.
func jsString(_ value: JSONValue?) -> String { value?.jsDescription ?? "undefined" }
```

Append to `JSONValue.swift`:

```swift
extension JSONValue {
    /// `value?.key` — nil when this isn't an object or the key is absent.
    public subscript(key: String) -> JSONValue? { object?[key] }
    var array: [JSONValue]? { if case let .array(a) = self { a } else { nil } }
    var number: Double? { if case let .number(n) = self { n } else { nil } }
    var bool: Bool? { if case let .bool(b) = self { b } else { nil } }
    /// JS truthiness: false, 0, NaN, "" and null are falsy.
    var truthy: Bool {
        switch self {
        case .null: false
        case let .bool(b): b
        case let .number(n): n != 0 && !n.isNaN
        case let .string(s): !s.isEmpty
        case .array, .object: true
        }
    }
}
```

`…/Providers/HTTP.swift`:

```swift
import Foundation

/// A request exactly as the TS providers build it — `url` is the literal string.
public struct HTTPRequest: Sendable, Equatable {
    public var method: String
    public var url: String
    public var headers: [String: String]
    public var body: Data?
    public init(method: String = "GET", url: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method; self.url = url; self.headers = headers; self.body = body
    }
}

public struct HTTPResponse: Sendable {
    public var status: Int
    public var body: Data
    public init(status: Int, body: Data) { self.status = status; self.body = body }
    /// `response.ok`.
    public var ok: Bool { (200..<300).contains(status) }
    /// `await response.json()`.
    public func json() throws -> JSONValue { try JSONDecoder().decode(JSONValue.self, from: body) }
}

/// The one seam between providers and the network (spec §10: none in tests).
public protocol HTTPClient: Sendable {
    func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

public struct URLSessionHTTPClient: HTTPClient {
    private let session: URLSession
    public init(session: URLSession = .shared) { self.session = session }

    public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        guard let url = URL(string: request.url) else { throw URLError(.badURL) }
        var r = URLRequest(url: url)
        r.httpMethod = request.method
        r.httpBody = request.body
        for (k, v) in request.headers { r.setValue(v, forHTTPHeaderField: k) }
        let (data, response) = try await session.data(for: r)
        return HTTPResponse(status: (response as? HTTPURLResponse)?.statusCode ?? 0, body: data)
    }
}
```

`…/Providers/MetadataProvider.swift`:

```swift
/// Port of src/providers/types.ts's interface. TS marks `preview`, `details`
/// and `unitAt` optional; here they are separate protocols a provider adopts.
public protocol MetadataProvider: Sendable {
    var id: String { get }
    /// The category an instance is fixed to, when it is (TMDB, Google Books).
    var category: Category? { get }
    func search(_ query: String) async throws -> [SearchResult]
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft
}

/// A17: the confirm screen's data for a standalone match. Never throws.
public protocol PreviewingProvider: MetadataProvider {
    func preview(_ result: SearchResult) async -> MatchPreview
}

/// A22: metadata for a stored catalogue id; nil means the lookup failed. Never throws.
public protocol DetailsProvider: MetadataProvider {
    func details(_ externalId: String) async -> TrackMetadata?
}

/// A25: unit `ordinal` of the series `externalId` belongs to (Metron). Never throws.
public protocol UnitProvider: MetadataProvider {
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord?
}

public struct MatchPreview: Codable, Equatable, Sendable {
    public var title: String
    public var metaLine: [String]
    public var blurb: String?
    public var metadata: TrackMetadata?
}

public struct UnitRecord: Codable, Equatable, Sendable {
    public var externalId: String
    public var number: String
    public var coverUrl: String?
    public init(externalId: String, number: String, coverUrl: String?) { self.externalId = externalId; self.number = number; self.coverUrl = coverUrl }
}

/// Port of ManualProvider: no catalogue (D5) — entry generation only.
public struct ManualProvider: MetadataProvider {
    public let id = "manual"
    public var category: Category? { nil }
    public init() {}
    public func search(_ query: String) async throws -> [SearchResult] { [] }
    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft { try generateEntries(result) }
}
```

Add to `ProviderTypes.swift`'s `SeriesDraft` nothing; `SearchResult` gains nothing (already has `creator`, `year`, `thumbnailUrl`).

`…/Providers/ProviderKeys.swift`:

```swift
import Foundation

/// The catalogue credentials (spec §2.2): Secrets.xcconfig → Info.plist → here.
public struct ProviderKeys: Sendable, Equatable {
    public var tmdb: String?
    public var googleBooks: String?
    public var metronUsername: String?
    public var metronPassword: String?

    public init(tmdb: String? = nil, googleBooks: String? = nil, metronUsername: String? = nil, metronPassword: String? = nil) {
        self.tmdb = tmdb; self.googleBooks = googleBooks; self.metronUsername = metronUsername; self.metronPassword = metronPassword
    }

    /// Empty or unexpanded (`$(TMDB_API_KEY)` with no Secrets.xcconfig) values count as missing.
    public static func fromBundle(_ bundle: Bundle = .main) -> ProviderKeys {
        func value(_ key: String) -> String? {
            guard let v = bundle.object(forInfoDictionaryKey: key) as? String, !v.isEmpty, !v.hasPrefix("$(") else { return nil }
            return v
        }
        return ProviderKeys(tmdb: value("TMDB_API_KEY"), googleBooks: value("GOOGLE_BOOKS_API_KEY"),
                            metronUsername: value("METRON_USERNAME"), metronPassword: value("METRON_PASSWORD"))
    }
}
```

`…/Providers/ProviderRegistry.swift`:

```swift
/// Port of src/providers/registry.ts: one provider per category (D10), and
/// the provider behind a stored `external_source` (A22).
public struct ProviderRegistry: Sendable {
    public let keys: ProviderKeys
    public let http: HTTPClient

    public init(keys: ProviderKeys, http: HTTPClient) { self.keys = keys; self.http = http }

    public func provider(for category: Category) -> any MetadataProvider {
        switch category {
        case .book: GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
        case .manga: AniListProvider(http: http)
        case .comic: MetronProvider(username: keys.metronUsername, password: keys.metronPassword, http: http)
        case .show: TMDBProvider(category: .show, apiKey: keys.tmdb, http: http)
        case .movie: TMDBProvider(category: .movie, apiKey: keys.tmdb, http: http)
        }
    }

    public func provider(forSource source: String, category: Category) -> (any MetadataProvider)? {
        switch source {
        case "google-books": GoogleBooksProvider(category: .book, apiKey: keys.googleBooks, http: http)
        case "tmdb": provider(for: category == .movie ? .movie : .show)
        case "metron": provider(for: .comic)
        case "anilist": provider(for: .manga)
        default: nil
        }
    }
}
```

(Metron/AniList types arrive in Task 6; until then make `provider(for:)` return `ManualProvider()` for `.manga`/`.comic` and `provider(forSource:)` return `nil` for those two sources, and leave `metron`/`anilist` in `pending`. Ledger it; Task 6 restores the lines above.)

- [ ] **Step 3: TMDB**

`…/Providers/TMDBProvider.swift`:

```swift
import Foundation

/// Port of src/providers/tmdb.ts — `show` and `movie`, one category per instance.
public struct TMDBProvider: PreviewingProvider, DetailsProvider {
    public let id = "tmdb"
    private let fixedCategory: Category
    private let apiKey: String?
    private let http: HTTPClient

    public init(category: Category, apiKey: String?, http: HTTPClient) {
        self.fixedCategory = category; self.apiKey = apiKey?.isEmpty == false ? apiKey : nil; self.http = http
    }

    public var category: Category? { fixedCategory }
    private var endpoint: String { fixedCategory == .show ? "tv" : "movie" }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        guard let key = apiKey else { throw DomainError("TMDB search needs EXPO_PUBLIC_TMDB_API_KEY") }
        let url = "https://api.themoviedb.org/3/search/\(endpoint)?api_key=\(encodeURIComponent(key))&query=\(encodeURIComponent(trimmed))"
        let response = try await http.send(HTTPRequest(url: url))
        guard response.ok else { throw DomainError("TMDB search failed: \(response.status)") }
        let body = try response.json()
        return (body["results"]?.array ?? []).compactMap { hit in
            guard let title = (fixedCategory == .show ? hit["name"] : hit["title"])?.string else { return nil }
            return SearchResult(
                id: jsString(hit["id"]), title: title, category: fixedCategory, count: 1,
                year: yearOf((fixedCategory == .show ? hit["first_air_date"] : hit["release_date"])?.string),
                thumbnailUrl: tmdbImage(hit["poster_path"]?.string, size: "w185")
            )
        }
    }

    /// A11: a matched show's ongoing comes from TMDB's status; an unmatched title is manual.
    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        let matched = result.id != id
        if fixedCategory != .show || !matched {
            var draft = try generateEntries(result)
            if matched { draft.externalSource = id; draft.externalId = result.id }
            return draft
        }
        let detail = await fetchShowDetail(result.id)
        var input = result
        if let detail { input.count = detail.total ?? result.count; input.ongoing = detail.ongoing }
        var draft = try generateEntries(input)
        if let detail {
            if !detail.seasons.isEmpty { draft.seasons = detail.seasons }
            draft.metaLine = detail.metaLine
            draft.blurb = detail.blurb
            draft.metadata = detail.metadata
        }
        draft.externalSource = id
        draft.externalId = result.id
        return draft
    }

    public func preview(_ result: SearchResult) async -> MatchPreview {
        let fallback = MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: nil)
        guard let body = await fetchMovieDetail(result.id) else { return fallback }
        let metadata = Self.movieMetadata(body)
        return MatchPreview(title: result.title, metaLine: metadata.releaseYear.map { [$0] } ?? [], blurb: metadata.description, metadata: metadata)
    }

    public func details(_ externalId: String) async -> TrackMetadata? {
        if fixedCategory == .show { return await fetchShowDetail(externalId)?.metadata }
        return await fetchMovieDetail(externalId).map(Self.movieMetadata)
    }

    // MARK: Lookups — never throw

    private func get(_ url: String) async -> JSONValue? {
        guard let response = try? await http.send(HTTPRequest(url: url)), response.ok else { return nil }
        return try? response.json()
    }

    private func fetchMovieDetail(_ movieId: String) async -> JSONValue? {
        guard let key = apiKey else { return nil }
        return await get("https://api.themoviedb.org/3/movie/\(encodeURIComponent(movieId))?api_key=\(encodeURIComponent(key))&append_to_response=credits")
    }

    private static func movieMetadata(_ body: JSONValue) -> TrackMetadata {
        let directors = (body["credits"]?["crew"]?.array ?? []).filter { $0["job"]?.string == "Director" }
        return withGenres(
            TrackMetadata(
                coverUrl: tmdbImage(body["poster_path"]?.string, size: "w780"), creator: namesOf(directors),
                description: cleanDescription(body["overview"]?.string), releaseYear: yearOf(body["release_date"]?.string)
            ),
            body["genres"]?.array?.map { $0["name"]?.string }
        )
    }

    private struct ShowDetail {
        var total: Double?
        var ongoing: Bool
        var seasons: [SeasonBoundary]
        var metaLine: [String]
        var blurb: String?
        var metadata: TrackMetadata
    }

    private func fetchShowDetail(_ showId: String) async -> ShowDetail? {
        guard let key = apiKey,
              let body = await get("https://api.themoviedb.org/3/tv/\(encodeURIComponent(showId))?api_key=\(encodeURIComponent(key))")
        else { return nil }
        let seasons = body["seasons"]?.array ?? []
        let breakdown = seasonBreakdown(seasons)
        let total = sumEpisodeCount(seasons)
        let status = body["status"]?.string
        let ongoing = status != "Ended" && status != "Canceled"
        let startYear = yearOf(body["first_air_date"]?.string)
        let endYear = yearOf(body["last_air_date"]?.string)
        let yearRange: String? = startYear.map { start in
            ongoing ? "\(start)–present" : (endYear.map { $0 != start ? "\(start)–\($0)" : start } ?? start)
        }
        let metaLine = [
            yearRange,
            breakdown.isEmpty ? nil : "\(breakdown.count) season\(breakdown.count == 1 ? "" : "s")",
            total > 0 ? "\(jsNumberString(total)) episode\(total == 1 ? "" : "s")" : nil,
            ongoing ? "Ongoing" : status,
        ].compactMap { $0 }
        return ShowDetail(
            total: total > 0 ? total : nil, ongoing: ongoing, seasons: breakdown, metaLine: metaLine,
            blurb: cleanDescription(body["overview"]?.string),
            metadata: withGenres(
                TrackMetadata(
                    coverUrl: tmdbImage(body["poster_path"]?.string, size: "w780"), creator: namesOf(body["created_by"]?.array),
                    description: cleanDescription(body["overview"]?.string), releaseYear: startYear
                ),
                body["genres"]?.array?.map { $0["name"]?.string }
            )
        )
    }
}

/// `people.map(p => p.name).filter(Boolean).join(', ')`, or nil.
func namesOf(_ people: [JSONValue]?) -> String? {
    let names = (people ?? []).compactMap { $0["name"]?.string }.filter { !$0.isEmpty }
    return names.isEmpty ? nil : names.joined(separator: ", ")
}

/// Season 0 is specials — excluded (D1: still a flat episode count).
public func sumEpisodeCount(_ seasons: [JSONValue]) -> Double {
    seasons.filter { $0["season_number"]?.number != 0 }.reduce(0) { $0 + ($1["episode_count"]?.number ?? 0) }
}

/// A11: the per-season breakdown for the segmented bar.
public func seasonBreakdown(_ seasons: [JSONValue]) -> [SeasonBoundary] {
    seasons.filter { $0["season_number"]?.number != 0 }.map {
        SeasonBoundary(number: Int($0["season_number"]?.number ?? 0), episodeCount: Int($0["episode_count"]?.number ?? 0))
    }
}
```

The recorded `sumEpisodeCount`/`seasonBreakdown` cases pass their arrays as `args[0]`; the registry calls above decode them as `[JSONValue]`. (`generateEntries`/`SearchResult.count` are `Double?` from I4; the TMDB `count` assignment is `Double?` already.) A season whose numbers aren't safe integers is outside what TMDB returns; `Int(_:)` there is guarded by the recordings — if one traps, clamp with `Int(exactly:) ?? 0` and ledger it.

- [ ] **Step 4: Google Books**

`…/Providers/GoogleBooksProvider.swift`:

```swift
import Foundation

/// Port of src/providers/googleBooks.ts — `book`, `manga`, `comic`, one category per instance.
public struct GoogleBooksProvider: PreviewingProvider, DetailsProvider {
    public let id = "google-books"
    private let fixedCategory: Category
    private let apiKey: String?
    private let http: HTTPClient

    public init(category: Category, apiKey: String?, http: HTTPClient) {
        self.fixedCategory = category; self.apiKey = apiKey?.isEmpty == false ? apiKey : nil; self.http = http
    }

    public var category: Category? { fixedCategory }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        guard let key = apiKey else { throw DomainError("Google Books search needs EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY") }

        func fetchShelf(_ q: String) async throws -> [JSONValue] {
            let url = "https://www.googleapis.com/books/v1/volumes?q=\(encodeURIComponent(q))&printType=books&maxResults=40&key=\(encodeURIComponent(key))"
            let response = try await http.send(HTTPRequest(url: url))
            guard response.ok else { throw DomainError("Google Books search failed: \(response.status)") }
            return (try response.json()["items"]?.array ?? []).filter(isShelfBook)
        }

        var items: [JSONValue]
        if trimmed.wholeMatch(of: jsRegex(#/\d{10}(\d{3})?/#)) != nil {
            items = try await fetchShelf("isbn:\(trimmed)")
        } else {
            items = try await fetchShelf("intitle:\(trimmed)")
            if items.isEmpty { items = try await fetchShelf(trimmed) }
        }
        // Stable sort: equal ranks keep Google's relevance order.
        let ranked = items.enumerated()
            .sorted { completeness($0.element) != completeness($1.element) ? completeness($0.element) > completeness($1.element) : $0.offset < $1.offset }
            .map(\.element)
        return dedupe(ranked).map { item in
            let info = item["volumeInfo"]
            let links = info?["imageLinks"]
            return SearchResult(
                id: jsString(item["id"]), title: info?["title"]?.string ?? "", category: fixedCategory, count: 1,
                creator: authorsOf(info?["authors"]?.array), year: yearOf(info?["publishedDate"]?.string),
                thumbnailUrl: googleBooksImage(links?["thumbnail"]?.string ?? links?["smallThumbnail"]?.string, width: 200)
            )
        }
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        var draft = try generateEntries(result)
        if result.id == id { return draft }
        draft.externalSource = id
        draft.externalId = result.id
        return draft
    }

    public func preview(_ result: SearchResult) async -> MatchPreview {
        let fallback = MatchPreview(title: result.title, metaLine: [], blurb: nil, metadata: nil)
        if result.id == id { return fallback }
        guard case let .found(info) = await fetchVolume(result.id) else { return fallback }
        let metadata = metadataOf(info)
        let pages = info["pageCount"]
        let metaLine = [metadata.releaseYear, pages?.truthy == true ? "\(jsString(pages)) pages" : nil].compactMap { $0 }
        return MatchPreview(title: result.title, metaLine: metaLine, blurb: metadata.description, metadata: metadata)
    }

    /// A 404 answers with empty metadata (stamp it); other failures retry later (nil).
    public func details(_ externalId: String) async -> TrackMetadata? {
        switch await fetchVolume(externalId) {
        case .gone: TrackMetadata(coverUrl: nil, creator: nil, description: nil, releaseYear: nil)
        case let .found(info): metadataOf(info)
        case .failed: nil
        }
    }

    private enum Volume { case found(JSONValue), gone, failed }

    private func fetchVolume(_ volumeId: String) async -> Volume {
        guard let key = apiKey else { return .failed }
        guard let response = try? await http.send(HTTPRequest(url: "https://www.googleapis.com/books/v1/volumes/\(encodeURIComponent(volumeId))?key=\(encodeURIComponent(key))"))
        else { return .failed }
        if response.status == 404 { return .gone }
        guard response.ok, let body = try? response.json() else { return .failed }
        return .found(body["volumeInfo"] ?? .object([:]))
    }
}

private func isShelfBook(_ item: JSONValue) -> Bool {
    guard let title = item["volumeInfo"]?["title"]?.string else { return false }
    let hasIsbn = (item["volumeInfo"]?["industryIdentifiers"]?.array ?? []).contains {
        ($0["type"]?.string ?? "").wholeMatch(of: jsRegex(#/ISBN_(10|13)/#)) != nil
    }
    let knockoff = title.firstMatch(of: jsRegex(#/^(summary|study guide|workbook)\b|\bsummary (and|&) analysis\b|\bstudy guide\b|\bbook club (kit|in a box)\b|\b(movie|book) review$/#).ignoresCase()) != nil
    return hasIsbn && !knockoff
}

private func completeness(_ item: JSONValue) -> Int {
    (item["volumeInfo"]?["imageLinks"] != nil && item["volumeInfo"]?["imageLinks"] != .null ? 2 : 0)
        + ((item["volumeInfo"]?["authors"]?.array?.isEmpty == false) ? 1 : 0)
}

private func dedupe(_ items: [JSONValue]) -> [JSONValue] {
    var seen = Set<String>()
    return items.filter { item in
        let info = item["volumeInfo"]
        let key = "\(jsTrim(info?["title"]?.string ?? "").lowercased())|\((info?["authors"]?.array?.first?.string ?? "").lowercased())"
        return seen.insert(key).inserted
    }
}

private func authorsOf(_ authors: [JSONValue]?) -> String? {
    guard let authors, !authors.isEmpty else { return nil }
    return authors.map { $0.string ?? jsString($0) }.joined(separator: ", ")
}

private func metadataOf(_ info: JSONValue) -> TrackMetadata {
    let links = info["imageLinks"]
    return withGenres(
        TrackMetadata(
            coverUrl: sharpCoverUrl(links?["thumbnail"]?.string ?? links?["smallThumbnail"]?.string),
            creator: authorsOf(info["authors"]?.array), description: cleanDescription(info["description"]?.string),
            releaseYear: yearOf(info["publishedDate"]?.string)
        ),
        info["categories"]?.array?.map { $0.string }
    )
}
```

- [ ] **Step 5: Run, fix divergences in Swift, commit**

Run: `swift test --package-path apple/IrisCore --filter ProviderRecordingTests 2>&1 | grep -E "divergence|requests differ|expected|Executed"`. Each line names the case and shows both values. Fix the Swift port (never the recordings). When green: full `swift test`, commit `feat(iris-core): TMDB and Google Books providers, replayed against TS recordings`.

---

### Task 6: Swift — Metron and AniList

**Files:** Create `…/Providers/{MetronProvider,AniListProvider}.swift`; modify `ProviderRegistry.swift` (real providers), `ProviderRecordingTests.swift` (`pending = []`, add `testMetron`, `testAniList`, `testEveryAreaIsPorted`).

- [ ] **Step 1: Register (red)** — move both areas to `ported`, add the test methods; restore the real `provider(for:)`/`provider(forSource:)` lines from Task 5's listing. Run → compile errors.

- [ ] **Step 2: Metron**

`…/Providers/MetronProvider.swift`:

```swift
import Foundation

private let baseURL = "https://metron.cloud/api"

/// The TS encoder, byte for byte: UTF-16 code units, each surrogate encoded on
/// its own as 3 bytes (no pair joining) — so a password matches across platforms.
func metronBase64(_ input: String) -> String {
    var bytes: [UInt8] = []
    for unit in input.utf16 {
        let code = Int(unit)
        if code < 0x80 { bytes.append(UInt8(code)) }
        else if code < 0x800 { bytes += [UInt8(0xC0 | (code >> 6)), UInt8(0x80 | (code & 0x3F))] }
        else { bytes += [UInt8(0xE0 | (code >> 12)), UInt8(0x80 | ((code >> 6) & 0x3F)), UInt8(0x80 | (code & 0x3F))] }
    }
    let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
    var out = ""
    var i = 0
    while i < bytes.count {
        let b0 = Int(bytes[i]), b1 = i + 1 < bytes.count ? Int(bytes[i + 1]) : nil, b2 = i + 2 < bytes.count ? Int(bytes[i + 2]) : nil
        out.append(chars[b0 >> 2])
        out.append(chars[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)])
        out.append(b1 == nil ? "=" : chars[((b1! & 0x0F) << 2) | ((b2 ?? 0) >> 6)])
        out.append(b2 == nil ? "=" : chars[b2! & 0x3F])
        i += 3
    }
    return out
}

/// Port of src/providers/metron.ts — comic issues; HTTP Basic auth.
public struct MetronProvider: DetailsProvider, UnitProvider {
    public let id = "metron"
    public var category: Category? { nil }
    private let username: String?
    private let password: String?
    private let http: HTTPClient

    public init(username: String?, password: String?, http: HTTPClient) {
        self.username = username?.isEmpty == false ? username : nil
        self.password = password?.isEmpty == false ? password : nil
        self.http = http
    }

    private func get(_ path: String) async throws -> JSONValue {
        guard let username, let password else {
            throw DomainError("Metron search needs EXPO_PUBLIC_METRON_USERNAME/EXPO_PUBLIC_METRON_PASSWORD")
        }
        let response = try await http.send(HTTPRequest(url: "\(baseURL)\(path)", headers: ["Authorization": "Basic \(metronBase64("\(username):\(password)"))"]))
        guard response.ok else { throw DomainError("Metron request failed: \(response.status)") }
        return try response.json()
    }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        return toResults(try await get("/issue/?series_name=\(encodeURIComponent(trimmed))"))
    }

    /// A9: UPC-A + EAN-5 → exact match; UPC-A alone → prefix match.
    public func searchByUpc(_ upcA: String, ean5: String?) async throws -> [SearchResult] {
        let upc = jsTrim(upcA)
        let supplement = ean5.map(jsTrim)
        let param = supplement.map { !$0.isEmpty } == true
            ? "upc=\(encodeURIComponent(upc + supplement!))"
            : "upc_starts_with=\(encodeURIComponent(upc))"
        return toResults(try await get("/issue/?\(param)"))
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        if result.id == id { return try generateEntries(result) }
        let issue = try await get("/issue/\(encodeURIComponent(result.id))/")
        let series = try await get("/series/\(encodeURIComponent(jsString(issue["series"]?["id"])))/")
        let total = series["issue_count"]?.number ?? 0
        let yearEnd = series["year_end"]
        let ongoing = yearEnd == nil || yearEnd == .null
        var input = result
        input.title = issue["series"]?["name"]?.string ?? result.title
        input.count = total > 0 ? total : result.count
        input.ongoing = ongoing
        var draft = try generateEntries(input)
        let began = series["year_began"]
        let yearRange: String? = began?.truthy == true
            ? (ongoing ? "\(jsString(began))–present"
               : (yearEnd?.truthy == true && yearEnd != began ? "\(jsString(began))–\(jsString(yearEnd))" : jsString(began)))
            : nil
        draft.metaLine = [
            series["publisher"]?["name"]?.string,
            yearRange,
            total > 0 ? "\(jsNumberString(total)) issue\(total == 1 ? "" : "s")" : nil,
            ongoing ? "Ongoing" : "Completed",
        ].compactMap { $0 }
        draft.externalSource = id
        draft.externalId = result.id
        draft.blurb = cleanDescription(series["desc"]?.string)
        draft.metadata = metronMetadata(issue, series)
        return draft
    }

    public func details(_ externalId: String) async -> TrackMetadata? {
        guard let issue = try? await get("/issue/\(encodeURIComponent(externalId))/"),
              let series = try? await get("/series/\(encodeURIComponent(jsString(issue["series"]?["id"])))/") else { return nil }
        return metronMetadata(issue, series)
    }

    /// A25: Longbox's next-issue lookup — series id + number, one request.
    public func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? {
        guard let issue = try? await get("/issue/\(encodeURIComponent(externalId))/"),
              let body = try? await get("/issue/?series_id=\(encodeURIComponent(jsString(issue["series"]?["id"])))&number=\(encodeURIComponent(String(ordinal)))"),
              let hit = body["results"]?.array?.first else { return nil }
        return UnitRecord(externalId: jsString(hit["id"]), number: hit["number"]?.string ?? jsString(hit["number"]), coverUrl: hit["image"]?.string)
    }
}

private func toResults(_ body: JSONValue) -> [SearchResult] {
    (body["results"]?.array ?? []).map { item in
        SearchResult(id: jsString(item["id"]), title: item["issue"]?.string ?? "", category: .comic, count: 1,
                     year: yearOf(item["cover_date"]?.string), thumbnailUrl: item["image"]?.string)
    }
}

/// Writer credits first; a "Story" credit counts as writing. First spelling wins.
private func writersOf(_ credits: [JSONValue]?) -> String? {
    var seen = Set<String>()
    let names = (credits ?? [])
        .filter { ($0["role"]?.array ?? []).contains { ($0["name"]?.string ?? "").firstMatch(of: jsRegex(#/writer|story/#).ignoresCase()) != nil } }
        .compactMap { $0["creator"]?.string }
        .filter { !$0.isEmpty && seen.insert($0).inserted }
    return names.isEmpty ? nil : names.joined(separator: ", ")
}

private func metronMetadata(_ issue: JSONValue, _ series: JSONValue) -> TrackMetadata {
    withGenres(
        TrackMetadata(
            coverUrl: issue["image"]?.string, creator: writersOf(issue["credits"]?.array),
            description: cleanDescription(series["desc"]?.string),
            releaseYear: series["year_began"]?.truthy == true ? jsString(series["year_began"]) : nil
        ),
        series["genres"]?.array?.map { $0["name"]?.string }
    )
}
```

- [ ] **Step 3: AniList**

`…/Providers/AniListProvider.swift` — the GraphQL strings must equal the TS template literals **exactly** (the recordings compare the request body's `query`):

```swift
import Foundation

private let endpoint = "https://graphql.anilist.co"
private let staffFields = "staff(perPage: 4, sort: [RELEVANCE]) { edges { role node { name { full } } } }"
private let searchQuery = """

  query ($search: String) {
    Page(perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english }
        startDate { year }
        coverImage { large }
        \(staffFields)
      }
    }
  }

"""
private let detailQuery = """

  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      volumes
      chapters
      status
      description(asHtml: false)
      genres
      startDate { year }
      endDate { year }
      coverImage { extraLarge large }
      \(staffFields)
    }
  }

"""

/// Port of src/providers/anilist.ts — manga (A11), keyless GraphQL.
public struct AniListProvider: DetailsProvider {
    public let id = "anilist"
    public var category: Category? { nil }
    private let http: HTTPClient

    public init(http: HTTPClient) { self.http = http }

    private func post(_ query: String, _ variables: [String: JSONValue]) async throws -> JSONValue {
        let body = try JSONEncoder().encode(JSONValue.object(["query": .string(query), "variables": .object(variables)]))
        let response = try await http.send(HTTPRequest(
            method: "POST", url: endpoint,
            headers: ["Content-Type": "application/json", "Accept": "application/json"], body: body
        ))
        guard response.ok else { throw DomainError("AniList request failed: \(response.status)") }
        return try response.json()
    }

    /// `Number(id)`: a numeric string, or NaN — which JSON.stringify writes as null.
    private func idVariable(_ id: String) -> JSONValue {
        let trimmed = jsTrim(id)
        if trimmed.isEmpty { return .number(0) }
        return Double(trimmed).map(JSONValue.number) ?? .null
    }

    public func search(_ query: String) async throws -> [SearchResult] {
        let trimmed = jsTrim(query)
        if trimmed.isEmpty { return [] }
        let body = try await post(searchQuery, ["search": .string(trimmed)])
        return (body["data"]?["Page"]?["media"]?.array ?? []).compactMap { hit in
            let titles = hit["title"]
            let english = titles?["english"]
            guard let title = (english == nil || english == .null ? titles?["romaji"] : english)?.string else { return nil }
            let year = hit["startDate"]?["year"]
            return SearchResult(
                id: jsString(hit["id"]), title: title, category: .manga, count: 1, creator: authorOf(hit["staff"]),
                year: year?.truthy == true ? jsString(year) : nil, thumbnailUrl: hit["coverImage"]?["large"]?.string
            )
        }
    }

    public func hydrate(_ result: SearchResult) async throws -> SeriesDraft {
        if result.id == id { return try generateEntries(result) }
        let body = try await post(detailQuery, ["id": idVariable(result.id)])
        let media = body["data"]?["Media"]
        let status = media?["status"]?.string
        let ongoing = status == "RELEASING" || status == "NOT_YET_RELEASED"
        let volumes = media?["volumes"]
        let total = (volumes != nil && volumes != .null ? volumes : media?["chapters"])?.number
        var input = result
        input.count = !ongoing && (total ?? 0) > 0 ? total : result.count
        input.ongoing = ongoing
        var draft = try generateEntries(input)
        let start = media?["startDate"]?["year"].flatMap { $0 == .null ? nil : $0 }
        let end = media?["endDate"]?["year"].flatMap { $0 == .null ? nil : $0 }
        let yearRange: String? = start?.truthy == true
            ? (ongoing ? "\(jsString(start))–present"
               : (end?.truthy == true && end != start ? "\(jsString(start))–\(jsString(end))" : jsString(start)))
            : nil
        let countLabel: String? = (total ?? 0) > 0
            ? "\(jsNumberString(total!)) \(volumes?.truthy == true ? "volume" : "chapter")\(total == 1 ? "" : "s")"
            : nil
        draft.metaLine = [yearRange, countLabel, ongoing ? "Ongoing" : "Completed"].compactMap { $0 }
        draft.externalSource = id
        draft.externalId = result.id
        draft.blurb = cleanDescription(media?["description"]?.string)
        draft.metadata = media.map(anilistMetadata)
        return draft
    }

    public func details(_ externalId: String) async -> TrackMetadata? {
        guard let body = try? await post(detailQuery, ["id": idVariable(externalId)]),
              let media = body["data"]?["Media"], media != .null else { return nil }
        return anilistMetadata(media)
    }
}

/// The story credit is the author; else the first credit.
private func authorOf(_ staff: JSONValue?) -> String? {
    let edges = staff?["edges"]?.array ?? []
    let story = edges.first { ($0["role"]?.string ?? "").firstMatch(of: jsRegex(#/story/#).ignoresCase()) != nil } ?? edges.first
    return story?["node"]?["name"]?["full"]?.string
}

private func anilistMetadata(_ media: JSONValue) -> TrackMetadata {
    let cover = media["coverImage"]
    let extraLarge = cover?["extraLarge"]?.string
    let year = media["startDate"]?["year"]
    return withGenres(
        TrackMetadata(
            coverUrl: extraLarge ?? cover?["large"]?.string, creator: authorOf(media["staff"]),
            description: cleanDescription(media["description"]?.string),
            releaseYear: year?.truthy == true ? jsString(year) : nil
        ),
        media["genres"]?.array?.map { $0.string }
    )
}
```

(The TS template literals are `` `\n  query …\n` `` — verify the Swift strings' leading/trailing newlines and indentation against the first AniList recording's `requests[0].body.query`; fix the Swift literal until identical. Ledger any adjustment.)

- [ ] **Step 4: Run, fix, commit** — `feat(iris-core): Metron and AniList providers, replayed against TS recordings`.

---

### Task 7: Swift — backfill, issue sync, addTrack through the registry

**Files:** Create `…/Persistence/{BackfillMetadata,SyncSeriesUnit}.swift`, `…/Scenarios/Scenarios+Providers.swift`; modify `ScenarioTests.swift` (areas `backfill`, `sync`), `…/Persistence/AddTrack.swift` (doc: callers pass `registry.provider(for:).hydrate`).

- [ ] **Step 1: Stub calls (red)**

`…/Scenarios/Scenarios+Providers.swift`:

```swift
import Foundation
import GRDB
@testable import IrisCore

/// Mirrors stubProvider in shared/scenarios/registry.ts: a provider described
/// as data. Swift's optional capabilities are protocol conformances, so the
/// spec picks one of four concrete stubs.
actor CallLog { private(set) var calls: [String] = []; func add(_ c: String) { calls.append(c) } }
actor SleepLog { private(set) var values: [Double] = []; func add(_ v: Double) { values.append(v) } }

private func field(_ j: JSON?, _ key: String) -> JSON? { if case let .object(o)? = j { o[key] } else { nil } }
private func entries(_ j: JSON?) -> [String: JSON] { if case let .object(o)? = j { o } else { [:] } }

/// A `details` answer: metadata, null, or `{ "throws": … }` (a failed lookup — Swift's
/// details never throws, and TS's backfill already counts a throw as `failed`).
private func detailsAnswer(_ answers: [String: JSON], _ id: String) -> TrackMetadata? {
    guard let a = answers[id], a != .null, field(a, "throws") == nil else { return nil }
    return try? fromJSON(a)
}

private struct NoCapabilities: MetadataProvider {
    let id = "stub"
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
}

private struct DetailsStub: DetailsProvider {
    let id = "stub"; let answers: [String: JSON]; let log: CallLog
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func details(_ externalId: String) async -> TrackMetadata? { await log.add("details:\(externalId)"); return detailsAnswer(answers, externalId) }
}

private struct UnitStub: UnitProvider {
    let id = "stub"; let answers: [String: JSON]; let log: CallLog
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? {
        await log.add("unitAt:\(externalId)#\(ordinal)")
        return answers["\(externalId)#\(ordinal)"].flatMap { $0 == .null ? nil : try? fromJSON($0) }
    }
}

private struct BothStub: DetailsProvider, UnitProvider {
    let details: DetailsStub; let units: UnitStub
    let id = "stub"
    var category: IrisCore.Category? { nil }
    func search(_ query: String) async throws -> [SearchResult] { [] }
    func hydrate(_ result: SearchResult) async throws -> SeriesDraft { throw DomainError("stub") }
    func details(_ externalId: String) async -> TrackMetadata? { await details.details(externalId) }
    func unitAt(_ externalId: String, ordinal: Int) async -> UnitRecord? { await units.unitAt(externalId, ordinal: ordinal) }
}

func stubResolver(_ stubs: JSON, log: CallLog) -> @Sendable (String, IrisCore.Category) -> (any MetadataProvider)? {
    let specs = entries(stubs)
    return { source, _ in
        guard let spec = specs[source] else { return nil }
        let d = field(spec, "details").map { DetailsStub(answers: entries($0), log: log) }
        let u = field(spec, "unitAt").map { UnitStub(answers: entries($0), log: log) }
        switch (d, u) {
        case let (d?, u?): return BothStub(details: d, units: u)
        case let (d?, nil): return d
        case let (nil, u?): return u
        case (nil, nil): return NoCapabilities()
        }
    }
}
```

Then the calls:

```swift
let providerScenarioCalls: [String: ScenarioCall] = [
    "backfillMetadata": { q, a in
        let (stubs, now): (JSON, String) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let sleeps = SleepLog()
        let result = await backfillMetadata(q, resolve: stubResolver(stubs, log: log), now: { now }, sleep: { await sleeps.add($0) })
        return .object([
            "filled": .number(Double(result.filled)), "skipped": .number(Double(result.skipped)), "failed": .number(Double(result.failed)),
            "calls": .array(await log.calls.map(JSON.string)), "sleeps": .array(await sleeps.values.map(JSON.number)),
        ])
    },
    "syncSeriesUnit": { q, a in
        let (id, stubs): (String, JSON) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let changed = await syncSeriesUnit(q, seriesId: id, resolve: stubResolver(stubs, log: log))
        return .object(["changed": .bool(changed), "calls": .array(await log.calls.map(JSON.string))])
    },
    "syncUnitForEntry": { q, a in
        let (id, stubs): (String, JSON) = (try arg(a, 0), try arg(a, 1))
        let log = CallLog()
        let changed = await syncUnitForEntry(q, entryId: id, resolve: stubResolver(stubs, log: log))
        return .object(["changed": .bool(changed), "calls": .array(await log.calls.map(JSON.string))])
    },
]
```

Merge into `ScenarioTests.core`; add `testBackfill`, `testSync`. Run → compile errors.

- [ ] **Step 2: Ports**

`…/Persistence/BackfillMetadata.swift`:

```swift
import Foundation
import GRDB

public struct BackfillResult: Equatable, Sendable { public var filled = 0, skipped = 0, failed = 0 }

/// Minimum gap between two lookups against the same source (Metron ~20/min, two requests a row).
private let sourceGapMs: [String: Double] = ["metron": 3500, "anilist": 2000, "tmdb": 0, "google-books": 0]

public func isoNow() -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.string(from: Date())
}

/// Port of src/data/backfillMetadata.ts (A22/A26): matched rows without
/// metadata (or genres) get one paced lookup; a row is stamped when the
/// lookup answered, left for next launch when it failed. Reads and each write
/// are separate transactions — the network is never awaited inside a write.
public func backfillMetadata(
    _ writer: some DatabaseWriter,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?,
    now: @Sendable () -> String = isoNow,
    sleep: @Sendable (Double) async -> Void = { try? await Task.sleep(for: .milliseconds($0)) }
) async -> BackfillResult {
    struct Pending: Sendable { let table: String, id: String, category: Category, source: String, externalId: String }
    let pending: [Pending] = (try? await writer.read { db in
        func rows(_ table: String, _ sql: String) throws -> [Pending] {
            try Row.fetchAll(db, sql: sql).compactMap { r in
                guard let category = Category(rawValue: r["media_type"]) else { return nil }
                return Pending(table: table, id: r["id"], category: category, source: r["external_source"], externalId: r["external_id"])
            }
        }
        return try rows("series", """
            SELECT id, media_type, external_source, external_id FROM series
            WHERE external_source IS NOT NULL AND external_id IS NOT NULL
              AND (metadata_checked_at IS NULL OR genres_json IS NULL)
            """) + rows("entry", """
            SELECT id, media_type, external_source, external_id FROM entry
            WHERE series_id IS NULL AND external_source IS NOT NULL AND external_id IS NOT NULL
              AND (metadata_checked_at IS NULL OR genres_json IS NULL)
            """)
    }) ?? []

    var result = BackfillResult()
    var queried = Set<String>()
    for row in pending {
        guard let provider = resolve(row.source, row.category) as? any DetailsProvider else {
            let stamp = now()
            _ = try? await writer.write { db in
                try db.execute(sql: "UPDATE \(row.table) SET metadata_checked_at = COALESCE(metadata_checked_at, ?), genres_json = COALESCE(genres_json, '[]') WHERE id = ?",
                               arguments: [stamp, row.id])
            }
            result.skipped += 1
            continue
        }
        let gap = sourceGapMs[row.source] ?? 0
        if gap > 0 && queried.contains(row.source) { await sleep(gap) }
        queried.insert(row.source)
        guard let metadata = await provider.details(row.externalId) else {
            result.failed += 1
            continue
        }
        let stamp = now()
        _ = try? await writer.write { db in
            try db.execute(sql: """
                UPDATE \(row.table) SET
                  cover_url = COALESCE(cover_url, ?), creator = COALESCE(creator, ?), description = COALESCE(description, ?),
                  release_year = COALESCE(release_year, ?), metadata_checked_at = COALESCE(metadata_checked_at, ?),
                  genres_json = COALESCE(genres_json, ?)
                WHERE id = ?
                """, arguments: [metadata.coverUrl, metadata.creator, metadata.description, metadata.releaseYear, stamp,
                                 jsonText(metadata.genres ?? []), row.id])
        }
        result.filled += 1
    }
    return result
}
```

`…/Persistence/SyncSeriesUnit.swift`:

```swift
import GRDB

/// Port of src/data/syncSeriesUnit.ts (A25): after an advance, show the issue
/// now being read. Never fails the caller — network or lookup trouble is "no change".
public func syncSeriesUnit(
    _ writer: some DatabaseWriter, seriesId: String,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?
) async -> Bool {
    struct Snapshot: Sendable { let source: String, externalId: String, category: Category, unitLabel: UnitLabel, coverUrl: String?, children: [Entry] }
    guard let snap: Snapshot = try? await writer.read({ db -> Snapshot? in
        guard let s = try Row.fetchOne(db, sql: "SELECT * FROM series WHERE id = ?", arguments: [seriesId]),
              let source: String = s["external_source"], let externalId: String = s["external_id"],
              let category = Category(rawValue: s["media_type"]), let label = UnitLabel(rawValue: s["unit_label"]) else { return nil }
        let children = try Row.fetchAll(db, sql: "SELECT * FROM entry WHERE series_id = ?", arguments: [seriesId]).map(toEntry)
        return Snapshot(source: source, externalId: externalId, category: category, unitLabel: label, coverUrl: s["cover_url"], children: children)
    }) ?? nil else { return false } // hand-typed: never guessed at (A22)

    guard let provider = resolve(snap.source, snap.category) as? any UnitProvider else { return false }
    let ordered = byOrdinal(snap.children)
    guard let current = nextEntry(ordered) ?? ordered.last, let ordinal = current.ordinal else { return false }
    guard let unit = await provider.unitAt(snap.externalId, ordinal: ordinal) else { return false }

    let title = "\(unitTitle(snap.unitLabel)) \(unit.number)"
    let coverUrl = unit.coverUrl ?? snap.coverUrl
    if unit.externalId == snap.externalId && coverUrl == snap.coverUrl && title == current.title { return false }
    return (try? await writer.write { db in
        try atomically(db) {
            try db.execute(sql: "UPDATE series SET external_id = ?, cover_url = ? WHERE id = ?", arguments: [unit.externalId, coverUrl, seriesId])
            try db.execute(sql: "UPDATE entry SET title = ? WHERE id = ?", arguments: [title, current.id])
        }
        return true
    }) ?? false
}

/// A25: for the series an entry belongs to.
public func syncUnitForEntry(
    _ writer: some DatabaseWriter, entryId: String,
    resolve: @Sendable (String, Category) -> (any MetadataProvider)?
) async -> Bool {
    guard let seriesId = try? await writer.read({ try String.fetchOne($0, sql: "SELECT series_id FROM entry WHERE id = ?", arguments: [entryId]) }) ?? nil
    else { return false }
    return await syncSeriesUnit(writer, seriesId: seriesId, resolve: resolve)
}
```

(TS `syncSeriesUnit` lets a throwing `unitAt` propagate; Swift's `UnitProvider.unitAt` never throws, matching every real provider. Ledger.)

- [ ] **Step 3: Run, fix, commit** — all scenario areas (now seven) and all provider recordings green; `feat(iris-core): metadata backfill and Metron issue sync, held to TS by scenarios`.

---

### Task 8: App wiring, docs, merge

- [ ] **Step 1: Keys reach the bundle.** In `apple/project.yml`, target `Iris`, add:

```yaml
    info:
      path: Iris/Info.plist
      properties:
        TMDB_API_KEY: $(TMDB_API_KEY)
        GOOGLE_BOOKS_API_KEY: $(GOOGLE_BOOKS_API_KEY)
        METRON_USERNAME: $(METRON_USERNAME)
        METRON_PASSWORD: $(METRON_PASSWORD)
```

Add `/apple/Iris/Info.plist` to `.gitignore` (xcodegen generates it). Add a unit test in `apple/IrisTests` that `ProviderKeys.fromBundle(Bundle.main)` returns all-nil when `Secrets.xcconfig` is absent (the `$(…)` guard) — RED first by temporarily removing the guard.

- [ ] **Step 2: Verify** — `apple/scripts/test.sh`, `npm run typecheck`, `npx jest`.

- [ ] **Step 3: Docs** — HANDOFF ("I5 done": providers held to TS by N recordings in `shared/providers/`, backfill/sync scenarios; keys via Secrets.xcconfig; the open I4 decisions — DatabasePool, NUL, `Category` — still open for I7 to settle); DEVLOG entry; `shared/README.md` `## providers/` section (format, `env`, fake responses, requests recorded, coverage); `apple/README.md` rule ("Providers take an injected HTTPClient; tests never touch the network — they replay `shared/providers`"). Spec §8 I5 says "Recorded-response tests per provider" — no amendment needed (this is that, cross-platform). Commit.

- [ ] **Step 4: Final review, merge, push** — as I4.
