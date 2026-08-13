# Track It — Design

**Status:** design approved — awaiting implementation plan
**Date:** 2026-08-12

A mobile app for tracking shows, movies, books, comics, and manga as you watch and
read them. Minimal by design.

---

## Decision log

Decisions are recorded as they are made, with the alternatives that were rejected
and the reason. A decision that gets reversed later is struck through, not deleted —
the reasoning that led to the wrong call is worth as much as the correction.

### D1 — One unified model: `Series` and `Entry`

Every tracked thing is either a **container** or a **trackable unit**:

| Media | Container (`Series`) | Trackable unit (`Entry`) |
| ----- | -------------------- | ------------------------ |
| Show  | the show             | episode                  |
| Comic | the series           | issue                    |
| Manga | the series           | volume                   |
| Book  | —                    | the book                 |
| Movie | —                    | the movie                |

A show's episodes and a comic's issues are structurally identical: individually
tracked entries hanging off a parent. Books and movies are entries with no parent.

**Rejected:** per-medium schemas (shows with seasons, books with pages, comics with
arcs). Three near-duplicate models with three sets of logic, for a difference the
user does not actually want to track.

**Why:** the granularity the user wants is per-episode, per-issue, per-volume —
which is one concept, not three. Page-level and chapter-level progress were
explicitly not wanted, which removes the only real structural difference between
the media types.

### D2 — Status is determined by consumption mode, not by medium

- **Watched** entries (episodes, movies): binary — `unwatched` → `watched`.
- **Read** entries (books, issues, volumes): three states — `unstarted` →
  `reading` → `read`.

**Rejected:** a single status enum shared by everything. It would force a
meaningless `reading` state onto episodes.

**Why:** you do not sit half-way inside an episode in a way worth recording, but
you demonstrably do sit half-way inside a book. The split falls along how the
media is consumed, so `mode` is a property of the entry, and status validity
follows from it.

### D3 — Series-level progress is derived, never stored

"4 of 34 volumes" is computed by counting finished children at read time.

**Rejected:** storing a progress counter on the series.

**Why:** a stored counter is a second source of truth for a fact the children
already state. It can drift out of sync with reality — and it always eventually
does, on the edit-and-undo paths nobody tests.

### D4 — The backlog is a status, not a separate list

Entries may exist in an unstarted state. One list, filtered by status.

**Rejected:** (a) no backlog at all — an entry exists only once started;
(b) a separate wishlist that graduates into the tracker.

**Why:** unstarted entries exist structurally no matter what — a half-watched show
*has* unwatched episodes sitting in the table. Forbidding the same state for books
would be an inconsistency requiring active enforcement, and a separate wishlist
adds a second concept holding the same data.

### D5 — Manual entry now, behind a provider interface for catalogues later

v1 creates entries manually: you give a title and a count, the app generates that
many numbered entries. Entry generation sits behind a `MetadataProvider` interface
so a catalogue-backed provider can be added later without touching the model or
the tracking flow.

**Rejected:** (a) building catalogue integrations up front — 3–4 APIs with
different shapes and auth, before the tracking loop has been proven to feel good;
(b) manual entry permanently — no covers, and covers carry most of the visual
identity of a media app.

**Why:** the riskiest and most tedious work should not come before the work that
determines whether the app is worth using. D1 made every medium the same shape,
so the provider interface is small: given a title, return an ordered list of entry
names. Refining the tracking system is the goal of v1; integrations follow.

**Known cost:** early data is coverless and hand-typed. When real metadata
arrives, existing manual series need a merge path — matching a hand-typed series
to a catalogue record and backfilling metadata without destroying recorded
progress. This is a v2 requirement, noted now so the schema leaves room for it
(stable local IDs, a nullable external-ID field per series).

#### Candidate providers (not committed, for direction only)

| Media | Candidate | Notes |
| ----- | --------- | ----- |
| Comics (single issues) | Metron (`metron.cloud`) | Open comic database with a REST API and strong issue-level data. |
| Trade paperbacks, books, manga volumes | Google Books | ISBN-based, good coverage of collected editions. |
| TV and film | Undecided | TMDB is the obvious candidate; deferred. |

> The comics source was given as "Megatron" — assumed to mean **Metron**, the
> comic book database. Worth confirming before any integration work starts.

Splitting comics between Metron (single issues) and Google Books (collected
editions) matches how the two formats are actually catalogued — issues are not
reliably in ISBN databases, and trades are not reliably in issue databases.

### D6 — Local-only storage, with JSON export/import as the safety net

