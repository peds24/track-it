# Track It — Design

**Status:** in progress (brainstorming)
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

---

## Open questions


- Platform and stack.
- What the home screen actually shows.

---

## Architecture

_To be written once the open questions are settled._
