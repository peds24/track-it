# Completed-Series Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop asking the user to type an episode/issue/volume count or tick "ongoing" for a show, comic, or manga that a real catalogue match can answer itself — and show a show's progress as a season-segmented bar instead of one flat bar.

**Architecture:** Three provider modules (TMDB, Metron, and a new AniList provider) each learn to read a real ongoing/completed signal from their own API, not just a count. A confirm step in the Add screen fetches that data the moment a real result is picked, replacing the manual count/ongoing fields with a tap-to-edit summary. `Series` gains one additive, optional `seasons` field (TMDB only) that a new pure `src/domain/seasons.ts` module turns into segment fractions and a season-scoped label for the row.

**Tech Stack:** TypeScript, React Native (Expo SDK 57), `expo-sqlite`/`better-sqlite3` behind `SqlDriver`, Jest + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-08-12-track-it-design.md` (amendment **A11**)

## Global Constraints

- Node 22 is required for any `expo`/`npm` command (`source ~/.nvm/nvm.sh && nvm use 22` first) — unrelated to this plan's tests, which run under plain `npm test`, but note it if a step ever needs `expo`.
- `Entry` rows stay exactly as they are — flat, ordinal 1..N, progress always derived by counting `done` children (D3). Nothing in this plan adds a column, a status, or a query path to `entry`.
- Every new schema column is additive and nullable — a migration must never fail on, or change the meaning of, a row written before it.
- No provider's `hydrate()` may throw for a network failure it can reasonably anticipate on the *count/status* fetch specifically — TMDB and the new AniList provider fall back to the caller's guess; Metron's existing behaviour (propagates a hard failure from `this.get()`) is unchanged, matching its own precedent.
- `S`/`Ep` is the one deliberate abbreviation in the app's copy — confirmed with the user, scoped to the season-relative meta label only. Do not abbreviate anywhere else.

---

## Task 1: `SeasonBoundary` type and pure season math (`src/domain/seasons.ts`)

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/seasons.ts`
- Test: `src/domain/__tests__/seasons.test.ts`

**Interfaces:**
- Produces: `SeasonBoundary = { number: number; episodeCount: number }` (exported from `@/domain/types`); `SeasonSegment = { number: number; episodeCount: number; done: number }` and `CurrentSeason = { number: number; nextEpisode: number; episodeCount: number }` (exported from `@/domain/seasons`); `seasonSegments(seasons: readonly SeasonBoundary[], doneCount: number): SeasonSegment[]`; `currentSeason(seasons: readonly SeasonBoundary[], doneCount: number): CurrentSeason | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/__tests__/seasons.test.ts`:

```ts
import { currentSeason, seasonSegments } from '@/domain/seasons';
import type { SeasonBoundary } from '@/domain/types';

// House's real 8-season breakdown, specials excluded — 176 episodes total.
const HOUSE: SeasonBoundary[] = [
  { number: 1, episodeCount: 22 },
  { number: 2, episodeCount: 24 },
  { number: 3, episodeCount: 24 },
  { number: 4, episodeCount: 16 },
  { number: 5, episodeCount: 24 },
  { number: 6, episodeCount: 21 },
  { number: 7, episodeCount: 23 },
  { number: 8, episodeCount: 22 },
];

describe('seasonSegments', () => {
  test('splits a flat done-count across season boundaries in order', () => {
    const segments = seasonSegments(HOUSE, 60);
    expect(segments[0]).toEqual({ number: 1, episodeCount: 22, done: 22 });
    expect(segments[1]).toEqual({ number: 2, episodeCount: 24, done: 24 });
    expect(segments[2]).toEqual({ number: 3, episodeCount: 24, done: 14 });
    expect(segments[3]).toEqual({ number: 4, episodeCount: 16, done: 0 });
    expect(segments[7]).toEqual({ number: 8, episodeCount: 22, done: 0 });
  });

  test('a done-count of zero leaves every segment empty', () => {
    const segments = seasonSegments(HOUSE, 0);
    expect(segments.every((s) => s.done === 0)).toBe(true);
  });

  test('a done-count past the total fills every segment', () => {
    const segments = seasonSegments(HOUSE, 999);
    expect(segments.every((s) => s.done === s.episodeCount)).toBe(true);
  });

  test('an empty seasons list produces an empty result', () => {
    expect(seasonSegments([], 10)).toEqual([]);
  });
});

describe('currentSeason', () => {
  test('finds the season the next episode falls in, and its number within that season', () => {
    // 60 done overall: seasons 1-2 (46 eps) are full, season 3 has 14 done —
    // episode 15 of season 3 is next.
    expect(currentSeason(HOUSE, 60)).toEqual({ number: 3, nextEpisode: 15, episodeCount: 24 });
  });

  test('nothing done yet starts at season 1, episode 1', () => {
    expect(currentSeason(HOUSE, 0)).toEqual({ number: 1, nextEpisode: 1, episodeCount: 22 });
  });

  test('every season fully done returns null — nothing left to advance into', () => {
    expect(currentSeason(HOUSE, 176)).toBeNull();
  });

  test('an empty seasons list returns null', () => {
    expect(currentSeason([], 10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/domain/__tests__/seasons.test.ts`
Expected: FAIL — `Cannot find module '@/domain/seasons'`.

- [ ] **Step 3: Add `SeasonBoundary` to the domain types**

In `src/domain/types.ts`, add after the `Series` type (after line 31):

```ts
/**
 * A11: one TV season's episode count. Display metadata for the
 * season-segmented progress bar, populated only by TMDB — undefined for
 * every other category and for a series added before this existed. `Entry`
 * stays exactly as it is; this is never a new source of truth for progress
 * (D3 still holds).
 */
export type SeasonBoundary = { number: number; episodeCount: number };
```

And add the optional field to `Series` (the line right after `externalId: string | null;`):

```ts
export type Series = {
  id: string;
  title: string;
  mediaType: SeriesMediaType;
  unitLabel: UnitLabel;
  createdAt: string;
  /** A4: still being published, so it has no total and never reaches Done. */
  ongoing: boolean;
  /** A6: pulled into Backlog without touching any child's status (D3, D4). */
  paused: boolean;
  externalSource: string | null;
  externalId: string | null;
  /** A11: TMDB only. */
  seasons?: readonly SeasonBoundary[];
};
```

- [ ] **Step 4: Implement `src/domain/seasons.ts`**

