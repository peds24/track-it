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

### D9 — Backlog navigation: sorted by date added, filtered by media type

The backlog sorts by date added, and offers a filter by media type (show, movie,
book, comic, manga). No other sorts or filters in v1.

**Rejected:** sorting by title, and grouping series separately from standalone
books and movies.

**Why:** D8 ranked backlog navigation third in importance and called for real
filtering rather than a flat list. Date added and media type are the two axes that
match how a backlog is actually used — "what did I add recently" and "I want
something to read, not something to watch". Alphabetical sorting answers a
question nobody asks of their own backlog.

### D10 — Adding a track starts by choosing a category

**"Track" is the user-facing name for anything you add to the app.** In the data
model a track is either a `series` (show, comic, manga) or a standalone `entry`
(book, movie) — see D1. The distinction is deliberately invisible to the user.

Adding a track begins with an explicit category choice — show, movie, book, comic,
manga — and only then presents the add form. The category is chosen by the user,
never inferred.

**Rejected:** a single global search box that queries every source at once and
infers the category from the result.

**Why:** the category determines which catalogue answers the question (D5), and
those catalogues do not overlap — Metron indexes comic issues, Google Books
indexes ISBNs. A global search would have to fan out to every provider, merge
results of different shapes, and guess which one the user meant, producing a
ranked list mixing a manga volume with a TV series of the same name. Choosing the
category first turns one ambiguous query into one precise query.

It also keeps v1 honest: with `ManualProvider` there is nothing to search, so the
category choice is the *only* thing that structures the add flow. The screen the
user learns in v1 is the same screen that later gains search.

**Architectural consequence:** providers are registered per category, not
globally. A `MetadataProvider` is resolved by the chosen category, so adding
Google Books for books does not require touching the comic path, and a category
with no provider simply falls back to `ManualProvider`. There is no aggregation
layer to build, now or later.

### D11 — Completed tracks are a filter on the backlog screen, not a screen

Done is reached by a "Done" filter on the backlog screen, reusing the media-type
filter controls from D9.

**Rejected:** a dedicated Done/Archive screen, and a bottom-nav tab.

**Why:** D8 states completed things are deliberately de-emphasised — reachable but
not a primary destination. A filter is reachable without being a destination, and
it adds no new screen to build or navigate.

### D12 — The Currently screen is one flat list

Ordered by most recently advanced. No grouping by media type.

**Rejected:** grouping by media type with section headers.

**Why:** the screen should hold roughly three to six things. Grouping that few
items adds headers without adding navigation. D9 already placed the media-type
filter on the backlog screen, which is where browsing actually happens.

Most-recently-advanced ordering means the thing you touched last session sits at
the top next session, which is usually the thing you want again.

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

**Resolution is per category (D10), not global:**

```ts
type Category = 'show' | 'movie' | 'book' | 'comic' | 'manga';

// Registry lookup; falls back to ManualProvider when a category has no
// catalogue provider registered. v1 registers none, so every category
// resolves to ManualProvider.
function providerFor(category: Category): MetadataProvider;
```

The add flow asks for a category, resolves exactly one provider, and queries only
that. Categories are added to the registry independently — wiring up Google Books
for books touches no other path — and there is no fan-out or result-merging layer
to build.

### Amendments made during implementation

Two decisions were refined while building v1. Both are recorded here so the spec
and the code do not drift apart.

**A1 — `expo-sqlite` transactions must use the same connection.** The storage
layer wraps writes in `SqlDriver.transaction(fn)`, where `fn` takes no arguments
and runs its statements on the driver's own connection. Expo SDK 57's
`withExclusiveTransactionAsync` passes the callback a *separate* connection that
every inner statement must use, so statements issued through the original
connection would execute outside the transaction — silently losing atomicity on
migrations rather than failing loudly. The driver uses `withTransactionAsync`,
which is a plain BEGIN/COMMIT/ROLLBACK on the same connection.

**A2 — "nothing left to advance" is expressed one way for both track kinds.**
`nextEntryId` is `null` whenever a track has nothing advanceable, including a
finished standalone book or movie. Originally standalone tracks self-referenced
unconditionally, which made a finished book indistinguishable from an unstarted
one at the UI boundary: the Done view renders the same row component and offers
an advance action whenever `nextEntryId` is non-null, so the action would have
been offered on an already-finished book and failed when used.

**A3 — Export/import is deferred past v1, and D6's safety net goes with it.**
The Settings screen was removed before release, and with it the only user-facing
path to a backup. `src/data/backup.ts` and its tests remain in the tree,
unreferenced by `app/`, so re-enabling the feature means adding a screen rather
than rebuilding the logic.

This is a deliberate scope cut, but it is not a neutral one. D6 accepted
local-only storage *specifically because* export covered the one thing sync
would have bought — protection against losing the device. Without it, v1 has no
recovery path of any kind: a lost, wiped or reinstalled phone loses the library
outright, and the app never warns anyone of that. Anyone relying on v1 for real
data should know it is single-copy storage.

The tab bar drops to two tabs, Currently and Backlog. An empty Settings tab
would have been worse than one fewer tab.

**A4 — Ongoing series have no total, and grow one entry at a time.**
A series may be marked *ongoing*: still being published, with no final count.
This breaks two things D3 assumed, so both change for ongoing series only:

- **No "4 of 34".** There is no denominator, so the count is replaced by the
  word *Ongoing* and the number you are on. Inventing a total would be a lie
  that goes stale the week the next volume ships.
- **No progress bar.** A bar needs a fraction. Absence is already the signal
  for a standalone book, and it means the same thing here: nothing to measure
  against.

