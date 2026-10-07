# shared/ — what the TS app and the Swift app must agree on

Spec: `docs/superpowers/specs/2026-10-06-iris-design.md` §3.

## fixtures/

Behaviour vectors for every pure domain module. Authored in
`fixtures/cases/<module>.ts` (inputs only), recorded from the TS
implementation into `fixtures/<module>.json`, and run by:

- jest: `shared/fixtures/__tests__/fixtures.test.ts`, which fails if TS
  no longer produces the committed JSON;
- XCTest (from I3): the Swift port must produce the same values.

**JSON contract.** `args` is the positional argument list. `expect` is the
return value (`null` for null/undefined; Maps become objects in insertion
order; keys whose value is undefined are absent, so Swift treats an absent
key as nil). `throws` replaces `expect` when the function threw, and holds
the exact error message. Every case runs under `TZ=UTC`, pinned by the
jest environment in `fixtures/utcEnvironment.js` (a test can't change the
process timezone itself). Swift compares
numbers with an absolute tolerance of 1e-9. `rankingScenario` is a
composite defined in `fixtures/registry.ts`, not a TS export.

**Workflow.**
- Adding a case: write its inputs in `cases/<module>.ts`, run
  `npm run fixtures:record`, then read the recorded `expect`. It must agree
  with what the matching `src/domain` test asserts.
- **Changing domain behaviour on purpose:** change TS, run
  `npm run fixtures:record`, and commit the JSON diff. The Swift port
  turns red until it is updated too. That red is the point.
- Each module needs at least one case per test in its `src/domain/__tests__`
  file(s); the coverage check enforces it.

## schema/

`schema.sql` is the SQLite schema after every migration in
`src/db/schema.ts`. The Swift persistence layer (I4) must produce the same
file, so a database or backup moves between platforms unchanged.

## The XCTest runner (Iris I3)

`apple/IrisCore/Tests/IrisCoreTests/Fixtures/` replays every case against
the Swift port: `Registry+<Module>.swift` maps each `fn` to the real Swift
function (args decoded with JSONDecoder), a case with no registry entry
fails, a key missing on one side equals null on the other, numbers match
within 1e-9, and calendar-reading functions get a UTC calendar. JS
behaviours the TS relies on (V8's Date.parse leniency, toFixed's tie
rounding, ASCII \d/\w/\b, UTF-16 indexing) live in
`apple/IrisCore/Sources/IrisCore/Domain/JSCompat.swift` and `ISODate.swift`,
each pinned by a "Swift parity" fixture.

## scenarios/ (Iris I4, A29)

The data layer's corpus. `scenarios/cases/<area>.ts` holds scenarios —
sequences of repository calls on a fresh, migrated database — and
`npm run fixtures:record` runs them through `scenarios/play.ts`, writing
`scenarios/<area>.json`: every step's `result` (or `throws`) and a `dump` of
every table afterwards. `apple/IrisCore/Tests/IrisCoreTests/Scenarios/`
replays each on in-memory GRDB and must match.

- **Steps** name a call from `scenarios/registry.ts` (the Swift runner
  mirrors the table). `{ "$ref": n, "path": "0.id" }` takes a value from an
  earlier step's result; `"json": true` passes it `JSON.stringify`'d (for
  `importLibrary`). `sql`/`query` run raw SQL — test setup and inspection.
- **Ids are random on both platforms**, so every id is replaced by `#n` in
  insertion order (series, then entries, by rowid, learned after each step),
  in values and in object keys (`allScores` is keyed by `kind:id`).
- **Order every multi-row `query`** (`ORDER BY rowid` or a column): without
  one, `SELECT id FROM entry` reads the id index and returns random order.
- **Coverage**: every test in `src/data/__tests__` has a scenario named after
  it, except the files listed as `LATER` (I5: they need real providers) and
  titles listed in a cases file's `NOT_A_SCENARIO` (fault injection).
- The Swift migration strings (`Migrations.generated.swift`) are emitted by
  `schema/__tests__/schema.test.ts` from `src/db/schema.ts`, so Swift runs
  the exact DDL and `schema.sql` matches byte for byte.