```ts
import type { SeasonBoundary } from '@/domain/types';

export type SeasonSegment = { number: number; episodeCount: number; done: number };
export type CurrentSeason = { number: number; nextEpisode: number; episodeCount: number };

/**
 * Splits a flat done-count across season boundaries, in order — pure
 * display math for the segmented progress bar (A11). `Entry` rows stay
 * flat (D3); this only ever reads the count already derived from them, it
 * never reads or writes an entry itself.
 */
export function seasonSegments(
  seasons: readonly SeasonBoundary[],
  doneCount: number,
): SeasonSegment[] {
  let cursor = 0;
  return seasons.map((season) => {
    const done = Math.max(0, Math.min(season.episodeCount, doneCount - cursor));
    cursor += season.episodeCount;
    return { number: season.number, episodeCount: season.episodeCount, done };
  });
}

/**
 * The season the next episode falls in, and that episode's number *within*
 * the season — "S3 Ep 15 of 24" reads `nextEpisode`/`episodeCount` from
 * this, not the whole-series total. `null` once every season is fully done
 * — nothing left to advance into, the same "no bar when finished" rule the
 * flat count already follows.
 */
export function currentSeason(
  seasons: readonly SeasonBoundary[],
  doneCount: number,
): CurrentSeason | null {
  let cursor = 0;
  for (const season of seasons) {
    const doneInSeason = Math.max(0, Math.min(season.episodeCount, doneCount - cursor));
    if (doneInSeason < season.episodeCount) {
      return { number: season.number, nextEpisode: doneInSeason + 1, episodeCount: season.episodeCount };
    }
    cursor += season.episodeCount;
  }
  return null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/domain/__tests__/seasons.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/domain/types.ts src/domain/seasons.ts src/domain/__tests__/seasons.test.ts
git commit -m "feat: add SeasonBoundary type and pure season-segment math"
```

---

## Task 2: TMDB reads real `status`/season breakdown, not a guessed `ongoing`

**Files:**
- Modify: `src/providers/tmdb.ts`
- Modify: `src/providers/__tests__/tmdb.test.ts`

**Interfaces:**
- Consumes: `SeasonBoundary` from `@/domain/types` (Task 1).
- Produces: `seasonBreakdown(seasons: readonly TmdbSeason[]): SeasonBoundary[]` (new, exported for the same testability reason `sumEpisodeCount` already is). `SeriesDraft.seasons` now populated for a matched show (needs `SeriesDraft.seasons?: readonly SeasonBoundary[]` from `@/providers/types`, added in Task 4 below — this task can be implemented and tested independently since TypeScript allows assigning to an as-yet-wider type; Task 4 adds the field to the type declaration itself, so do that one first if strict extra-property checks complain — see Step 3 note).

- [ ] **Step 1: Write the failing/updated tests**

Replace the two tests `'hydrate for a real show match fetches seasons and replaces the guessed count'` and `'hydrate for an ongoing show does not override the ongoing behaviour with a season fetch'` in `src/providers/__tests__/tmdb.test.ts` with:

```ts
test('hydrate for a real, ended show fetches the season breakdown and a real episode total', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  const fetchMock = mockFetchSequence({
    body: {
      status: 'Ended',
      seasons: [
        { season_number: 0, episode_count: 1 },
        { season_number: 1, episode_count: 9 },
      ],
    },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: 2, // the user's guess — must be discarded in favour of the real total
  });

  expect(draft.entries).toHaveLength(9);
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Episode 1' });
  expect(draft.ongoing).toBe(false);
  expect(draft.seasons).toEqual([{ number: 1, episodeCount: 9 }]);
  expect(draft.externalSource).toBe('tmdb');
  expect(draft.externalId).toBe('111');
  const url = fetchMock.mock.calls[0]![0] as string;
  expect(url).toContain('/tv/111');
});

test('hydrate for a real, still-running show sets ongoing from TMDB status, not a guess', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  mockFetchSequence({
    body: {
      status: 'Returning Series',
      seasons: [{ season_number: 1, episode_count: 9 }],
    },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Severance',
    category: 'show',
    count: 2,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Episode 1' }]);
});

test('"Canceled" counts as ended, the same as "Ended"', async () => {
  process.env.EXPO_PUBLIC_TMDB_API_KEY = 'test-key';
  mockFetchSequence({
    body: { status: 'Canceled', seasons: [{ season_number: 1, episode_count: 4 }] },
  });

  const draft = await new TmdbProvider('show').hydrate({
    id: '111',
    title: 'Firefly',
    category: 'show',
    count: 1,
  });

  expect(draft.ongoing).toBe(false);
  expect(draft.entries).toHaveLength(4);
});
```