All data lives in an on-device SQLite database. No accounts, no backend, no
network dependency. The user can export the full library to a JSON file and
import it back.

**Rejected:** (a) local-first with a sync backend; (b) cloud-backed from the start
(e.g. Supabase as source of truth).

**Why:** the data is small, single-user, and of no value to anyone else, so the
only thing sync genuinely buys is protection against losing the device — and
export covers most of that at a fraction of the cost. Sync's hard part is conflict
resolution, and two devices marking episodes watched while offline is a real merge
problem that would be paid for up front and used rarely.

Cloud-first was rejected specifically because it breaks in the situation the app
is used in most: offline, mid-book, marking a volume finished.

**Migration note:** adding sync later to a local-first schema is a normal
migration. The always-online assumption is the one that is painful to reverse, so
it is the one avoided.

### D7 — Expo / React Native with TypeScript, `expo-sqlite` for storage

Cross-platform iOS and Android from one codebase.

**Rejected:** (a) SwiftUI, iOS-only — better-feeling result and a natural fit for a
typography-led minimal app, but locks the platform permanently and requires
Xcode; (b) Flutter — good visual control, but Dart and a thinner ecosystem for the
catalogue integrations D5 defers.

**Why:** the developer already works in React and TypeScript, so this is the
shortest path from decision to a build running on a real phone. D5 committed to
proving the tracking loop before doing the impressive work, which argues for the
fastest feedback loop rather than the highest visual ceiling. `expo-sqlite`
satisfies D6 directly, and JSON export is trivial in this stack.

---

### D8 — The app opens to "Currently"

The home screen shows only what is in progress. Each row carries its single next
action: `Severance · next S1E4` → one tap marks it watched and the row advances
itself. Completed things fall off the screen.

**Rejected:** (a) a cover-grid shelf — D5 means there are no covers in v1, and a
grid of coverless boxes is a poor front door; (b) a reverse-chronological activity
log — it answers "what did I do" rather than "what's next".

**Why:** the intended experience is a place to keep track of what you are in the
middle of, add to easily, and rarely look back at. That is a one-tap-per-session
tool, not a browsing app.

**Experience priorities, in order:**

1. **Advancing something you are mid-way through** — one tap from app launch.
2. **Adding something to the backlog** — reachable directly from the Currently
   screen, not buried in a separate section.
3. **Navigating the backlog** — this is where browsing effort belongs, and it
   deserves real filtering and sorting rather than a flat list.
4. **Reviewing what you completed** — deliberately de-emphasised. Reachable, but
   not a primary destination and not a tab.

---

## Architecture

### Shelves are derived, not stored

There is no status column on `series`, and no "shelf" concept in the database.
The three views are queries over the same two tables:

| View          | Series                                                              | Standalone entry     |
| ------------- | ------------------------------------------------------------------- | -------------------- |
| **Currently** | any child `in_progress`, **or** ≥1 child `done` and ≥1 child not `done` | status `in_progress` |
| **Backlog**   | no child `done` **and** no child `in_progress`                        | status `unstarted`   |
| **Done**      | all children `done`                                                   | status `done`        |

This follows D3. A backlog series moves to Currently the moment its first episode
is marked — no separate "start" action, no extra state to keep in sync, and no way
for a series to appear in two shelves at once.

The `in_progress` clause is load-bearing, not defensive. Without it, a manga where
you are reading volume 1 and have finished nothing has zero `done` children and
would be classified as Backlog — actively reading, filed under "not started yet".
Read-mode series (D2) reach Currently through `in_progress` before they ever have
a `done` child; watch-mode series, which have no `in_progress` state, reach it
through the first `done` child. The two clauses cover the two consumption modes.

### Data model

Two tables.

**`series`** — `id` (UUID), `title`, `media_type` (`show` | `comic` | `manga`),
`unit_label` (`episode` | `issue` | `volume`), `created_at`,
`external_source` (nullable), `external_id` (nullable).

**`entry`** — `id` (UUID), `series_id` (nullable FK), `title`, `ordinal`
(nullable), `media_type` (`episode` | `issue` | `volume` | `book` | `movie`),
`status`, `started_at`, `finished_at`, `created_at`.

`series_id` is null for books and movies, which have no container (D1). The
nullable `external_*` columns exist from day one so the D5 merge path does not
require a migration later.

**`mode` is not a column.** It is derived from `media_type` in `domain/`:
`episode` and `movie` are `watch`; `book`, `issue` and `volume` are `read`. The
mapping is total and fixed, so storing it would be a second source of truth for a
fact `media_type` already determines — the same reasoning as D3. A stored `mode`
could disagree with its own `media_type`; a derived one cannot.