**How the list grows.** An ongoing series is created with one entry. Finishing
its last entry appends the next one, so the series always has something next.
A consequence worth stating: **an ongoing series never reaches Done.** That is
correct — an unfinished series is not something you have finished — and it
falls out of the derived shelves (D3) rather than needing a rule of its own.

**Rejected:** asking for a guessed total and correcting it later. It puts a
number the user does not have in front of them at the one moment they are least
able to supply it, and every ongoing series would drift wrong over time.

**A5 — One tap finishes the current unit of a series and starts the next.**
D2 gave read-mode entries three states so you could be half-way through a book.
That is right for a *book*, and wrong for a *volume*: finishing volume 7 of a
manga and starting volume 8 is one act, not two, and requiring two taps made the
common case cost double.

- **Series children** (episodes, issues, volumes) go straight to `done` on one
  tap, and the next child is immediately marked `in_progress` — so the row reads
  "Reading Volume 8" the moment volume 7 is finished.
- **Standalone books keep both steps.** A book has no next unit to move to, so
  "started" and "finished" remain genuinely different states, exactly as D2 said.

`in_progress` therefore still exists and still means the same thing. What
changed is who sets it: the app moves it forward for you inside a series,
instead of asking you to.

**Deliberately not added: a confirmation before starting the next unit.** The
request that prompted this asked for one, but a dialog on every completion
reinstates the second interaction this amendment exists to remove. The choice a
dialog would offer — next unit to Currently or to Backlog — only becomes real
once a catalogue can say whether a next unit exists (D5). Revisit it then.

**A6 — Leaving Currently pauses a track; it no longer resets one.** D4 defined
Backlog as "no child done and none in progress," so the original swipe-to-backlog
action reset every child to `unstarted` — the only representation Backlog had
for "out of Currently." That was a real cost: a show you paused after three
episodes lost those three episodes, and the only way back in was rewatching.

A track leaving Currently is now paused, not reset: a `paused` flag on the
series (or on the entry, for a standalone track) pulls it into Backlog while
every child's status and timestamps sit untouched (`shelfForSeries` /
`shelfForEntry` check it ahead of `in_progress`, but a fully finished track
still resolves to Done regardless of the flag — there is nothing left to
resume). The backlog row shows "Paused · Episode 4" instead of "Not started",
and its Start control becomes **Resume**, which only clears the flag — it never
advances an entry, or resuming would silently mark something watched that was
only ever left off there.

**The D4 reset is not gone, only narrowed.** A track that is *already fully
finished* has nothing to preserve, so sending it back to the backlog still
resets every child to `unstarted` — this is how you restart a finished show or
reread a finished book. `returnTrackToBacklog` branches on exactly that: pause
if anything is left to finish, reset if nothing is.

**Confirmation follows the same line.** Pausing is now reversible — Resume
undoes it — so the swipe action fires immediately, no dialog. The reset case is
still destructive (it erases watch history) and still confirms, with the
original D4 wording.

**Also changed: swipe actions execute on a full drag, not just a tap.** Both
swipe actions used to require a drag-then-tap: reveal the button, then press
it. A drag past a second, larger threshold now fires the revealed action
directly on release — a shorter drag still just latches the row open for a
tap. This applies to delete too, which still confirms; the gesture only
replaces the extra tap, not the safety dialog.

**A7 — A5 only ever meant the *second* tap onward; the implementation also
caught the first.** The code behind A5 treated any non-done series child the
same way: one tap, straight to done. For watch mode that is correct — D2 gives
episodes no reading state at all. For read mode it was not: tapping Start on a
volume you had never opened marked it done immediately, reporting a volume
read that was never opened, and skipping straight to "Reading Volume 2".

A5's own rationale — "finishing volume 7 and starting volume 8 is one act" —
is about the transition *out of* a volume you are already reading, not about
the very first tap on one. The fix removes trackRepo's override entirely:
every entry, series child or not, now goes through the same `advance()`
domain function D2 always specified — unstarted → in_progress → done for read
mode, unstarted → done for watch mode. The auto-start-the-next-child behavior
A5 added stays, but now triggers only once an entry actually *reaches* done,
which a first tap on an unread volume never did.

**Cost:** reading a series from scratch takes one more tap overall — starting
volume 1 is now a real tap of its own, where before it was folded into
"finishing" a volume that was never started. Every volume after the first
still costs one tap, exactly as A5 intended.

**Also added: Start from the Add screen.** Adding a track used to always land
it in the backlog, and starting it took a second trip — find it on the
Backlog tab, tap Start. The Add screen now offers both: **Start**, which adds
the track and immediately runs the same first advance a Backlog row's Start
button would, and **Add to backlog**, unchanged. Start is the primary
(filled) control — adding something is usually the first step toward
beginning it, not filing it away.

**A8 — Done is its own tab, reversing D11.** D11 kept completed tracks off the
tab bar on purpose: D8 ranked reviewing what you finished last among the four
experience priorities, and a filter chip reaches it "without being a
destination." That reasoning assumed Done was rare enough, and marginal
enough, to live as one option inside a horizontally scrolling row of five
category chips.

It undersold two things once the screen existed instead of just being
specified. First, the Done chip did not mean what the chips beside it meant —
the category chips narrow *within* a shelf, while the Done chip *switched*
the shelf itself, but `FilterBar` drew both with the identical affordance, so
nothing on screen distinguished "narrow what I'm looking at" from "look at
something else entirely." Second, state that lives in a chip which can
scroll out of view is state that can be left on by accident: turn on Done,
filter by Movies, flip to Currently and back, and the Backlog tab now reads
as unexpectedly empty with no visible reason why.