Also update `'hydrate falls back to the guessed count when the season fetch fails'` — no change needed to its body (it already asserts on a failed fetch, and a failed fetch still returns `detail === null`, keeping the caller's `count`), but add one assertion:

```ts
  expect(draft.entries).toHaveLength(3);
  expect(draft.seasons).toBeUndefined();
  // Still a real match, so still worth recording where it came from — only
  // the count fell back, not the whole hydrate.
  expect(draft.externalSource).toBe('tmdb');
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npm test -- src/providers/__tests__/tmdb.test.ts`
Expected: FAIL on the three new/changed tests (`draft.seasons` undefined vs expected array; `draft.ongoing` not `true` for "Returning Series", since current code still trusts `result.ongoing`).

- [ ] **Step 3: Implement in `src/providers/tmdb.ts`**

Replace the file's type declarations and `hydrate`/`fetchEpisodeTotal` with:

```ts
import type { Category, SeasonBoundary } from '@/domain/types';
import { generateEntries } from '@/providers/manual';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

type TmdbSearchHit = { id: number; title?: string; name?: string };
type TmdbSearchResponse = { results?: TmdbSearchHit[] };
type TmdbSeason = { season_number: number; episode_count?: number };
type TmdbShowDetail = { seasons?: TmdbSeason[]; status?: string };

/**
 * Season 0 is specials, not part of the main run — excluded from the sum.
 * Exported standalone so the summation itself is testable without mocking a
 * fetch. The schema has no seasons concept for `Entry` (D1): this is still a
 * flat count for "Episode 1".."Episode N", not a per-season structure.
 */
export function sumEpisodeCount(seasons: readonly TmdbSeason[]): number {
  return seasons
    .filter((s) => s.season_number !== 0)
    .reduce((sum, s) => sum + (s.episode_count ?? 0), 0);
}

/**
 * A11: the per-season breakdown `sumEpisodeCount` discards. Display
 * metadata for the segmented progress bar — `Series`/`SeriesDraft.seasons`,
 * never a new source of truth for progress.
 */
export function seasonBreakdown(seasons: readonly TmdbSeason[]): SeasonBoundary[] {
  return seasons
    .filter((s) => s.season_number !== 0)
    .map((s) => ({ number: s.season_number, episodeCount: s.episode_count ?? 0 }));
}

/**
 * TMDB, spanning `show` and `movie` (D5). No scan entry point calls this —
 * movies and shows have no retail barcodes — search is by title only. One
 * instance answers for exactly one category, fixed at construction, same
 * reasoning as `GoogleBooksProvider`.
 */
export class TmdbProvider implements MetadataProvider {
  readonly id = 'tmdb';

  constructor(private readonly category: Extract<Category, 'show' | 'movie'>) {}

  private endpoint(): 'tv' | 'movie' {
    return this.category === 'show' ? 'tv' : 'movie';
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) throw new Error('TMDB search needs EXPO_PUBLIC_TMDB_API_KEY');

    const url = `https://api.themoviedb.org/3/search/${this.endpoint()}?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB search failed: ${response.status}`);
    const body = (await response.json()) as TmdbSearchResponse;

    const titleOf = (hit: TmdbSearchHit): string | undefined =>
      this.category === 'show' ? hit.name : hit.title;

    return (body.results ?? [])
      .filter((hit): hit is TmdbSearchHit => typeof titleOf(hit) === 'string')
      .map((hit) => ({
        id: String(hit.id),
        title: titleOf(hit)!,
        category: this.category,
        count: 1,
      }));
  }

  /**
   * Movie is standalone (D1) — `addTrack` never calls this for one; the guard
   * below only matches `ManualProvider`'s for a caller that does anyway.
   *
   * A11: a matched show's `ongoing` is no longer trusted from the caller —
   * it comes straight from TMDB's own `status` field. The manual "ongoing"
   * toggle only still matters for an unmatched, hand-typed title (the early
   * return below), which never reaches this branch.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    const matched = result.id !== this.id;

    if (this.category !== 'show' || !matched) {
      const draft = generateEntries(result);
      return matched ? { ...draft, externalSource: this.id, externalId: result.id } : draft;
    }

    const detail = await this.fetchShowDetail(result.id);
    const draft = generateEntries(
      detail === null ? result : { ...result, count: detail.total ?? result.count, ongoing: detail.ongoing },
    );
    const withSeasons = detail && detail.seasons.length > 0 ? { ...draft, seasons: detail.seasons } : draft;
    return { ...withSeasons, externalSource: this.id, externalId: result.id };
  }

  /** Never throws — a failed or unconfigured lookup just falls back to the
   * count/ongoing the Add screen already collected, the same as no match at all. */
  private async fetchShowDetail(
    showId: string,
  ): Promise<{ total: number | null; ongoing: boolean; seasons: SeasonBoundary[] } | null> {
    const key = process.env.EXPO_PUBLIC_TMDB_API_KEY;
    if (!key) return null;
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/tv/${encodeURIComponent(showId)}?api_key=${encodeURIComponent(key)}`,
      );
      if (!response.ok) return null;
      const body = (await response.json()) as TmdbShowDetail;
      const seasons = body.seasons ?? [];
      const total = sumEpisodeCount(seasons);
      // "Ended"/"Canceled" both mean no more episodes are coming; anything
      // else ("Returning Series", "In Production", "Planned") means there is
      // a next one still to air.
      const ongoing = body.status !== 'Ended' && body.status !== 'Canceled';
      return { total: total > 0 ? total : null, ongoing, seasons: seasonBreakdown(seasons) };
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/providers/__tests__/tmdb.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: this will show an error until Task 4 adds `seasons` to `SeriesDraft` — if Task 4 has not run yet, do it now (it is a five-line type-only change with no test of its own; fold it in here rather than leaving the tree red). In `src/providers/types.ts`, add to the top import and to `SeriesDraft`:

```ts
import type { Category, SeasonBoundary, SeriesMediaType, UnitLabel } from '@/domain/types';
```

```ts
export type SeriesDraft = {
  title: string;
  mediaType: SeriesMediaType;
  unitLabel: UnitLabel;
  entries: EntryDraft[];
  /** A4: no known total; the list grows as you finish each entry. */
  ongoing?: boolean;
  externalSource?: string;
  externalId?: string;
  /** A11: TMDB only. */
  seasons?: readonly SeasonBoundary[];
};
```

Run `npm run typecheck` again.
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/providers/tmdb.ts src/providers/types.ts src/providers/__tests__/tmdb.test.ts
git commit -m "feat: TMDB reads real ongoing status and season breakdown"
```

---

## Task 3: Metron reads `year_end` for a real ongoing/completed signal

**Files:**
- Modify: `src/providers/metron.ts`
- Modify: `src/providers/__tests__/metron.test.ts`

**Interfaces:**
- Consumes: nothing new — this task only reads one more field off a response Metron already returns.
- Produces: no signature change to `MetronProvider`; `hydrate()`'s returned `SeriesDraft.ongoing` now reflects `year_end` instead of always being `undefined`/falsy.

- [ ] **Step 1: Update the failing tests**

In `src/providers/__tests__/metron.test.ts`, update the two existing hydrate-with-a-match tests to include `year_end` in their series-detail mock body (a real match on an ended series must stay ended once `year_end` starts being read), and add two new tests. Replace:

```ts
test('hydrate for a real match fetches the issue then its series for a real issue_count', async () => {
  setCreds();
  const fetchMock = mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66 } },
  );
```

with:

```ts
test('hydrate for a real match fetches the issue then its series for a real issue_count', async () => {
  setCreds();
  const fetchMock = mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: 2024 } },
  );
```

(the rest of that test is unchanged, plus one new assertion at the end: `expect(draft.ongoing).toBe(false);`).

Replace:

```ts
test('hydrate falls back to the given count when the series has no issue_count', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: {} },
  );
```

with:

```ts
test('hydrate falls back to the given count when the series has no issue_count', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { year_end: 2020 } },
  );
```

(unchanged assertions).

Add two new tests after them:

```ts
test('hydrate reads a null year_end as still-running — ongoing overrides issue_count', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: null } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 1,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toHaveLength(1);
});

test('hydrate reads a real year_end as completed', async () => {
  setCreds();
  mockFetchSequence(
    { body: { id: 50, series: { id: 15, name: 'Saga' } } },
    { body: { issue_count: 66, year_end: 2024 } },
  );

  const draft = await new MetronProvider().hydrate({
    id: '50',
    title: 'Saga (2012) #1',
    category: 'comic',
    count: 1,
  });

  expect(draft.ongoing).toBe(false);
  expect(draft.entries).toHaveLength(66);
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- src/providers/__tests__/metron.test.ts`
Expected: FAIL on the two new tests (`draft.ongoing` is `undefined`, not `true`/`false`).

- [ ] **Step 3: Implement in `src/providers/metron.ts`**

Change the type declaration:

```ts
type MetronSeriesDetail = { issue_count?: number; year_end?: number | null };
```

And `hydrate()`'s body — replace:

```ts
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.id === this.id) return generateEntries(result); // no real match — typed title.

    const issue = await this.get<MetronIssueDetail>(`/issue/${encodeURIComponent(result.id)}/`);
    const series = await this.get<MetronSeriesDetail>(
      `/series/${encodeURIComponent(String(issue.series.id))}/`,
    );
    const total = series.issue_count ?? 0;

    const draft = generateEntries({
      ...result,
      title: issue.series.name,
      count: total > 0 ? total : result.count,
    });
    return { ...draft, externalSource: this.id, externalId: result.id };
  }
```

with:

```ts
  /**
   * A matched issue names its series; the series endpoint gives a real issue
   * count (`issue_count`) and, per A11, a real ongoing signal — `year_end`
   * null means the series is still running, a real year means it ended.
   * Entries are still generated the `ManualProvider` way — numbered
   * "Issue 1".."Issue N" — just against that real total instead of a guess,
   * the same trade TMDB makes for a show.
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.id === this.id) return generateEntries(result); // no real match — typed title.

    const issue = await this.get<MetronIssueDetail>(`/issue/${encodeURIComponent(result.id)}/`);
    const series = await this.get<MetronSeriesDetail>(
      `/series/${encodeURIComponent(String(issue.series.id))}/`,
    );
    const total = series.issue_count ?? 0;
    const ongoing = series.year_end === null || series.year_end === undefined;

    const draft = generateEntries({
      ...result,
      title: issue.series.name,
      count: total > 0 ? total : result.count,
      ongoing,
    });
    return { ...draft, externalSource: this.id, externalId: result.id };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/providers/__tests__/metron.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/providers/metron.ts src/providers/__tests__/metron.test.ts
git commit -m "feat: Metron reads year_end for a real ongoing/completed signal"
```

---

## Task 4: New AniList provider for manga

**Files:**
- Create: `src/providers/anilist.ts`
- Test: `src/providers/__tests__/anilist.test.ts`

**Interfaces:**
- Consumes: `MetadataProvider`, `SearchResult`, `SeriesDraft` from `@/providers/types` (unchanged interface — `SeriesDraft.seasons` from Task 2 is simply never set here, manga has no season equivalent); `generateEntries` from `@/providers/manual`.
- Produces: `export class AnilistProvider implements MetadataProvider { readonly id = 'anilist'; search(query): Promise<SearchResult[]>; hydrate(result): Promise<SeriesDraft>; }`.

- [ ] **Step 1: Write the failing tests**

Create `src/providers/__tests__/anilist.test.ts`:

```ts
import { AnilistProvider } from '@/providers/anilist';

function mockFetchSequence(...responses: { body: unknown; ok?: boolean }[]): jest.Mock {
  const fn = jest.fn();
  for (const { body, ok = true } of responses) {
    fn.mockResolvedValueOnce({ ok, status: ok ? 200 : 500, json: async () => body });
  }
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('search posts a GraphQL query and maps hits to SearchResult, tagged manga', async () => {
  const fetchMock = mockFetchSequence({
    body: { data: { Page: { media: [{ id: 30001, title: { romaji: 'MONSTER', english: 'Monster' } } ] } } },
  });

  const results = await new AnilistProvider().search('Monster');

  expect(results).toEqual([{ id: '30001', title: 'Monster', category: 'manga', count: 1 }]);
  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  expect(init.method).toBe('POST');
  const parsedBody = JSON.parse(init.body as string) as { variables: { search: string } };
  expect(parsedBody.variables.search).toBe('Monster');
});

test('search falls back to the romaji title when there is no english one', async () => {
  mockFetchSequence({
    body: { data: { Page: { media: [{ id: 1, title: { romaji: 'Only Romaji' } }] } } },
  });
  const results = await new AnilistProvider().search('x');
  expect(results[0]!.title).toBe('Only Romaji');
});

test('search on a blank query never calls the network', async () => {
  const fetchMock = mockFetchSequence({ body: {} });
  await new AnilistProvider().search('   ');
  expect(fetchMock).not.toHaveBeenCalled();
});

test('hydrate for a real match reads volumes and a FINISHED status as completed', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: 18, chapters: 162, status: 'FINISHED' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '30001',
    title: 'Monster',
    category: 'manga',
    count: 1, // the user's guess — must be discarded in favour of the real total
  });

  expect(draft.entries).toHaveLength(18);
  expect(draft.entries[0]).toEqual({ ordinal: 1, title: 'Volume 1' });
  expect(draft.ongoing).toBe(false);
  expect(draft.externalSource).toBe('anilist');
  expect(draft.externalId).toBe('30001');
});

test('hydrate falls back to chapters when a manga has no separate volume count', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: null, chapters: 42, status: 'FINISHED' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '1',
    title: 'One-shot-ish',
    category: 'manga',
    count: 1,
  });

  expect(draft.entries).toHaveLength(42);
});

test('hydrate reads RELEASING as ongoing, ignoring whatever count came back', async () => {
  mockFetchSequence({
    body: { data: { Media: { volumes: 12, chapters: 100, status: 'RELEASING' } } },
  });

  const draft = await new AnilistProvider().hydrate({
    id: '2',
    title: 'One Piece',
    category: 'manga',
    count: 1,
  });

  expect(draft.ongoing).toBe(true);
  expect(draft.entries).toEqual([{ ordinal: 1, title: 'Volume 1' }]);
});

test('hydrate for an unmatched (hand-typed) title never calls the network', async () => {
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  const draft = await new AnilistProvider().hydrate({
    id: 'anilist', // the sentinel addTrack.ts uses for an unmatched title
    title: 'Some Manga',
    category: 'manga',
    count: 5,
  });

  expect(draft.entries).toHaveLength(5);
  expect(draft.externalSource).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/providers/__tests__/anilist.test.ts`
Expected: FAIL — `Cannot find module '@/providers/anilist'`.

- [ ] **Step 3: Implement `src/providers/anilist.ts`**

```ts
import { generateEntries } from '@/providers/manual';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

const ENDPOINT = 'https://graphql.anilist.co';

const SEARCH_QUERY = `
  query ($search: String) {
    Page(perPage: 10) {
      media(search: $search, type: MANGA) {
        id
        title { romaji english }
      }
    }
  }
`;

const DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      volumes
      chapters
      status
    }
  }
`;

type AnilistSearchHit = { id: number; title: { romaji?: string; english?: string } };
type AnilistSearchResponse = { data?: { Page?: { media?: AnilistSearchHit[] } } };
type AnilistDetail = { volumes?: number | null; chapters?: number | null; status?: string };
type AnilistDetailResponse = { data?: { Media?: AnilistDetail } };

/**
 * AniList — manga only (A11), replacing Google Books for that one category
 * (Google Books can never answer "how many volumes" from a single-book hit —
 * confirmed in `googleBooks.ts`). Keyless GraphQL, no rate-limit key to
 * manage.
 *
 * Tracks the *work*, not the printing: a search for "Monster" resolves to
 * the original 18-volume/162-chapter release, not a specific omnibus
 * reprint like "The Perfect Edition" — no API disambiguates which physical
 * edition a user owns. This is exactly why the Add screen's confirm step
 * exists, not a gap this provider needs to paper over.
 */
export class AnilistProvider implements MetadataProvider {
  readonly id = 'anilist';

  private async post<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`AniList request failed: ${response.status}`);
    return (await response.json()) as T;
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const body = await this.post<AnilistSearchResponse>(SEARCH_QUERY, { search: trimmed });
    const hits = body.data?.Page?.media ?? [];
    const titleOf = (hit: AnilistSearchHit): string | undefined => hit.title.english ?? hit.title.romaji;

    return hits
      .filter((hit): hit is AnilistSearchHit => typeof titleOf(hit) === 'string')
      .map((hit) => ({ id: String(hit.id), title: titleOf(hit)!, category: 'manga' as const, count: 1 }));
  }

  /**
   * A real match reads `volumes` (falling back to `chapters` when a manga
   * has no separate volume count) and `status` for ongoing/completed — the
   * same "real total instead of a guess" trade TMDB and Metron make. Unlike
   * TMDB's count fetch, a network failure here propagates rather than
   * falling back silently, matching Metron's own precedent (`get()` is
   * never wrapped in a try/catch either).
   */
  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.id === this.id) return generateEntries(result); // no real match — typed title.

    const body = await this.post<AnilistDetailResponse>(DETAIL_QUERY, { id: Number(result.id) });
    const media = body.data?.Media;
    const ongoing = media?.status === 'RELEASING' || media?.status === 'NOT_YET_RELEASED';
    const total = media?.volumes ?? media?.chapters ?? null;

    const draft = generateEntries({
      ...result,
      count: !ongoing && total && total > 0 ? total : result.count,
      ongoing,
    });
    return { ...draft, externalSource: this.id, externalId: result.id };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/providers/__tests__/anilist.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/providers/anilist.ts src/providers/__tests__/anilist.test.ts
