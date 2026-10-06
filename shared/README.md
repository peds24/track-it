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