**Invariant:** for an entry with a parent, `media_type` must equal the parent's
`unit_label`. Enforced in `domain/` at creation, since entries are only ever
created in bulk from a `SeriesDraft`.

**On `series.unit_label`:** it is stored rather than derived from `media_type`
because the mapping is *not* total — a comic series may be tracked in issues or in
collected volumes, and that is the user's choice, not a property of the medium.
This is the deliberate exception to the rule applied to `mode` above.

### One status column, constrained by mode

`status` is a single enum — `unstarted` | `in_progress` | `done` — and `mode`
(derived above) determines which values are legal:

- `mode = 'watch'` → `unstarted` and `done` only; `in_progress` is rejected.
- `mode = 'read'` → all three.

**Why one column rather than two enums:** D2 says status validity *follows from*
consumption mode, which is a constraint, not a second vocabulary. Two enums would
force every query spanning media types to branch. The user-facing words differ per
mode — "watched" vs "read" — but that is presentation, and it belongs in the UI
layer, not the schema.

### Module boundaries

Each module has one purpose and depends only on those below it.

- **`db/`** — SQLite schema, migrations, queries. Knows storage, knows nothing
  about the product.
- **`domain/`** — pure TypeScript, no I/O: status transitions and their mode
  constraints, shelf classification, progress computation, entry generation from a
  count. The rules live here, which makes them testable without a database or a
  renderer.
- **`data/`** — repositories mapping rows to domain objects. The only module that
  talks to both `db/` and `domain/`.
- **`providers/`** — the `MetadataProvider` interface and the manual
  implementation.
- **`ui/`** — screens and components. Reads through `data/`, never touches `db/`.

The rule that keeps this honest: `domain/` imports nothing from `db/` or `ui/`. If
a rule needs a database call to decide something, it is in the wrong module.

### The `MetadataProvider` interface

```ts
type EntryDraft = { ordinal: number; title: string };

type SeriesDraft = {
  title: string;
  mediaType: 'show' | 'comic' | 'manga';
  unitLabel: 'episode' | 'issue' | 'volume';
  entries: EntryDraft[];
  externalSource?: string;
  externalId?: string;
};

interface MetadataProvider {
  readonly id: string;
  search(query: string): Promise<SearchResult[]>;
  hydrate(result: SearchResult): Promise<SeriesDraft>;
}
```

`ManualProvider` is the v1 implementation: `search` returns nothing, and `hydrate`
generates N numbered entries from a title and a count. A Metron or Google Books
provider (D5) implements the same two methods. Because D1 made every medium the
same shape, the interface stays this small.

### Error handling

A local-only app (D6) has few failure modes, and they concentrate in two places:

- **Migrations** — failure must abort before any write, leaving the previous
  schema and data untouched. A partially migrated database is the one
  unrecoverable state in an app with no server-side backup.
- **JSON import** — validate the whole payload first, then apply in a single
  transaction. All-or-nothing; a half-imported library is indistinguishable from
  corruption to the user.

Ordinary write failures surface inline and leave the UI on its previous state.
There is no offline case to handle, because there is no network.

### Testing

- **`domain/`** — unit tests, no mocks required since it is pure. Status
  transitions including rejected ones, shelf classification at the boundaries (a
  series with zero children; with all children done), progress arithmetic.
- **`data/`** — repository tests against an in-memory SQLite database, covering
  round-trips and the full export/import cycle.
- **`ui/`** — component tests for the one-tap advance on the Currently screen,
  since that is the core loop.

The bias is deliberate: most logic lives in `domain/`, where it is cheapest to
test, and the UI layer stays thin enough to need little testing.

---

## Open questions

These do not affect the schema and can be settled during planning, but they are
unresolved and should not be invented silently.

- **What "navigating the backlog" means.** D8 ranks this third in importance and
  says it deserves real filtering and sorting, but the behaviour is unspecified.
  Filter by media type? Sort by date added, or by title? Group series separately
  from standalone books and movies? This is the priority the user named as
  mattering most, so it warrants an explicit decision rather than a default.
- **How completed things are reached.** D8 says Done is not a tab and not a
  primary destination, which leaves open whether it is a filter on the backlog
  screen, a link in settings, or something else.
- **Whether the Currently screen groups by media type** or presents one flat list
  of everything in progress.

## Out of scope for v1

Named explicitly so planning does not absorb them: catalogue API integrations
(D5), cover art, sync and accounts (D6), ratings and reviews, social features,
reading statistics, and the activity log rejected in D8.