git commit -m "feat: add AniList provider for real manga volume/status data"
```

---

## Task 5: Registry — manga resolves to AniList, not Google Books

**Files:**
- Modify: `src/providers/registry.ts`
- Modify: `src/providers/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: `AnilistProvider` (Task 4).
- Produces: `providerFor('manga')` now returns an `AnilistProvider` instance; `providerFor('book')` unchanged.

- [ ] **Step 1: Update the failing tests**

In `src/providers/__tests__/registry.test.ts`, replace:

```ts
test('book and manga resolve to Google Books', () => {
  expect(providerFor('book')).toBeInstanceOf(GoogleBooksProvider);
  expect(providerFor('manga')).toBeInstanceOf(GoogleBooksProvider);
});
```

with:

```ts
test('book resolves to Google Books', () => {
  expect(providerFor('book')).toBeInstanceOf(GoogleBooksProvider);
});

// A11: manga needs a real volume total, which a single Google Books hit can
// never supply — AniList replaces it for this one category.
test('manga resolves to AniList', () => {
  expect(providerFor('manga')).toBeInstanceOf(AnilistProvider);
});
```

and add the import at the top:

```ts
import { AnilistProvider } from '@/providers/anilist';
```

The `'registering a category does not change what any other category resolves to'` test's `expect(providerFor('book')).not.toBe(providerFor('manga'))` line still holds (different classes entirely now, still not the same instance) — no change needed there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/providers/__tests__/registry.test.ts`
Expected: FAIL — `providerFor('manga')` is still a `GoogleBooksProvider`.