A dedicated tab fixes both for the reason a tab generally beats a hidden
mode: which shelf you are looking at is now always on screen in the tab bar,
never scrolled away, and `FilterBar` goes back to doing one job — category,
and nothing else. Concretely: `app/(tabs)/done.tsx` is a new screen
permanently scoped to `useTracks('done', category)`, registered as a third
`Tabs.Screen` in `app/(tabs)/_layout.tsx` after Backlog; `backlog.tsx` drops
`showDone` and reverts to `useTracks('backlog', category)` only; and
`FilterBar` loses its `showDone`/`onShowDoneChange` props and the Done chip
entirely, along with the test that exercised it.

**A9 — D5's catalogue providers, built: Google Books, TMDB, Metron, plus
barcode scanning.** D5's candidate table is now committed rather than
speculative. Registration is exactly D10's per-category rule: Google Books
answers `book` and `manga` (both ISBN-barcode media), Metron answers `comic`
alone, TMDB answers `show` and `movie`. Because `MetadataProvider.search()`
carries no category parameter of its own, `GoogleBooksProvider` and
`TmdbProvider` each take their category at construction and the registry
holds two differently-configured instances rather than the interface
growing a parameter — D5's stated goal, "add a catalogue-backed provider
without touching the model or the tracking flow," held with zero changes to
`src/providers/types.ts`.

**Manual entry still needs no network call, anywhere, including through a
real provider.** `ManualProvider.hydrate`'s count-validation and
entry-numbering logic moved into an exported `generateEntries()` in
`manual.ts`; every real provider's `hydrate()` calls it directly for a
result that has no live catalogue match. "No match" is signalled the same
way `addTrack.ts` already synthesised a `SearchResult` for `ManualProvider`
before this work — `result.id === provider.id`, the provider's own id used
as a sentinel — so a hand-typed title with search offline, unconfigured, or
just never tapped costs nothing extra and behaves identically to v1.

**Where a real provider does better than a guess:** TMDB sums
`episode_count` across a matched show's seasons (excluding season 0,
specials) for a real total, replacing the user's guess unless the series is
marked ongoing — that flag means "no known total" and a snapshot of aired
seasons must not silently overrule it. Metron reads a matched issue's
series `issue_count` for a real issue total. Google Books never overrides
the given count at all: a single-volume hit cannot tell a manga series has
34 volumes, so `count` stays exactly what the Add screen collected, same as
`ManualProvider` — the only thing a Google Books match changes is where the
*title* came from.

**Metron's query parameters, confirmed against the current API README**
(`github.com/Metron-Project/metron`, `api/README.md`) rather than assumed:
`upc` (exact match), `upc_starts_with` (prefix match, documented by Metron
themselves for mobile scanners that only read the 12-digit UPC-A), and
`series_name` for a plain title search on issues. All three matched what
the brief that started this work assumed — no drift to correct.

**The barcode-scanning gap this confirms:** `expo-camera`'s barcode
scanner (types: aztec, ean13, ean8, qr, pdf417, upc_e, datamatrix, code39,
code93, itf14, codabar, code128, upc_a) has no EAN-5 support, matching D5's
own note that a UPC-A alone identifies a comic's series, not its issue. The
scan flow is therefore: scan the UPC-A (`upc_a` type, comic only; `ean13`/
`ean8` for book/manga ISBNs), then a small skippable numeric prompt for the
5-digit EAN-5 supplemental. Given both, concatenate for Metron's exact
`upc` filter — one confident match. Skipped, fall back to
`upc_starts_with` and show every candidate issue as a pickable list through
the same result UI a text search uses — scanning fills the search box
faster, it is not a second feature.

**Schema:** `entry` gained `external_source`/`external_id` columns
(`series` already had them, unused until now — D5 left the room
deliberately). Threaded through `createStandaloneTrack`, `toEntry`, and
`backup.ts`'s export/import (still unsurfaced per A3, but its round-trip
must not silently drop a column that now exists).

**TMDB attribution** is a hard requirement of their terms, not a nicety: a
"?" next to the Done tab's title (the natural home, since TMDB only
supplies show/movie data and Done is where a finished one is reviewed)
opens a plain modal with their required sentence verbatim — "This product
uses the TMDB API but is not endorsed or certified by TMDB." — plus a short
courtesy credit each for Google Books and Metron.

**Judgment calls worth naming:**
- No cover art is fetched or stored, ever, even though Google Books and
  TMDB both return thumbnail/poster URLs in their responses — pulled off
  the wire and discarded. "Text is the artwork" (design-language.html) is a
  stated principle, not an oversight to fix once real data exists.
- Metron's Basic-auth header uses a small hand-rolled base64 encoder rather
  than a global `btoa` (not reliably present across Hermes/RN version
  combinations) or a new dependency, for one line of real work.
- Search-as-you-type is client-debounced (300ms) and swallows every
  failure into "no suggestions" rather than surfacing an error — search is
  progressive enhancement per D5/D10, never a blocking requirement, and an
  `Alert` on every offline keystroke would make it feel like one.

**Deferred / out of scope for this pass:** merging a hand-typed series
against a later catalogue match (the v2 requirement D5 already flagged);
hiding the count field when a real TMDB/Metron match makes it moot (left
visible and simply overridden, to avoid a second behavioural mode); any
UI test for `add.tsx`'s scanning branch, matching this codebase's existing
convention of no direct RNTL coverage for screen-level components.

**A10 — An episode gets `in_progress` back; a standalone movie keeps D2's
binary rule.** D2's "no in-between state" reasoning was framed around
*mode* — watched things are binary, read things are not — but the real
reasoning was narrower than that: a single sitting has no meaningful
middle. A5/A7 already established that a *series child's* tracking
granularity comes from its position in the series, not from its mode —
that is why a manga volume has `in_progress` despite being read-mode-shaped
the same way a book is. An episode was left out of that logic by accident
of framing, not by a reason that still holds: a show is exactly as
episodic as a manga is volumed, so watch mode's original binary rule
should only have ever applied to the media with no series to belong to.

- **A series child (an episode)** now takes the same `unstarted ->
  in_progress -> done` ladder a volume or issue already has. The first tap
  starts it ("Watching Episode 1"); the second finishes it and, per A5,
  immediately starts the next episode in the same tap.
- **A standalone watch-mode entry (a movie)** is unchanged: D2's binary
  rule holds for exactly the case it was actually about — no series to
  belong to, no next unit to reveal, and "have I watched this" really is
  binary.

**Mechanically:** `advance()` (`domain/advance.ts`) now takes the
straight-to-`done` path only when `mode === 'watch'` *and*
`entry.seriesId === null`; every other case (including a watch-mode series
child) goes through the same ladder read mode always used.
`isStatusValid` (`domain/mode.ts`) gained an `isSeriesChild` parameter for
the same reason — `in_progress` is invalid for watch mode only when there
is no series, not for watch mode outright. `startNextInSeries`
(`data/trackRepo.ts`) drops its `modeFor(...) !== 'read'` early return,
which was the one thing actually stopping an episode from auto-advancing;
the `seriesId === null` guard next to it was already the correct, and now
only, condition.

**Rejected:** a confirmation or distinct wording for an episode's first
tap. A5 already rejected a confirmation dialog for the equivalent volume
case, for the same reason it would reject one here — the request this
serves is fewer taps, not more dialogs.

**A11 — Completed-series autofill: real ongoing/completed signals, a confirm
step, a manga provider, and season-segmented progress for shows.** Four
changes agreed together as one pass, because they all answer the same
complaint: the user should never have to know or type a number the
catalogue already knows, for a completed show, comic, or manga. This is
the item A9 explicitly deferred — "hiding the count field when a real
TMDB/Metron match makes it moot" — now designed properly instead of left
visible-and-overridden.

*1. Providers gain a real ongoing/completed signal, not just a count.*
Today `hydrate()` can already replace a guessed count with a real one
(A9), but whether the series is ongoing still has to arrive from the user
*before* search even runs — search never tells the Add screen the answer,
even though the catalogues know it. Confirmed live against all three:
TMDB's `/tv/{id}` returns `status` ("Ended", "Canceled", "Returning
Series", …) and `in_production`; Metron's `/series/{id}/` returns
`year_end` (`null` means still running, a real year means it ended);
AniList's `status` is `FINISHED`/`RELEASING`/etc. Each provider's
`hydrate()` now sets `ongoing` itself from that field, instead of trusting
whatever the Add screen collected before a match existed.

*2. A new provider: AniList, manga only.* Google Books (A9) can never
answer "how many volumes" — a single-book hit carries no series total,
confirmed in `googleBooks.ts` and by design, not a bug to fix. AniList's
GraphQL endpoint (`graphql.anilist.co`, keyless, no rate-limit key to
manage) returns `volumes`, `chapters`, and `status` for a real match —
live-queried "Monster" during this design and got `volumes: 18, chapters:
162, status: FINISHED`. `src/providers/anilist.ts` takes over the `manga`
registration; Google Books keeps `book` only, unchanged (a book has no
count to fetch regardless, D2).

**Caveat that belongs in the code as a comment, not just here:** AniList
tracks the *work*, not the printing. "Monster" resolves to the original
18-volume/162-chapter release, not a 9-volume omnibus reprint like *The
Perfect Edition* — there is no API that disambiguates which physical
edition a user owns. This is exactly why the confirm step below exists,
not an accident it needs to paper over.

*3. A confirm step, because #1 and #2 can be confidently wrong.*
Today `addTrack.ts` calls `hydrate()` and writes to the database in the
same function call — no intermediate screen exists at all. A confirm step
now sits between picking a result and saving: it shows the fetched
summary ("Monster — 18 volumes, completed") as text, not a form. The
manual count/ongoing fields (`add.tsx`, currently always rendered once a
category needs a count) are removed entirely once a real result is
picked — no second behavioural mode, no field sitting there just to be
overridden. Tapping the summary line turns only that line into an
editable number in place, for the Perfect Edition case; this is an
override path for the rare wrong-edition match, not a default step
everyone taps through. A hand-typed title with no match keeps today's
manual fields exactly as they are — nothing about the no-match path
changes.

*4. Season-segmented progress bar, shows only.* TMDB's `/tv/{id}`
response already carries `seasons[].episode_count`; `sumEpisodeCount`
(A9) currently sums it into one flat number and discards the breakdown.
`SeriesDraft` (and `Series`, `src/domain/types.ts`) gains one additive,
optional field: `seasons: { number: number; episodeCount: number }[]`,
populated only by TMDB, `undefined` for every other category and for
every row that predates this change. `Entry` is untouched — progress
stays exactly what D3 says it is, counted from `done` children, never
stored. The seasons array is display metadata for the bar, nothing else;
no `advance()` or status logic reads it.