- [ ] **Step 3: Implement in `src/providers/registry.ts`**

```ts
import type { Category } from '@/domain/types';
import { AnilistProvider } from '@/providers/anilist';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { ManualProvider } from '@/providers/manual';
import { MetronProvider } from '@/providers/metron';
import { TmdbProvider } from '@/providers/tmdb';
import type { MetadataProvider } from '@/providers/types';

const manual = new ManualProvider();

/**
 * Resolution is per category (D10), never global. Registering a catalogue
 * provider for one category touches no other path (A9 fulfils D5; A11 swaps
 * manga to AniList): Google Books answers `book` alone now — a single hit
 * can never reveal a manga series' total volume count, which is exactly
 * what AniList (manga) and Metron (comic) can. TMDB answers `show`/`movie`.
 * A category with no registered provider — none currently, kept only as a
 * safety net — still falls back to `ManualProvider`, and so does any
 * provider call that turns out to have no real catalogue match.
 */
const REGISTRY: Partial<Record<Category, MetadataProvider>> = {
  book: new GoogleBooksProvider('book'),
  manga: new AnilistProvider(),
  comic: new MetronProvider(),
  show: new TmdbProvider('show'),
  movie: new TmdbProvider('movie'),
};

export function providerFor(category: Category): MetadataProvider {
  return REGISTRY[category] ?? manual;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/providers/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite to check for fallout**

Run: `npm test`
Expected: any test elsewhere that asserted `manga` uses `GoogleBooksProvider` (e.g. `googleBooks.test.ts` tests the class directly, not the registry, so should be unaffected) now passes. If anything else fails, read the failure — it is almost certainly a leftover assumption about manga's provider identity and should be updated the same way `registry.test.ts` was.

- [ ] **Step 6: Commit**

```bash
git add src/providers/registry.ts src/providers/__tests__/registry.test.ts
git commit -m "feat: manga resolves to AniList instead of Google Books"
```

---

## Task 6: Schema migration — `series.seasons_json`

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `series` table gains a nullable `seasons_json TEXT` column, migrated additively (existing rows get `NULL`).

- [ ] **Step 1: Write the failing test**

Add to `src/db/__tests__/schema.test.ts`:

```ts
test('the series table has a seasons_json column, nullable for a pre-existing row (A11)', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await db.run(
    `INSERT INTO series (id, title, media_type, unit_label, created_at)
     VALUES ('s1', 'Berserk', 'manga', 'volume', '2026-08-12')`,
  );
  const rows = await db.all<{ seasons_json: string | null }>(
    'SELECT seasons_json FROM series WHERE id = ?',
    ['s1'],
  );
  expect(rows[0]!.seasons_json).toBeNull();

  await db.run('UPDATE series SET seasons_json = ? WHERE id = ?', [
    JSON.stringify([{ number: 1, episodeCount: 22 }]),
    's1',
  ]);
  const updated = await db.all<{ seasons_json: string | null }>(
    'SELECT seasons_json FROM series WHERE id = ?',
    ['s1'],
  );
  expect(JSON.parse(updated[0]!.seasons_json!)).toEqual([{ number: 1, episodeCount: 22 }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/db/__tests__/schema.test.ts`
Expected: FAIL — `no such column: seasons_json`.

- [ ] **Step 3: Add the migration in `src/db/schema.ts`**

Append to the `MIGRATIONS` array, after the A9 migration (after the closing backtick that follows `ALTER TABLE entry ADD COLUMN external_id TEXT;`):

```ts
  // A11: TMDB's per-season episode_count breakdown, stored only for a show
  // matched through TMDB — display metadata for the segmented progress bar,
  // never a new source of truth for progress (D3 still holds; `entry` stays
  // untouched). NULL for every other category and every row that predates
  // this migration.
  `
  ALTER TABLE series ADD COLUMN seasons_json TEXT;
  `,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/db/__tests__/schema.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/__tests__/schema.test.ts
git commit -m "feat: add series.seasons_json migration"
```

---

## Task 7: `trackRepo` persists and reads `seasons`

**Files:**
- Modify: `src/data/trackRepo.ts`
- Modify: `src/data/__tests__/trackRepo.test.ts`

**Interfaces:**
- Consumes: `SeasonBoundary` from `@/domain/types` (Task 1); `series.seasons_json` column (Task 6); `SeriesDraft.seasons` (Task 2).
- Produces: `TrackSummary.seasons: readonly SeasonBoundary[] | null | undefined` (optional — see note below); `createSeriesTrack` writes `draft.seasons` into `seasons_json`; `listTracks` parses it back out.

- [ ] **Step 1: Write the failing tests**

Add to `src/data/__tests__/trackRepo.test.ts`:

```ts
test('createSeriesTrack persists a draft\'s seasons, and listTracks reads them back', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'House',
      mediaType: 'show',
      unitLabel: 'episode',
      entries: [{ ordinal: 1, title: 'Episode 1' }, { ordinal: 2, title: 'Episode 2' }],
      seasons: [{ number: 1, episodeCount: 2 }],
    },
    NOW,
  );

  const [track] = await listTracks(db, 'backlog');
  expect(track!.seasons).toEqual([{ number: 1, episodeCount: 2 }]);
});

test('a series created without season data reports seasons as null', async () => {
  const db = await freshDb();
  await createSeriesTrack(
    db,
    {
      title: 'Berserk',
      mediaType: 'manga',
      unitLabel: 'volume',
      entries: [{ ordinal: 1, title: 'Volume 1' }],
    },
    NOW,
  );

  const [track] = await listTracks(db, 'backlog');
  expect(track!.seasons).toBeNull();
});
```

Both new tests use this file's own existing `NOW` constant and `freshDb()` helper (`src/data/__tests__/trackRepo.test.ts:8-14`) — `const NOW = '2026-08-12T10:00:00.000Z';` and `async function freshDb(): Promise<SqlDriver> { const db = createMemoryDriver(); await migrate(db); return db; }` — already defined at the top of the file, exactly as used by every other test in it. Do not import `freshDb` from `addTrack.test.ts`; this file has its own.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/data/__tests__/trackRepo.test.ts`
Expected: FAIL — `track!.seasons` is `undefined`, not the expected array/`null`.

- [ ] **Step 3: Implement in `src/data/trackRepo.ts`**

Add the import:

```ts
import type { Category, Entry, SeasonBoundary, Series, Shelf, Status } from '@/domain/types';
```

Add `seasons` to `TrackSummary` (after `paused: boolean;`):

```ts
  /** A11: TMDB only. `null` for every other category and for a show added
   * before this existed. */
  seasons: readonly SeasonBoundary[] | null;
```

Add `seasons_json` to `SeriesRow`:

```ts
type SeriesRow = {
  id: string;
  title: string;
  media_type: Series['mediaType'];
  unit_label: Series['unitLabel'];
  ongoing: number;
  paused: number;
  created_at: string;
  external_source: string | null;
  external_id: string | null;
  seasons_json: string | null;
};
```

In `createSeriesTrack`, change the `INSERT INTO series` call to:

```ts
    await db.run(
      `INSERT INTO series (id, title, media_type, unit_label, created_at, ongoing, external_source, external_id, seasons_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seriesId,
        draft.title,
        draft.mediaType,
        draft.unitLabel,
        now,
        draft.ongoing === true ? 1 : 0,
        draft.externalSource ?? null,
        draft.externalId ?? null,
        draft.seasons ? JSON.stringify(draft.seasons) : null,
      ],
    );
```

In `listTracks`, the series-summary `summaries.push({ ... })` call gains one field (after `paused: row.paused === 1,`):

```ts
      seasons: row.seasons_json ? (JSON.parse(row.seasons_json) as SeasonBoundary[]) : null,
```

And the standalone-entry `summaries.push({ ... })` call gains (after `paused: entry.paused,`):

```ts
      seasons: null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/data/__tests__/trackRepo.test.ts`
Expected: PASS, all tests. If any pre-existing test in this file builds a `TrackSummary` by hand (rather than through `listTracks`) and now fails a type check for a missing `seasons` field, that test is constructing the type directly — leave those alone, `TrackSummary` construction there is either through `listTracks` (fixed above) or not applicable; if TypeScript complains about a hand-built object literal missing `seasons`, add `seasons: null` to it.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/trackRepo.ts src/data/__tests__/trackRepo.test.ts
git commit -m "feat: trackRepo persists and reads a series' season breakdown"
```

---

## Task 8: `addTrack` accepts a pre-hydrated draft, skipping a second `hydrate()`

**Files:**
- Modify: `src/data/addTrack.ts`
- Modify: `src/ui/__tests__/addTrack.test.ts`

**Interfaces:**
- Consumes: `SeriesDraft` from `@/providers/types`.
- Produces: `addTrack(db, input: { ...; draft?: SeriesDraft }, now)` — when `input.draft` is given, it is used directly and `provider.hydrate()` is never called for that call.

- [ ] **Step 1: Write the failing test**

Add to `src/ui/__tests__/addTrack.test.ts`:

```ts
// A11: the Add screen's confirm step already hydrated and showed this exact
// draft to the user — addTrack must use it as-is, not fetch again.
test('a pre-hydrated draft passed in is used directly, without a second hydrate call', async () => {
  const db = await freshDb();
  const fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;

  await addTrack(
    db,
    {
      title: 'House',
      category: 'show',
      count: 999, // must be ignored — the draft is authoritative
      match: { id: '1408', title: 'House', category: 'show', count: 1 },
      draft: {
        title: 'House',
        mediaType: 'show',
        unitLabel: 'episode',
        entries: [{ ordinal: 1, title: 'Episode 1' }, { ordinal: 2, title: 'Episode 2' }],
        externalSource: 'tmdb',
        externalId: '1408',
      },
    },
    NOW,
  );

  expect(fetchMock).not.toHaveBeenCalled();
  const [track] = await listTracks(db, 'backlog');
  expect(track!.progress).toEqual({ done: 0, total: 2 });

  const rows = await db.all<{ external_source: string | null; external_id: string | null }>(
    'SELECT external_source, external_id FROM series',
  );
  expect(rows).toEqual([{ external_source: 'tmdb', external_id: '1408' }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/ui/__tests__/addTrack.test.ts`
Expected: FAIL — TypeScript rejects the unknown `draft` property on `addTrack`'s input (or, if that is loose enough to pass typecheck, the test itself fails a runtime assertion because `addTrack` still ignores `input.draft` and calls `provider.hydrate`, which throws since `fetchMock` returns `undefined`).

- [ ] **Step 3: Implement in `src/data/addTrack.ts`**

Add `draft` to the input type (after `startAtOrdinal?: number;`):

```ts
    /**
     * A11: a draft the caller already hydrated and had the user confirm (or
     * override) — used exactly as given, with no second `hydrate()` call.
     * Only meaningful for a series category; ignored for a standalone one.
     */
    draft?: SeriesDraft;
```

And change the two lines right before the `createSeriesTrack` call:

```ts
  const result: SearchResult = input.match
    ? { ...input.match, title, count: input.count, ongoing: input.ongoing === true }
    : { id: provider.id, title, category: input.category, count: input.count, ongoing: input.ongoing === true };
  const draft = input.draft ?? (await provider.hydrate(result));

  const id = await createSeriesTrack(db, draft, now, input.startAtOrdinal);
  return { kind: 'series', id };
```

(only the `const draft = ...` line actually changes — the surrounding lines are shown for context, do not duplicate them).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/ui/__tests__/addTrack.test.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/data/addTrack.ts src/ui/__tests__/addTrack.test.ts
git commit -m "feat: addTrack accepts a pre-hydrated draft"
```

---

## Task 9: `TrackRow` — season-segmented bar and `S{n} Ep {m} of {total}` label

**Files:**
- Modify: `src/ui/TrackRow.tsx`
- Modify: `src/ui/__tests__/TrackRow.test.tsx`

**Interfaces:**
- Consumes: `currentSeason`, `seasonSegments` from `@/domain/seasons` (Task 1); `TrackSummary.seasons` (Task 7).
- Produces: `export function seasonPositionLabel(track: TrackSummary): string | null` (new, exported alongside `positionLabel` for the same reason `positionLabel` already is — direct unit testing without rendering).

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/__tests__/TrackRow.test.tsx`, after the existing tests. First, a shared fixture near the top of the file (below the existing `show` fixture):