`TrackRow.tsx`'s bar renders as hairline-divided segments (one per
season, width proportional to that season's episode count) whenever
`series.seasons` is present, and exactly as it does today otherwise —
comics and manga keep the plain bar unconditionally, since neither
Metron nor AniList surfaces a grouping equivalent to a TV season. The
meta line's next-unit label becomes season-scoped to match: `S3 Ep 15 of
24` replaces the whole-series `Next Episode 61` when seasons exist — 15
because it is the *next* episode within season 3 (60 done overall minus
46 from seasons 1–2), the same "next unit" convention the plain label
already uses, just rescoped from the series to the season. `S`/`Ep` is a
deliberate, scoped abbreviation — the one place in the app that
abbreviates a label, agreed explicitly because the segmented bar sitting
directly below makes "season" unambiguous from context. The trailing
whole-series count ("60 of 176") is unchanged. The bar carries no season
numbers or captions of its own — segmentation is a visual grouping only,
the meta line is the only place a season number appears as text.

**Rejected:**
- Modeling seasons as a real `Season` table grouping `Entry` rows — D1's
  flat model already rejected per-medium containers once; adding a
  relational grouping back in for display purposes would resurrect
  exactly the "three near-duplicate models" D1 argued against, for
  metadata that only ever needs to be read as an array off `Series`.
- Applying a fetched count/status silently with no confirm step — an
  edition mismatch (Perfect Edition) is invisible without a human glance
  at the number before it's saved.
- Extending Google Books to guess a manga volume count from a single
  book's data — not a design trade-off, the data plainly is not there.
- Treating Metron "story arcs" the same way as TV seasons — no endpoint
  surfaced a clean arc-to-issue-count grouping equivalent to TMDB's
  season breakdown during this design's research, so comics keep the
  single bar rather than guess at a structure that isn't confirmed.

**Mechanically:** `src/providers/tmdb.ts` (`hydrate` reads `status`/
`in_production`, keeps the per-season array instead of only its sum),
`src/providers/metron.ts` (`hydrate` reads `year_end`), new
`src/providers/anilist.ts`, `src/providers/types.ts` (`SeriesDraft` gains
optional `seasons`, registry swaps `manga` from `GoogleBooksProvider` to
`AnilistProvider`), `src/domain/types.ts` (`Series` gains optional
`seasons`), one additive schema migration for the new column, `app/
add.tsx` (confirm step, conditional manual fields), `src/data/
addTrack.ts` (hydrate and save no longer happen in the same
uninterruptible call), `src/ui/TrackRow.tsx` (segmented bar, season-
scoped meta label).

**A12 — Starting mid-series backfills what came before as done, reversing
part of A10.** A10's ordinal-start ("Saga #12" → start at issue 12) only
ever marked the *named* entry `in_progress`; issues 1–11 stayed
`unstarted`. That was tested and deliberate at the time, but surfaced as
two compounding bugs once A11's manga barcode scan started feeding it real
data: scanning volume 29 of a 34-volume series reported progress as "0 of
34" with an empty bar, and finishing volume 29 sent `nextEntry()` back to
the lowest *unstarted* ordinal — volume 1 — instead of continuing to 30,
because entries 1–28 were still sitting `unstarted`.

Confirmed with the user this is a real reversal, not a silent fix:
starting a series partway through now means everything before that point
already happened. `createSeriesTrack` (`src/data/trackRepo.ts`) backfills
every entry with `ordinal < validStartOrdinal` as `done` (`started_at` and
`finished_at` both set to the creation timestamp), not `unstarted`; the
named entry itself is still the one that starts `in_progress`. This
applies to every category the ordinal-start mechanism serves — show,
comic, manga — not only the manga-scan path that surfaced it, since it is
the same shared code path A10 always was.

**Rejected:** keeping A10's original 0-progress behavior and patching only
the `nextEntry()` symptom (e.g. having it skip past already-`unstarted`
entries below the started one). Rejected because the progress display
would still misreport reality — "0 of 34" is simply false once you are
demonstrably partway through — and a symptom-only fix would leave a second
inconsistency (`nextEntry()`'s notion of "next" disagreeing with the
displayed count) rather than removing the actual defect.

**Mechanically:** `src/data/trackRepo.ts`'s `createSeriesTrack` entry-insert
loop, plus its `INSERT` column list gaining `finished_at` (previously never
set at creation, since no entry could start `done`). `src/data/__tests__/
seriesTitleOrdinal.test.ts` updated to assert the backfilled progress and
added a new test proving `nextEntry()` continues forward, not back to 1.

**A13 — Season treatment follows real progress, not just the Currently
shelf; reverses part of A11.** A11 scoped the segmented bar and `S{n} Ep
{m} of {total}` label to `shelf === 'currently'` specifically, on the
reasoning that a paused or not-yet-started show should keep its existing
"Paused"/"Not started" wording. In practice that hid real information: a
paused show still has genuine progress worth showing correctly, and a bare
"Paused" said less than the row already knew.

Season treatment is now keyed on *whether real progress exists*, not on
which shelf the row sits in: `currently`, or `backlog` while `paused`. A
show that has never been started (`backlog`, not paused) still gets
neither — there is no season position to report for a show nobody has
opened yet, so "Not started" and the flat bar are correct there. A paused
show's label becomes `Paused · S{n} Ep {m} of {total}` — the existing
"Paused" prefix, unchanged, with the season-scoped position appended
instead of dropped.

**Rejected:** keeping A11's Currently-only scoping and instead improving
`positionLabel`'s own `Paused · {nextEntryTitle}` string for a show
specifically. Rejected because the underlying problem is the segmented
*bar* disappearing on pause, not just the label — a text-only fix would
still show an empty flat bar for a show that is meaningfully partway
through.

**Mechanically:** `src/ui/TrackRow.tsx` gains a `hasSeasonProgress(track)`
helper factoring out the eligibility check that `seasonPositionLabel` and
the component's `segments` computation both used to duplicate — worth
extracting now that the condition grew a second clause, where A11's
original two-branch version was judged fine left inline.

**A14 — Comics split into Single Issue (Metron) and Collection (Google
Books).** D5's original candidate table already split comics this way
in principle — "issues are not reliably in ISBN databases, and trades are
not reliably in issue databases" — but D5/A9 only ever built the Single
Issue half; Metron was comic's only provider, so a trade paperback,
hardcover, or omnibus edition had no accurate catalogue at all. The Add
screen gains one more step for `comic` specifically, right after the
category itself: **Single issue** or **Collection**, before the title
field. Single issue is A9 unchanged — Metron, typed search, and the
UPC-A/EAN-5 scan flow, byte-for-byte. Collection routes to a
comic-tagged `GoogleBooksProvider` instance instead — search, hydrate,
and ISBN barcode scanning all work exactly as they already do for `book`,
because Google Books' behavior was never category-specific to begin with.

The registry (D10) stays a strict one-provider-per-category map;
`comic`'s entry stays Metron. The Add screen resolves the collection
exception itself (`providerForAdd(category, comicMode)`), rather than
widening the registry's interface for one category's internal split.

**Google Books can never return a real count (D5/A9), which A11's confirm
step assumes every series provider can.** For Collection specifically,
`autoConfirms` is false: the confirm-hydrate effect never runs, and the
screen falls back to exactly A9's pre-A11 behavior — picking a result
only ever confirms a title, the manual count/ongoing fields stay the
answer. This is the same trade Google Books has always made for
`book`/`manga`; A14 just extends it to comics that need it.

**A consequence worth naming explicitly:** `addTrack`'s own fallback
(`providerFor(input.category).hydrate(result)`) would resolve `comic` to
Metron regardless of which mode picked the match — wrong provider,
wrong ID format, a real network call to Metron with a Google Books ID
that cannot succeed. The Add screen avoids this by hydrating a
Collection match itself at save time (via the comic-tagged
`GoogleBooksProvider`, not the registry) and passing the result as an
explicit `draft` — `addTrack`'s own resolution only ever fires for the
hand-typed, no-match case, where every provider's sentinel check
(`result.id === this.id`) makes the "wrong" provider harmless, since none
of them touch the network for an unmatched title.

**Rejected:** a sixth `Category` value (e.g. `'comic-collection'`) to
carry the distinction all the way through the domain layer. Rejected on
D1's own reasoning restated: a collected edition is tracked exactly like
a single issue — same `unitLabel: 'issue'`, same entry shape, same shelf
rules — the only difference is which catalogue resolves the search, which
is an Add-screen concern, not a new kind of trackable media.

**Mechanically:** `src/providers/googleBooks.ts` (`GoogleBooksProvider`'s
category type widens to include `comic`; never registered globally,
`registry.ts` is unchanged). `app/add.tsx` gains `comicMode` state, a
`providerForAdd()` resolver, a new screen between the category picker and
the title screen, mode-aware `barcodeTypes`, and the `autoConfirms` guard
threaded through the confirm-hydrate effect, `showManualFields`, and the
save-time draft construction. Back navigation unwinds one level at a
time, matching the category picker's own pattern: from the search screen,
back returns to "Single issue or Collection?" before it returns to "What
are you adding?".

**A15 — Titles are editable in place, tap-and-hold, with no schema
change.** v1 had no edit path for a title at all — a typo or an
unwanted catalogue-supplied name (Google Books/AniList/TMDB/Metron)
was permanent once created. The fix under consideration was a separate
"display title" field, kept independent of the matched/canonical one, on
the theory that renaming could otherwise sever the catalogue link. It
does not: `externalSource`/`externalId` (and, for a show, `seasons_json`)
already live in columns entirely separate from `title` — nothing about
updating `title` touches them. A duplicate field would have been a second
source of truth for a problem that didn't exist.

Long-pressing a row's title (Currently, Backlog, or Done — the control is
in `TrackRow` itself, not any one screen) turns it into an editable field
in place, pre-filled with the current title. Submitting (return key or
tapping away) commits a non-blank, changed title via a new `renameTrack`;
a blank submission is silently discarded, keeping the old title, since
there is still no delete UI to recover a row with no name from. No
confirmation dialog — matches the reversible-action convention Pause
already set (D4/A6): a rename is trivially undone by renaming again.

**Rejected:** a separate display-title field. Rejected once the actual
mechanics were checked — the concern it would have solved does not exist,
so the added storage, the sync-in-two-places risk, and the "which one
does the row actually show" question it would introduce were pure cost.

**Mechanically:** `src/data/trackRepo.ts` gains `renameTrack(db, track,
title)` — validates non-blank the same way `addTrack` does at creation,
then a plain `UPDATE ... SET title` against `series` or `entry` depending
on `track.kind`. `src/ui/TrackRow.tsx` gains local edit-mode state and an
`onRename` prop; `SwipeableTrackRow.tsx` and all three list screens
(`app/(tabs)/index.tsx`, `backlog.tsx`, `done.tsx`) thread it through
identically, mirroring how `onDelete`/`onReturnToBacklog` already do.

**A16 — A comic collection tracks as a standalone item, like a book;
reverses part of A14.** A14 rejected a sixth `Category` value on the
reasoning that "a collected edition is tracked exactly like a single
issue — same `unitLabel: 'issue'`, same entry shape." Direct feedback
after using it corrected that: a shelf of trade paperbacks is a shelf of
*books*, not an issue count nobody is tracking issue-by-issue — "no more
vols ahead, treat as books." A14's routing (which catalogue answers) was
right and stays; its data shape (an issue series) was wrong for this case
and changes.

A comic collection now takes the exact same standalone path `book`/`movie`
already do (D1) — one entry, no count, no ongoing toggle, the two-tap
read ladder (D2) — while keeping `category: 'comic'` so the row still
reads "COMIC", not "BOOK". This is additive to `EntryMediaType`
(`'comic'` joins `'book'`/`'movie'` as a standalone type) rather than a
new `Category`, which is what actually delivers on A14's own reasoning:
`comic`'s *category* is unchanged, matched via Metron or Google Books
exactly as A14 set up: only which *shape of entry* a collection produces
changes.

**A real consequence, not a workaround:** `entry.media_type`'s CHECK
constraint had to widen to accept `'comic'`. SQLite has no `ALTER TABLE
... ALTER COLUMN` for constraints, so the migration recreates the table —
build the new shape, copy every row across unchanged, drop the old table,
rename the new one in, rebuild the indexes a dropped table takes with it.
Tested explicitly (`schema.test.ts`): a pre-migration row round-trips with
every column intact, the widened constraint still rejects a genuinely
unknown media type, and the indexes/cascade-delete survive the
recreation.

**A second consequence, caught before it shipped:** `addTrack`'s
standalone branch derived `externalSource` from `providerFor(category).id`
— correct for `book`/`movie`, where the registry's default provider is
always the one that actually produced the match, but wrong for a
collection comic, where the registry's `comic` entry deliberately stays
Metron (A9/A14's single-issue default) while the real match came from
Google Books. `addTrack` gains two narrow overrides — `standalone?:
boolean` (routes past the series branch regardless of category) and
`externalSource?: string` (overrides the registry-derived id) — both
`undefined` and inert for every existing caller. The same audit simplified
the standalone branch's match detection: comparing `match.id` against the
registry provider's own id was vestigial (only the series branch's
internal sentinel construction ever produces that shape; a caller never
hands the standalone branch one), so it now just checks whether `match`
is present at all.

**Rejected:** a `comic-collection` pseudo-category, or a mode flag carried
on `Series`/`Entry`. Both would resurrect exactly the "three
near-duplicate models" D1 already argued against — `comic`'s *category*
correctly stays one thing; only the entry shape a given pick produces
depends on which sub-flow the Add screen is in, which is a screen-level
routing decision, not a fact about the track itself.

**Mechanically:** `src/domain/types.ts` (`EntryMediaType` gains `comic`),
`src/domain/validate.ts` (`StandaloneMediaType`/`STANDALONE_MEDIA_TYPES`
gain `comic`), `src/domain/mode.ts` (`comic` mapped to `read`),
`src/db/schema.ts` (table-recreation migration), `src/data/trackRepo.ts`
(`createStandaloneTrack`'s category type widens), `src/data/addTrack.ts`
(`standalone`/`externalSource` overrides, simplified match detection).
`app/add.tsx`: `isSeries` excludes a collection-mode comic outright, which
is what let A14's `autoConfirms` workaround disappear entirely — there is
no confirm step left to skip once a collection comic is simply not a
series. `parseSeriesTitle` is skipped for the same reason a book's title
always skips it: there is no series left to start partway through.

**A17 — A real confirm screen replaces A11's tap-to-edit summary line, and
extends to every category, not just series.** A11 part 3 shipped a single
line of text ("18 volumes · Completed") that turned into an editable count
field on tap — an override path for a wrong-edition match. Live use showed
the bigger gap: a standalone match (book, movie, a comic collection) had
no confirm step at all — `addTrack.ts` wrote it straight to the database
off the search pick, the one case A9 explicitly deferred rather than
designed. Building a real confirm screen for every category, per an
approved mockup, made the count-override path moot at the same time: a
wrong match is now rejected outright ("Nope, search again") rather than
kept and manually corrected, since the screen already shows enough
(title, meta line, blurb) to tell a wrong match apart before saving, not
just a wrong count.

*The screen.* Once a real search result is picked (`picked !== null`),
`add.tsx` renders a dedicated full-screen view — title, a meta line
(year range, count/status, publisher — whatever the provider has, joined
with " · "), a 4-line-clamped blurb, and three actions: a medium-specific
primary ("Start watching" for a show, "Watched" for a movie — D2's own
wording, unchanged — "Start reading" for everything else), "Add to
backlog", and "Nope, search again" (clears the pick, which re-triggers
search on the still-present title text — genuinely searching again, not
just dismissing). A hand-typed title with no match, or a match whose
`hydrate()` failed, never reaches this screen — both fall through to
today's manual title/count fields exactly as before; only a resolved
match is confirmed here; nothing about the no-match path changes.

*Where series data now comes from.* `SeriesDraft` gains two optional
fields, `metaLine?: readonly string[]` and `blurb?: string | null`,
populated by the same fetch each provider's `hydrate()` already makes for
its count/ongoing signal (A11) — never a second round trip. TMDB reads
`overview`/`first_air_date`/`last_air_date` off the `/tv/{id}` response it
already has; Metron reads `desc`/`year_begin`/`publisher.name` off the
`/series/{id}/` response; AniList reads `description`/`startDate`/
`endDate` off the same `Media` query, stripping the `<br>` tags
`description(asHtml: false)` still leaves in live output — confirmed
against the real endpoint, not assumed from the parameter name.

*Where standalone data comes from: a new optional provider method.*
Neither `hydrate()` nor any existing fetch has a place to carry preview
data for a standalone category — `generateEntries` only ever builds a
count-of-1 draft with no season/meta concept. `MetadataProvider` gains an
optional `preview(result): Promise<MatchPreview>`
(`{ title, metaLine, blurb }`), implemented only by a provider that
answers a standalone category: `TmdbProvider` (movie only — fetches
`/movie/{id}` for `overview`/`release_date`) and `GoogleBooksProvider`
(book and, via the same class, a comic collection — fetches
`/volumes/{id}`, the one lookup `search()` never makes, for `authors`/
`publishedDate`/`pageCount`/`description`). Optional because a
series-only provider (Metron, AniList) has nothing to add here that
`hydrate` doesn't already carry — implementing it there would just be a
second fetch for data already in hand. Both implementations never throw:
a failed or unconfigured lookup falls back to `{ title: result.title,
metaLine: [], blurb: null }`, the same "progressive enhancement, not a
blocking requirement" precedent A9's search already set — a confirm
screen with no meta line is still a confirm screen, not a dead end.

*What A11's override path becomes.* `editingCount` (the state that turned
the summary line into an editable field) is gone entirely, along with the
manual `generateEntries` rebuild it triggered at save time — a confirmed
draft (series) or a picked result plus its preview (standalone) is now
always passed straight through unedited once the confirm screen's own
button is tapped. The Perfect-Edition case A11 named — a real match whose
count is for the wrong printing — is now handled by rejecting the match
outright rather than hand-correcting its count in place; the confirm
screen shows enough context (title, meta line, blurb) to catch that
before saving, which a bare number never could.

**Rejected:**
- Keeping A11's inline tap-to-edit count alongside the new screen — two
  ways to correct a wrong match (reject-and-research vs. edit-in-place)
  for the one problem "Nope, search again" already solves, and the
  edit-in-place path only ever handled count, never a wrong title/edition
  entirely.
- A second network fetch for series metaLine/blurb, decoupled from
  `hydrate()` — every provider's existing detail fetch already returns
  the fields needed; a second call would be a real cost for data already
  in hand.
- Making `preview` a required method on every provider — AniList and
  Metron are series-only in this app (D5); requiring a method they'd
  never be called through, and would have to either duplicate `hydrate`'s
  fetch or stub out, for no caller that reaches it.

**Mechanically:** `src/providers/types.ts` (`SeriesDraft` gains
`metaLine`/`blurb`, new `MatchPreview` type, `MetadataProvider` gains
optional `preview`), `src/providers/tmdb.ts` (`hydrate`'s show path and
new `preview` for movie), `src/providers/metron.ts` (`hydrate`'s
`metaLine`/`blurb`), `src/providers/anilist.ts` (`hydrate`'s
`metaLine`/`blurb`, `stripHtml`), `src/providers/googleBooks.ts` (new
`preview`, fetches by volume id), `app/add.tsx` (confirm-screen render
branch, `previewData`/`previewing` state and its fetch effect alongside
the existing `confirmedDraft`/`hydrating`, `editingCount` and its UI
removed, `handleSave`'s draft-building simplified to the one un-edited
path).

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

None. All design questions raised during brainstorming are resolved in D1–D12.

One item is deferred by decision rather than left open: the merge path for
reconciling hand-typed series with catalogue records (D5), which is a v2 concern.
The schema accommodates it via the nullable `external_*` columns.

## Out of scope for v1

Named explicitly so planning does not absorb them: cover art, sync and
accounts (D6), ratings and reviews, social features, and the activity log
rejected in D8. Catalogue API integrations (D5) shipped as A9 and reading
statistics moved to "Next up" below — both were on this list originally,
neither still belongs here.

## Next up

Two features are agreed as the next work, past what shipped through A10.
Documented here so their shape is settled before either gets built, rather
than decided ad hoc mid-implementation.

### Re-surface export/import

The feature already exists — `src/data/backup.ts`, fully tested, all-or-
nothing restore — and was deferred past v1 for lack of a screen to hold it,
not for lack of working logic (A3). Re-enabling it means adding that screen,
not rebuilding anything. It is also the app's only backup path (D6's "local-
only storage, with export as the safety net") — right now a lost or wiped
phone loses the library outright, and the app never says so. It matters more
than it did at v1, too: a provider-sourced track (A9) now carries
`external_source`/`external_id` worth preserving across a device change,
where a v1 hand-typed track had nothing but a title to lose.

### A stats page

Not started. Agreed shape:

- How many tracks were added per month, broken down by category.
- How long a track sits in Backlog before it's started — added to first
  advance.
- Average time to finish a track, per category.
- How many tracks were completed per month and per year.
- Exportable.

Every number above is derivable from columns that already exist
(`created_at`, `started_at`, `finished_at`, `status`) — no schema change
anticipated. Two things need a real decision once work starts, not before:
where the page lives (its own tab competes with the restraint D8/D12 argue
for; behind some other entry point avoids that but is less discoverable),
and whether time spent `paused` (A6) counts toward "time to finish" or gets
subtracted out — pausing didn't exist when "time to finish" was first
proposed, and the honest answer probably depends on which question the page
is actually trying to answer. "Exportable" likely reuses whichever format
export/import (above) settles on, since both are fundamentally "get my data
out" — worth building whichever one comes first with that reuse in mind.