```ts
const HOUSE_SEASONS = [
  { number: 1, episodeCount: 22 },
  { number: 2, episodeCount: 24 },
  { number: 3, episodeCount: 24 },
];

const houseWithSeasons: TrackSummary = {
  ...show,
  title: 'House',
  progress: { done: 37, total: 70 },
  seasons: HOUSE_SEASONS,
};
```

Then the tests:

```ts
test('a show with season data shows the season-scoped label instead of "Next Episode"/"Watching"', async () => {
  // 37 done: season 1 (22) full, season 2 has 15 done — episode 16 of
  // season 2 is next.
  await render(<TrackRow track={houseWithSeasons} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('S2 Ep 16 of 24')).toBeTruthy();
  expect(screen.queryByText(/Watching/)).toBeNull();
  expect(screen.queryByText(/^Next /)).toBeNull();
});

test('a show with season data draws one segment per season', async () => {
  await render(<TrackRow track={houseWithSeasons} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getAllByTestId('progress-segment')).toHaveLength(3);
});

test('a show with no season data keeps the flat bar and the default "Watching" label', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Watching Episode 4')).toBeTruthy();
  expect(screen.queryAllByTestId('progress-segment')).toHaveLength(0);
  expect(screen.getByTestId('progress-track')).toBeTruthy();
});

test('a show on Backlog with season data still uses the flat bar, not segments', async () => {
  const backlogged: TrackSummary = {
    ...houseWithSeasons,
    shelf: 'backlog',
    paused: true,
  };
  await render(<TrackRow track={backlogged} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.queryAllByTestId('progress-segment')).toHaveLength(0);
  expect(screen.queryByText(/^S\d/)).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/ui/__tests__/TrackRow.test.tsx`
Expected: FAIL on the three new season-related tests (`houseWithSeasons` will also fail a TypeScript check on the missing `seasons` field until Task 7's `TrackSummary.seasons` lands — Task 7 must run before this one).

- [ ] **Step 3: Implement in `src/ui/TrackRow.tsx`**

Add the import:

```ts
import { currentSeason, seasonSegments } from '@/domain/seasons';
```

Add a new exported function, right after `positionLabel` (before `export function TrackRow`):

```ts
/**
 * A11: replaces the whole-series `positionLabel` when a show has season
 * data and is actively being watched — "S3 Ep 15 of 24" instead of
 * "Watching Episode 61". Scoped to the Currently shelf specifically: a
 * not-yet-started or paused show keeps its existing "Not started"/"Paused"
 * wording, which a season fraction would misrepresent.
 */
export function seasonPositionLabel(track: TrackSummary): string | null {
  if (track.shelf !== 'currently' || !track.seasons || track.seasons.length === 0 || !track.progress) {
    return null;
  }
  const current = currentSeason(track.seasons, track.progress.done);
  if (!current) return null;
  return `S${current.number} Ep ${current.nextEpisode} of ${current.episodeCount}`;
}
```

Inside the `TrackRow` component, after the `fraction` computation, add:

```ts
  // A11: segmented only while actively watching, mirroring seasonPositionLabel's
  // own scoping — a paused or not-yet-started show keeps the flat bar.
  const segments =
    track.shelf === 'currently' && track.seasons && track.seasons.length > 0 && track.progress
      ? seasonSegments(track.seasons, track.progress.done)
      : null;
```

Replace the `positionLabel(track)` call in the JSX with:

```tsx
          <Text style={styles.position} numberOfLines={1}>
            {seasonPositionLabel(track) ?? positionLabel(track)}
          </Text>
```

Replace the progress-bar block:

```tsx
        {fraction !== null && (
          <View style={styles.progressTrack} testID="progress-track">
            <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
          </View>
        )}
```

with:

```tsx
        {fraction !== null && (
          <View
            style={[styles.progressTrack, segments && styles.progressTrackSegmented]}
            testID="progress-track"
          >
            {segments ? (
              segments.map((seg) => (
                <View key={seg.number} style={[styles.segment, { flex: seg.episodeCount || 1 }]} testID="progress-segment">
                  <View
                    style={[
                      styles.progressFill,
                      { width: seg.episodeCount > 0 ? `${(seg.done / seg.episodeCount) * 100}%` : '0%' },
                    ]}
                  />
                </View>
              ))
            ) : (
              <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
            )}
          </View>
        )}
```

Add two new style entries to `createStyles`, right after `progressTrack`/`progressFill`:

```ts
    // A11: hairline gaps between season segments read as dividers — the
    // container's own rule-coloured background (used for the flat bar) is
    // switched off here so the gap shows the row's background instead.
    progressTrackSegmented: { backgroundColor: 'transparent', flexDirection: 'row', gap: 1.5 },
    segment: { height: '100%', backgroundColor: c.rule, overflow: 'hidden' },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/ui/__tests__/TrackRow.test.tsx`
Expected: PASS, all tests (existing and new).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/ui/TrackRow.tsx src/ui/__tests__/TrackRow.test.tsx
git commit -m "feat: TrackRow draws a season-segmented bar and S-Ep label"
```

---

## Task 10: Add screen — confirm step replaces manual fields on a real match

**Files:**
- Modify: `app/add.tsx`

**Interfaces:**
- Consumes: `providerFor(category).hydrate(picked)` (existing method, now called from the Add screen itself); `SeriesDraft` type from `@/providers/types`.
- Produces: new component state (`confirmedDraft`, `hydrating`) and a `showManualFields` derived boolean; no exported API change (this is a screen, not a module others import from).

This task has no automated test — `add.tsx` follows this codebase's existing convention of no direct RNTL coverage for screen-level components (noted explicitly in A9's "Deferred" list). Verify by reading the screen (Step 4) and, if the app is run manually elsewhere in this project's normal workflow, by exercising the flow — but do not add a test file where the convention has none.

- [ ] **Step 1: Add imports and state**

In `app/add.tsx`, change the type-only import line:

```ts
import type { SearchResult } from '@/providers/types';
```

to:

```ts
import type { SearchResult, SeriesDraft } from '@/providers/types';
```

Add three new state declarations, right after `const [picked, setPicked] = useState<SearchResult | null>(null);`:

```ts
  // A11: a real series match is confirmed before it's saved, not silently
  // applied. `confirmedDraft` is the fetched summary shown in place of the
  // manual count/ongoing fields; `editingCount` reopens those same fields
  // as an override for the rare wrong-edition match.
  const [confirmedDraft, setConfirmedDraft] = useState<SeriesDraft | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [editingCount, setEditingCount] = useState(false);
```

- [ ] **Step 2: Fetch a draft the moment a series match is picked**

Add a new `useEffect`, right after the existing search-debounce `useEffect` (after its closing `}, [title, category, picked]);`):

```ts
  // A11: the confirm step's data source — runs once per pick, not once per
  // keystroke like search does. Cancelled the same way search cancels a
  // stale request if the user picks something else, or types past the pick,
  // before this resolves.
  useEffect(() => {
    if (!category || !picked || !isSeries) {
      setConfirmedDraft(null);
      setHydrating(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    setConfirmedDraft(null);
    void (async () => {
      try {
        const draft = await providerFor(category).hydrate(picked);
        if (!cancelled) setConfirmedDraft(draft);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, picked, isSeries]);
```

- [ ] **Step 3: Reset the new state everywhere the old state already resets**

In `pick()`, add `setEditingCount(false);`:

```ts
  function pick(result: SearchResult): void {
    setTitle(result.title);
    setPicked(result);
    setEditingCount(false);
    setResults([]);
  }
```

In the title `TextInput`'s `onChangeText`, add `setEditingCount(false);`:

```tsx
        onChangeText={(t) => {
          setTitle(t);
          setPicked(null);
          setEditingCount(false);
        }}
```

In the `beforeRemove` navigation-guard effect, add the three resets alongside the existing ones (inside the `e.preventDefault(); ...` block):

```ts
      setConfirmedDraft(null);
      setHydrating(false);
      setEditingCount(false);
```

- [ ] **Step 4: Replace the manual-fields gating and render the confirm summary**

Replace the line:

```ts
  const isSeries = category !== null && unitLabelFor(category) !== null;
  const needsCount = isSeries && !ongoing;
```

with:

```ts
  const isSeries = category !== null && unitLabelFor(category) !== null;
  // A11: manual fields render only when there's no confirmed match to trust
  // instead — a hand-typed title, or an explicit override of a wrong one.
  const showManualFields = isSeries && (!picked || editingCount);
  const needsCount = showManualFields && !ongoing;
```

Replace the two conditionally-rendered blocks (the count `TextInput` and the ongoing `Pressable`) with:

```tsx
      {isSeries && picked && hydrating && <Text style={styles.hint}>Checking…</Text>}

      {isSeries && picked && confirmedDraft && !editingCount && (
        <Pressable
          onPress={() => {
            setEditingCount(true);
            setCount(String(confirmedDraft.entries.length));
            setOngoing(confirmedDraft.ongoing === true);
          }}
          style={styles.summary}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${unit} count`}
        >
          <Text style={styles.summaryText}>
            {confirmedDraft.ongoing
              ? 'Ongoing'
              : `${confirmedDraft.entries.length} ${unit}s · Completed`}
          </Text>
        </Pressable>
      )}

      {showManualFields && needsCount && (
        <TextInput
          style={styles.input}
          placeholder={`How many ${unit}s?`}
          placeholderTextColor={palette.faint}
          accessibilityLabel="Count"
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
          cursorColor={palette.ink}
          selectionColor={palette.ink}
          underlineColorAndroid="transparent"
        />
      )}

      {/* A4: a series still being published has no count to give. Reusing the
          filter-chip shape rather than a switch keeps the screen to one idiom. */}
      {showManualFields && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ongoing }}
          accessibilityLabel="Ongoing series"
          onPress={() => setOngoing((v) => !v)}
          style={[styles.toggle, ongoing && styles.toggleOn]}
        >
          <Text style={[styles.toggleText, ongoing && styles.toggleTextOn]}>
            Ongoing series
          </Text>
        </Pressable>
      )}
```

- [ ] **Step 5: Add the two new styles**

In `createStyles`, add after the `toggleTextOn` entry:

```ts
    hint: { ...font.meta, color: c.muted, marginHorizontal: layout.inset, marginBottom: 10 },
    summary: {
      marginHorizontal: layout.inset,
      marginBottom: 10,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
    },
    summaryText: { ...font.body, color: c.ink },
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/add.tsx
git commit -m "feat: Add screen confirms a real match instead of collecting a manual count"
```

---

## Task 11: Add screen — save uses the confirmed or overridden draft

**Files:**
- Modify: `app/add.tsx`

**Interfaces:**
- Consumes: `generateEntries` from `@/providers/manual` (already used elsewhere in this codebase; new to this file); `addTrack`'s `draft` parameter (Task 8).

No automated test, same reasoning as Task 10.

- [ ] **Step 1: Import `generateEntries`**

Change:

```ts
import { unitLabelFor } from '@/providers/manual';
```

to:

```ts
import { generateEntries, unitLabelFor } from '@/providers/manual';
```

- [ ] **Step 2: Build the final draft in `handleSave`, and pass it through**

Inside `handleSave`, right after the existing `const { title: finalTitle, ordinal } = ...` block and before `const created = await addTrack(...)`, insert:

```ts
      // A11: an un-edited confirmed match is passed straight through as a
      // ready draft — no second hydrate, no manual count to validate. An
      // edited override rebuilds the draft locally the same way a
      // hand-typed title always has, keeping the confirmed match's own
      // external id/source rather than discarding where it came from.
      const draft: SeriesDraft | undefined =
        isSeries && confirmedDraft
          ? editingCount
            ? {
                ...generateEntries({
                  id: picked!.id,
                  title: finalTitle,
                  category,
                  count: parsedCount,
                  ongoing,
                }),
                externalSource: confirmedDraft.externalSource,
                externalId: confirmedDraft.externalId,
              }
            : confirmedDraft
          : undefined;
```

Then change the `addTrack(...)` call's input object to include it (add `draft,` after `startAtOrdinal: ordinal ?? undefined,`):

```ts
      const created = await addTrack(
        db,
        {
          title: finalTitle,
          category,
          count: parsedCount,
          ongoing: isSeries && ongoing,
          match: picked ?? undefined,
          startAtOrdinal: ordinal ?? undefined,
          draft,
        },
        now,
      );
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`category` is narrowed to non-null by the function's leading `if (!category) return;` guard, matching how the rest of `handleSave` already uses `category` unguarded.)

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass — this task only changes `app/add.tsx`, which has no direct test file, so this is a regression check on everything else.

- [ ] **Step 5: Commit**

```bash
git add app/add.tsx
git commit -m "feat: Add screen save uses the confirmed or overridden draft"
```

---

## Task 12: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, every test file green.

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm no stray references to the old manga provider remain**

Run: `grep -rn "GoogleBooksProvider" src app`
Expected: only `src/providers/googleBooks.ts` itself and its usage for `book` in `src/providers/registry.ts` — no reference tying it to `manga` anywhere.

This task has nothing to commit on its own — it is the gate confirming Tasks 1–11 integrate cleanly.

---

## Not in this plan

- **TMDB attribution / AniList courtesy credit copy.** A9 already added a TMDB/Google Books/Metron attribution modal off the Done tab (per the design spec's terms-of-use note); adding AniList to that same modal is a one-line follow-up, deliberately left out of this plan since it touches a screen this plan otherwise never modifies. Do it as a small separate change once this ships.
- **`app/add.tsx` automated tests.** Matches this codebase's existing convention (no direct RNTL coverage for screen-level components, per A9). If that convention changes project-wide, Tasks 10–11 are the first place to backfill.
