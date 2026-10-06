# Iris I3 — Swift Domain Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port `src/domain/*.ts` to `IrisCore/Domain/*.swift` so every vector in `shared/fixtures/*.json` passes under XCTest, with the same values, the same error messages and the same quirks as TS.

**Architecture:**
- One Swift file per TS file. Public free functions are named after the TS exports, and value types are Codable, with property names equal to the JSON keys.
- `JSCompat.swift` holds the few JavaScript built-in semantics the TS relies on: trimming, `Math.round`, `parseInt`, number printing, regex flavour and `toFixed`. JS behaviour is reproduced on purpose, in one place.
- An XCTest fixture runner decodes each case's `args` into Swift types, calls the real function, and compares the result with `expect` or `throws`.
- Functions that read the local calendar take a `calendar:` parameter, so the runner can pin UTC and the app passes `.current`.

**Tech Stack:** Swift 6.4 (language mode 6, strict concurrency), Foundation (`Calendar`, `DateComponents`, `Decimal`), Swift `Regex`, XCTest via `swift test` on macOS. For the TS-side parity cases: Node 22 and jest.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md` §2.1, §2.2, §3, §8 (I3: "Every fixture case passes in Swift"). The fixture contract is in `shared/README.md`.

## Global Constraints

- `IrisCore` "does no UI and its `Domain/` does no I/O" (spec §2.1): no SwiftUI, UIKit or file access in `Sources/IrisCore/Domain/`.
- One Swift file per TS file: Types, Mode, Shelf, Advance, Validate, SeriesTitle, Genres, Seasons, Formatters, Rating, WhatsNew. `JSCompat.swift` and `ISODate.swift` are the only additions.
- Error messages are the TS text, verbatim, quirks included (e.g. "…must be book or movie, got: …" even though comics are standalone).
- Fixtures are recorded from TS and are never edited by hand. New cases go in `shared/fixtures/cases/*.ts`, followed by `npm run fixtures:record`.
- Swift 6 strict concurrency: no non-`Sendable` globals. `Regex` values are built inside functions.
- Work on `worktree-iris-domain` (`.claude/worktrees/iris-domain`). Finish with a `--no-ff` merge into `iris` through a temporary worktree.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (substitute the model in use).

## JS behaviours this port must reproduce

These were probed on Node 22 on 2026-10-06. Task 1 records each one as a "Swift parity" fixture.

| Area | JS behaviour |
| --- | --- |
| `Date.parse` validity (behind `isIsoTimestamp`) | Month 1–12. Day 1–31 in **any** month (Feb 31 rolls over to Mar 3). Hour 0–23, or 24 only as `24:00[:00[.000]]`. Minute and second 0–59. Offset hours 0–23, offset minutes 0–59. Year `0000` is allowed. |
| Date parsing | A date-only string is **UTC**. A date-time with no offset is **local**. Overflow rolls over. |
| `toFixed(1)` | Works from the exact binary value and rounds an exact tie **up**. 8.25→"8.3", 1.25→"1.3", 0.25→"0.3", 2.35→"2.4", 0.35→"0.3", 0.15→"0.1", 0.05→"0.1", 9.95→"9.9". `printf("%.1f")` rounds exact ties to even, giving "8.2". |
| Regex | `\d` and `\w` are ASCII. `\b` is ASCII-word-based. Matching is per UTF-16 unit, so `\r\n` is two characters; in Swift it is one `Character`, hence `.matchingSemantics(.unicodeScalar)`. |
| `w[0].toUpperCase()` | Takes the first UTF-16 unit, so for decomposed `é` it is `E`. Swift must use the first unicode scalar, not the first `Character`. |
| `String(n)` | `2` (not `2.0`), `-4.5`. |
| `parseInt` | Leading whitespace, optional sign, then a prefix of digits. `'c. 1999'` → NaN. |

## Review Focus

1. **A device not in UTC.** The app passes `Calendar.current`, and "23:30 tonight → 00:30 tomorrow" must be 1 day in the *device's* zone. The runner pins UTC, so a Swift-only test must prove the calendar parameter is honoured. Pinned in Task 6, Step 1.
2. **Grapheme vs scalar regex semantics** (`\r\n`, decomposed accents). Pinned by Task 1's parity cases (`cleanDescription('a\r\nb\rc')`, `initialsOf('éclair zed')`).
3. **Non-ASCII digits and word boundaries** (`Saga #١٢`, `Avol 5`, fullwidth-digit timestamps). Pinned by Task 1's parity cases.
4. **Exact-tie rounding in `formatScore`.** Pinned by Task 1's parity cases (8.25, 1.25, 0.25, 2.35, 0.35, 0.15, 0.05, 9.95).
5. **A fixture case the Swift registry doesn't know** must fail, never skip silently. Likewise a fixture module with no XCTest method. Pinned in Task 2, Step 1 (runner semantics) and Task 7, Step 1 (`pending` must be empty).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `apple/IrisCore/Sources/IrisCore/Domain/JSCompat.swift` | `jsTrim`, `jsRound`, `jsParseInt`, `jsNumberString`, `jsToFixed1`, `jsRegex` |
| `apple/IrisCore/Sources/IrisCore/Domain/ISODate.swift` | V8-equivalent ISO validation and `Date` construction |
| `…/Domain/Types.swift` | Category, UnitLabel, EntryMediaType, Mode, Status, Shelf, SeriesMediaType, Series, Entry, SeasonBoundary, TrackMetadata, DomainError |
| `…/Domain/{Mode,Shelf,Advance,Validate,SeriesTitle,Genres,Seasons,Formatters,Rating,WhatsNew}.swift` | Ports of the matching `src/domain/*.ts` |
| `apple/IrisCore/Tests/IrisCoreTests/Fixtures/JSON.swift` | `JSON` value enum, `toJSON`, `fromJSON`, `arg` |
| `…/Fixtures/FixtureRunner.swift` | Load a module's JSON, run every case, collect failures |
| `…/Fixtures/Registry+<Module>.swift` | `fn` name → Swift call, one file per module |
| `…/FixtureTests.swift` | One test per module + the "every module ported" check |
| `…/CalendarTests.swift` | Review Focus 1 |
| `shared/fixtures/cases/*.ts` | Task 1: "Swift parity" cases appended |

---

### Task 1: Record the Swift-parity cases (TS side)

**Files:**
- Modify: `shared/fixtures/cases/{validate,formatters,seriesTitle,genres,rating,seasons}.ts`
- Modify (recorded): the matching `shared/fixtures/*.json`

**Interfaces:**
- Produces: extra vectors named `Swift parity: …` that Tasks 3–6 must pass. They don't touch any existing case.

- [ ] **Step 1: Append the cases**

`validate.ts`, before the closing `];`:

```ts
  ...[
    '2026-02-31', '2026-04-31', '2026-02-32', '2026-00-10', '2026-08-00',
    '2026-08-12T24:00Z', '2026-08-12T24:00:00.000Z', '2026-08-12T24:01Z', '2026-08-12T24:00:01Z',
    '2026-08-12T23:60Z', '2026-08-12T10:00:60Z', '2026-08-12T10:00:59.999Z', '2026-08-12T10:00:00.123456789Z',
    '2026-08-12 10:00', '2026-08-12T10:00+05:30', '2026-08-12T10:00-0130', '2026-08-12T10:00+23:59',
    '2026-08-12T10:00+2400', '2026-08-12T10:00+24:00', '0000-01-01', '２０２６-08-12', '٢٠٢٦-08-12',
  ].map((v) => ({ name: `Swift parity: isIsoTimestamp ${v}`, fn: 'isIsoTimestamp', args: [v] })),
  { name: 'Swift parity: assertOrdinal prints a whole number without a decimal', fn: 'assertOrdinal', args: [-2] },
```

`formatters.ts`, inside the `([ … ] as Case[])` list, before its closing `]`:

```ts
  ['Swift parity: formatDate of a date-only string is UTC, and Feb 31 rolls over', 'formatDate', '2026-02-31'],
  ['Swift parity: formatDate at 24:00 is the next day', 'formatDate', '2026-08-12T24:00:00Z'],
  ['Swift parity: formatDate honours an explicit offset', 'formatDate', '2026-08-12T23:30:00+05:30'],
  ['Swift parity: formatDate of a local date-time', 'formatDate', '2026-08-12T10:00'],
  ['Swift parity: daysBetween date-only strings', 'daysBetween', '2026-08-12', '2026-08-14'],
  ['Swift parity: decodeEntities numeric edges and case-folded names', 'decodeEntities', '&#0; &#x110000; &#65;&#x1F600; &AMP; &Eacute;'],
  ['Swift parity: initialsOf takes the first scalar of a decomposed letter', 'initialsOf', 'éclair zed'],
  ['Swift parity: initialsOf upper-cases ß to SS', 'initialsOf', 'ß x'],
  ['Swift parity: cleanDescription treats \\r\\n and \\r as line breaks', 'cleanDescription', 'a\r\nb\rc'],
  ['Swift parity: cleanDescription decodes nbsp to a plain space and collapses it', 'cleanDescription', 'x&nbsp;&nbsp;y'],
  ['Swift parity: yearOf needs ASCII digits', 'yearOf', '２０２６-01-01'],
```

`seriesTitle.ts`, before the closing `];`:

```ts
  parse('Swift parity: only ASCII digits are ordinals', 'Saga #١٢'),
  parse('Swift parity: vol must start a word', 'Avol 5'),
  bare('Swift parity: a no-break space counts as whitespace', 'Attack on Titan 30'),
```

`genres.ts`, before the closing `];`:

```ts
  { name: 'Swift parity: filler, padding and case duplicates', fn: 'genresFrom', args: [['Sci-Fi / General / Other', ' Drama ', 'DRAMA']] },
```

`rating.ts`, before the closing `];`:

```ts
  ...[8.25, 1.25, 0.25, 2.35, 0.35, 0.15, 0.05, 9.95].map((s) => c(`Swift parity: formatScore rounds the exact binary value, ties up: ${s}`, 'formatScore', s)),
  c('Swift parity: similarity ignores a release year parseInt cannot read', 'similarity', { ...blank('a'), releaseYear: 'c. 1999' }, { ...blank('b'), releaseYear: '1999' }),
  c('Swift parity: similarity reads a release year with leading spaces', 'similarity', { ...blank('a'), releaseYear: ' 1999' }, { ...blank('b'), releaseYear: '1999' }),
```

`seasons.ts`, before the closing `];`:

```ts
  c('Swift parity: seasonSegments with a negative done-count is all empty', 'seasonSegments', HOUSE, -5),
```

- [ ] **Step 2: Record and check against the probe table**

Run: `npm run fixtures:record && npx jest shared/`
Expected: all pass.

Then read the new cases in the JSON. Expected:
- `isIsoTimestamp`: true for `2026-02-31`, `2026-04-31`, `24:00Z`, `24:00:00.000Z`, `:59.999Z`, `.123456789Z`, `2026-08-12 10:00`, `+05:30`, `-0130`, `+23:59` and `0000-01-01`. False for every other value.
- `assertOrdinal(-2)` throws `ordinal must be a non-negative whole number, got: -2`.
- `formatDate`: `"Mar 3, 2026"`, `"Aug 13, 2026"`, `"Aug 12, 2026"`, `"Aug 12, 2026"`.
- `daysBetween`: 2.
- `decodeEntities`: `"&#0; &#x110000; A😀 & é"`.
- `initialsOf`: `"EZ"` and `"SSX"`.
- `cleanDescription`: `"a\nb\nc"` and `"x y"`.
- `yearOf` (fullwidth): null.
- Titles: unchanged for `Saga #١٢` and `Avol 5`, and `{Attack on Titan, 30}`.
- `genresFrom`: `["Sci-Fi","Drama"]`.
- `formatScore`: `8.3, 1.3, 0.3, 2.4, 0.3, 0.1, 0.1, 9.9`.
- `similarity`: 0 and 0.5.
- `seasonSegments(-5)`: every `done` is 0.

A disagreement means the probe table is wrong: update the table in this plan, never the JSON.

- [ ] **Step 3: Commit**

```bash
git add shared/fixtures/cases/validate.ts shared/fixtures/cases/formatters.ts shared/fixtures/cases/seriesTitle.ts shared/fixtures/cases/genres.ts shared/fixtures/cases/rating.ts shared/fixtures/cases/seasons.ts shared/fixtures/validate.json shared/fixtures/formatters.json shared/fixtures/seriesTitle.json shared/fixtures/genres.json shared/fixtures/rating.json shared/fixtures/seasons.json
git commit -m "test(shared): pin the JS behaviours the Swift port must reproduce

V8's lenient Date.parse, toFixed's tie rounding, ASCII-only \\d and \\b,
UTF-16 indexing and \\r\\n handling all differ from Swift's defaults;
recording them makes each one a failing case until Swift matches.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fixture runner, types, JSCompat, and the first two modules (whatsNew, mode)

**Files:**
- Create: `apple/IrisCore/Tests/IrisCoreTests/Fixtures/JSON.swift`, `…/Fixtures/FixtureRunner.swift`, `…/Fixtures/Registry+WhatsNew.swift`, `…/Fixtures/Registry+Mode.swift`, `…/FixtureTests.swift`
- Create: `apple/IrisCore/Sources/IrisCore/Domain/{JSCompat,Types,WhatsNew,Mode}.swift`

**Interfaces:**
- Produces, for every later task:
  - Test side: `enum JSON: Codable, Equatable, Sendable { case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON]) }`, plus `func toJSON<T: Encodable>(_:) throws -> JSON`, `func fromJSON<T: Decodable>(_:) throws -> T`, `func arg<T: Decodable>(_ args: [JSON], _ i: Int) throws -> T` (a missing index decodes `.null`), `typealias FixtureFn = @Sendable ([JSON]) throws -> JSON`, `struct FixtureError: Error`, `let utc: Calendar`, `func runFixtures(_ module: String, _ registry: [String: FixtureFn]) throws -> [String]` (failure lines).
  - Library side: `public struct DomainError: Error, Equatable, Sendable { public let message: String }`, every type in Types.swift, `jsTrim`, `jsRound`, `jsParseInt`, `jsNumberString`, `jsToFixed1`, and `jsRegex(_:)`.

- [ ] **Step 1: Write the runner and the tests first**

`apple/IrisCore/Tests/IrisCoreTests/Fixtures/JSON.swift`:

```swift
import Foundation

/// Any JSON value, so fixtures decode without knowing their shapes up front.
enum JSON: Codable, Equatable, Sendable, CustomStringConvertible {
    case null, bool(Bool), number(Double), string(String), array([JSON]), object([String: JSON])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSON].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
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

    var description: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return (try? String(decoding: encoder.encode(self), as: UTF8.self)) ?? "<unencodable>"
    }
}

struct FixtureError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

typealias FixtureFn = @Sendable ([JSON]) throws -> JSON

func toJSON<T: Encodable>(_ value: T) throws -> JSON {
    try JSONDecoder().decode(JSON.self, from: JSONEncoder().encode(value))
}

func fromJSON<T: Decodable>(_ value: JSON) throws -> T {
    try JSONDecoder().decode(T.self, from: JSONEncoder().encode(value))
}

/// The i-th positional argument; a TS default parameter left out is `.null`.
func arg<T: Decodable>(_ args: [JSON], _ i: Int) throws -> T {
    try fromJSON(i < args.count ? args[i] : .null)
}

/// Fixtures run under TZ=UTC (shared/README.md); the Swift side passes this calendar.
let utc: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "UTC")!
    return c
}()
```

`apple/IrisCore/Tests/IrisCoreTests/Fixtures/FixtureRunner.swift`:

```swift
import Foundation
@testable import IrisCore

private struct FixtureFile: Decodable {
    let module: String
    let timezone: String
    let cases: [FixtureCase]
}

private struct FixtureCase: Decodable {
    let name: String
    let fn: String
    let args: [JSON]
    let expect: JSON?
    let `throws`: String?
}

/// shared/fixtures, found from this file: Fixtures/ → IrisCoreTests/ →
/// Tests/ → IrisCore/ → apple/ → repo root.
let fixturesDirectory: URL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("shared/fixtures")

/// Numbers within 1e-9; a key missing on one side equals null on the other
/// (Swift's encoder omits nil, TS writes null) — shared/README.md.
func fixtureMatches(_ actual: JSON, _ expected: JSON) -> Bool {
    switch (actual, expected) {
    case let (.number(a), .number(b)): return abs(a - b) <= 1e-9
    case let (.array(a), .array(b)): return a.count == b.count && zip(a, b).allSatisfy(fixtureMatches)
    case let (.object(a), .object(b)):
        return Set(a.keys).union(b.keys).allSatisfy { fixtureMatches(a[$0] ?? .null, b[$0] ?? .null) }
    default: return actual == expected
    }
}

/// Runs every case of one module; returns one line per failing case. A case
/// whose `fn` has no registry entry fails — it is never skipped.
func runFixtures(_ module: String, _ registry: [String: FixtureFn]) throws -> [String] {
    let url = fixturesDirectory.appendingPathComponent("\(module).json")
    let file = try JSONDecoder().decode(FixtureFile.self, from: Data(contentsOf: url))
    guard file.timezone == "UTC" else { return ["\(module): fixtures recorded in \(file.timezone), expected UTC"] }
    var failures: [String] = []
    for c in file.cases {
        guard let fn = registry[c.fn] else {
            failures.append("\(c.name): no Swift registry entry for \(c.fn)")
            continue
        }
        do {
            let got = try fn(c.args)
            if let t = c.throws {
                failures.append("\(c.name): expected throw \"\(t)\", got \(got)")
            } else if !fixtureMatches(got, c.expect ?? .null) {
                failures.append("\(c.name): expected \(c.expect ?? .null), got \(got)")
            }
        } catch let error as DomainError {
            if error.message != c.throws {
                failures.append("\(c.name): threw \"\(error.message)\", expected \(c.throws.map { "\"\($0)\"" } ?? "a value")")
            }
        } catch {
            failures.append("\(c.name): \(error)")
        }
    }
    return failures
}
```

`apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift`:

```swift
import Foundation
import XCTest

/// spec §3: every vector recorded from the TS domain must pass in Swift.
final class FixtureTests: XCTestCase {
    /// Fixture modules not ported yet. Each task moves its modules out; I3 is
    /// done when this is empty (Task 7).
    static let pending: Set<String> = ["shelf", "advance", "validate", "seriesTitle", "genres", "seasons", "formatters", "rating"]
    static let ported: Set<String> = ["whatsNew", "mode"]

    private func check(_ module: String, _ registry: [String: FixtureFn]) throws {
        let failures = try runFixtures(module, registry)
        XCTAssert(failures.isEmpty, "\(module): \(failures.count) failing case(s)\n" + failures.joined(separator: "\n"))
    }

    func testEveryFixtureModuleIsPortedOrPending() throws {
        let files = try FileManager.default.contentsOfDirectory(atPath: fixturesDirectory.path)
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
        XCTAssertEqual(Set(files), Self.ported.union(Self.pending))
        XCTAssert(Self.ported.isDisjoint(with: Self.pending))
    }

    func testWhatsNew() throws { try check("whatsNew", whatsNewFixtures) }
    func testMode() throws { try check("mode", modeFixtures) }
}
```

`…/Fixtures/Registry+WhatsNew.swift`:

```swift
@testable import IrisCore

let whatsNewFixtures: [String: FixtureFn] = [
    "announcementFor": { a in
        try toJSON(announcementFor(current: arg(a, 0), lastSeen: arg(a, 1), hasLibrary: arg(a, 2), notes: arg(a, 3)))
    },
]
```

`…/Fixtures/Registry+Mode.swift`:

```swift
@testable import IrisCore

let modeFixtures: [String: FixtureFn] = [
    "modeFor": { a in try toJSON(modeFor(arg(a, 0))) },
    "isStatusValid": { a in try toJSON(isStatusValid(arg(a, 0), status: arg(a, 1), isSeriesChild: arg(a, 2))) },
]
```

- [ ] **Step 2: Run, and watch it fail to compile**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "error:" | sort -u | head`
Expected: `cannot find 'announcementFor' in scope`, `cannot find 'modeFor' in scope`, `cannot find type 'DomainError'`.

- [ ] **Step 3: Write JSCompat, Types, WhatsNew and Mode**

`apple/IrisCore/Sources/IrisCore/Domain/JSCompat.swift`:

```swift
import Foundation

// The few JavaScript built-in behaviours the TS domain relies on, reproduced
// on purpose and in one place (spec §3: same values, same messages). Probed
// on Node 22, 2026-10-06; see docs/superpowers/plans/2026-10-06-iris-i3-domain.md.

/// `String.prototype.trim`: Unicode whitespace and line terminators, plus BOM.
func jsTrim(_ s: String) -> String {
    s.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}")))
}

/// `Math.round`: half rounds toward +∞ (Math.round(-2.5) == -2).
func jsRound(_ x: Double) -> Double {
    let r = x.rounded(.down)
    return x - r >= 0.5 ? r + 1 : r
}

/// `parseInt(s, 10)`: leading whitespace, an optional sign, then the longest
/// run of ASCII digits; nil where JS would give NaN.
func jsParseInt(_ s: String) -> Int? {
    var scalars = Substring(jsTrimStart(s)).unicodeScalars[...]
    var sign = 1
    if let first = scalars.first, first == "-" || first == "+" {
        sign = first == "-" ? -1 : 1
        scalars = scalars.dropFirst()
    }
    let digits = scalars.prefix { $0.isASCII && ("0"..."9").contains($0) }
    guard !digits.isEmpty, let n = Int(String(String.UnicodeScalarView(digits))) else { return nil }
    return sign * n
}

private func jsTrimStart(_ s: String) -> String {
    let ws = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\u{FEFF}"))
    return String(String.UnicodeScalarView(s.unicodeScalars.drop { ws.contains($0) }))
}

/// `String(n)` for the numbers that reach error messages: whole numbers print
/// without a decimal point (2, not 2.0); others use the shortest round-trip form.
func jsNumberString(_ x: Double) -> String {
    if x.isNaN { return "NaN" }
    if x.isInfinite { return x < 0 ? "-Infinity" : "Infinity" }
    if x == x.rounded(), abs(x) < 1e21 { return String(Int64(x)) }
    return "\(x)"
}

/// `Number.prototype.toFixed(1)`: rounds the *exact* binary value, ties up —
/// not printf's ties-to-even (8.25 → "8.3", not "8.2").
func jsToFixed1(_ x: Double) -> String {
    var exact = Decimal(string: String(format: "%.40f", x)) ?? Decimal(x)
    var rounded = Decimal()
    NSDecimalRound(&rounded, &exact, 1, .plain)
    return String(format: "%.1f", NSDecimalNumber(decimal: rounded).doubleValue)
}

/// A regex with JavaScript's flavour: per-scalar matching (so "\r\n" is two
/// characters), ASCII \d and \w, and \b on ASCII word characters.
func jsRegex<Output>(_ regex: Regex<Output>) -> Regex<Output> {
    regex
        .matchingSemantics(.unicodeScalar)
        .asciiOnlyDigits()
        .asciiOnlyWordCharacters()
        .wordBoundaryKind(.simple)
}
```

`apple/IrisCore/Sources/IrisCore/Domain/Types.swift`:

```swift
/// Ports of src/domain/types.ts. Raw values are the strings the TS app stores
/// and the fixtures carry, so Codable round-trips them unchanged.

public enum Category: String, Codable, Sendable, CaseIterable { case show, movie, book, comic, manga }
public enum UnitLabel: String, Codable, Sendable { case episode, issue, volume }
public enum EntryMediaType: String, Codable, Sendable { case episode, issue, volume, book, movie, comic }
public enum Mode: String, Codable, Sendable { case watch, read }
public enum Status: String, Codable, Sendable { case unstarted, inProgress = "in_progress", done }
public enum Shelf: String, Codable, Sendable { case currently, backlog, done }
public enum SeriesMediaType: String, Codable, Sendable { case show, comic, manga }

/// A11: one TV season's episode count — display metadata, never a source of truth (D3).
public struct SeasonBoundary: Codable, Equatable, Sendable {
    public var number: Int
    public var episodeCount: Int
    public init(number: Int, episodeCount: Int) { self.number = number; self.episodeCount = episodeCount }
}

public struct Series: Codable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var mediaType: SeriesMediaType
    public var unitLabel: UnitLabel
    public var createdAt: String
    /// A4: still being published — no total, never reaches Done.
    public var ongoing: Bool
    /// A6: pulled into Backlog without touching any child's status.
    public var paused: Bool
    public var externalSource: String?
    public var externalId: String?
    /// A11: TMDB only.
    public var seasons: [SeasonBoundary]?
}

public struct Entry: Codable, Equatable, Sendable {
    public var id: String
    public var seriesId: String?
    public var title: String
    public var ordinal: Int?
    public var mediaType: EntryMediaType
    public var status: Status
    public var startedAt: String?
    public var finishedAt: String?
    public var createdAt: String
    /// A6: only meaningful for a standalone entry.
    public var paused: Bool
    public var externalSource: String?
    public var externalId: String?

    public init(
        id: String, seriesId: String?, title: String, ordinal: Int?, mediaType: EntryMediaType, status: Status,
        startedAt: String?, finishedAt: String?, createdAt: String, paused: Bool,
        externalSource: String?, externalId: String?
    ) {
        self.id = id; self.seriesId = seriesId; self.title = title; self.ordinal = ordinal
        self.mediaType = mediaType; self.status = status; self.startedAt = startedAt
        self.finishedAt = finishedAt; self.createdAt = createdAt; self.paused = paused
        self.externalSource = externalSource; self.externalId = externalId
    }
}

/// A22: display-only catalogue metadata (D3: never a source of truth).
public struct TrackMetadata: Codable, Equatable, Sendable {
    public var coverUrl: String?
    public var creator: String?
    public var description: String?
    public var releaseYear: String?
    /// A26: absent when the catalogue gave none.
    public var genres: [String]?
}

/// A domain rule refused an input. `message` is the TS message, verbatim.
public struct DomainError: Error, Equatable, Sendable, CustomStringConvertible {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var description: String { message }
}
```

`apple/IrisCore/Sources/IrisCore/Domain/WhatsNew.swift`:

```swift
/// Port of src/domain/whatsNew.ts (A27).
public struct ReleaseNote: Codable, Equatable, Sendable {
    public struct Item: Codable, Equatable, Sendable {
        public var heading: String
        public var body: String
    }
    public var version: String
    public var title: String
    public var items: [Item]
}

/// The note to show, or nil — never on a fresh install, never twice.
public func announcementFor(current: String, lastSeen: String?, hasLibrary: Bool, notes: [ReleaseNote]) -> ReleaseNote? {
    if lastSeen == current { return nil }
    if lastSeen == nil && !hasLibrary { return nil }
    return notes.first { $0.version == current }
}
```

`apple/IrisCore/Sources/IrisCore/Domain/Mode.swift`:

```swift
/// Port of src/domain/mode.ts. Mode is a total function of media type (A16:
/// a standalone comic reads the two-tap way a book does).
public func modeFor(_ mediaType: EntryMediaType) -> Mode {
    switch mediaType {
    case .episode, .movie: .watch
    case .book, .issue, .volume, .comic: .read
    }
}

/// A10: a standalone watch-mode entry (a movie) has no in_progress state; a
/// watch-mode series child (an episode) does.
public func isStatusValid(_ mediaType: EntryMediaType, status: Status, isSeriesChild: Bool) -> Bool {
    if modeFor(mediaType) == .watch && !isSeriesChild { return status != .inProgress }
    return true
}
```

- [ ] **Step 4: Run, and watch it pass**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed|error|failed" | tail -5`
Expected: `Executed 5 tests, with 0 failures`: the 2 `IrisCoreTests`, `testEveryFixtureModuleIsPortedOrPending`, `testWhatsNew` and `testMode`.

- [ ] **Step 5: Review Focus 5 — an unknown `fn` fails rather than skipping**

Temporarily delete the `"isStatusValid"` entry from `Registry+Mode.swift`. Run `swift test --package-path apple/IrisCore --filter testMode`. Expected: FAIL, listing `…: no Swift registry entry for isStatusValid` once per such case. Restore it with `git checkout apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Mode.swift`. (If the file isn't committed yet, re-add the line by hand.)

- [ ] **Step 6: Commit**

```bash
git add apple/IrisCore/Sources/IrisCore/Domain/JSCompat.swift apple/IrisCore/Sources/IrisCore/Domain/Types.swift apple/IrisCore/Sources/IrisCore/Domain/WhatsNew.swift apple/IrisCore/Sources/IrisCore/Domain/Mode.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/JSON.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/FixtureRunner.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+WhatsNew.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Mode.swift apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift
git commit -m "feat(iris-core): run the shared fixtures in XCTest; port types, whatsNew, mode

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: shelf, advance, validate (+ ISO dates)

**Files:**
- Create: `…/Domain/{Shelf,Advance,ISODate,Validate}.swift`, `…/Fixtures/Registry+{Shelf,Advance,Validate}.swift`
- Modify: `…/FixtureTests.swift`

**Interfaces:**
- Produces:
  - `byOrdinal(_:)`, a stable sort used by Advance and Shelf.
  - `struct ISOParts`, `isoParts(_:) -> ISOParts?` and `isoDate(_:calendar:) -> Date?`, which Task 6 consumes.
  - `public struct Progress { done, total }`.
  - `public struct CompletedUnits { updated, removedIds }`.
  - `public struct EntryInvariants`.

- [ ] **Step 1: Register the three modules and watch them fail**

In `FixtureTests.swift`, move `"shelf", "advance", "validate"` from `pending` to `ported` and add:

```swift
    func testShelf() throws { try check("shelf", shelfFixtures) }
    func testAdvance() throws { try check("advance", advanceFixtures) }
    func testValidate() throws { try check("validate", validateFixtures) }
```

`…/Fixtures/Registry+Shelf.swift`:

```swift
@testable import IrisCore

let shelfFixtures: [String: FixtureFn] = [
    "shelfForEntry": { a in try toJSON(shelfForEntry(arg(a, 0))) },
    "shelfForSeries": { a in try toJSON(shelfForSeries(arg(a, 0), paused: (arg(a, 1) as Bool?) ?? false)) },
    "progressFor": { a in try toJSON(progressFor(arg(a, 0))) },
    "nextEntry": { a in try toJSON(nextEntry(arg(a, 0))) },
]
```

`…/Fixtures/Registry+Advance.swift`:

```swift
@testable import IrisCore

let advanceFixtures: [String: FixtureFn] = [
    "advance": { a in try toJSON(advance(arg(a, 0), now: arg(a, 1))) },
    "setPosition": { a in try toJSON(setPosition(arg(a, 0), targetOrdinal: arg(a, 1), now: arg(a, 2))) },
    "ongoingPlaceholder": { a in try toJSON(ongoingPlaceholder(arg(a, 0), ongoing: arg(a, 1))) },
    "completeUnits": { a in try toJSON(completeUnits(arg(a, 0), ongoing: arg(a, 1), now: arg(a, 2))) },
]
```

`…/Fixtures/Registry+Validate.swift`:

```swift
@testable import IrisCore

let validateFixtures: [String: FixtureFn] = [
    "isStandaloneMediaType": { a in try toJSON(isStandaloneMediaType(arg(a, 0))) },
    "isIsoTimestamp": { a in try toJSON(isIsoTimestamp(arg(a, 0))) },
    "assertIsoTimestamp": { a in try assertIsoTimestamp(arg(a, 0), field: arg(a, 1)); return .null },
    "assertOrdinal": { a in try assertOrdinal(arg(a, 0), field: (arg(a, 1) as String?) ?? "ordinal"); return .null },
    "assertMediaTypeMatchesParent": { a in
        try assertMediaTypeMatchesParent(arg(a, 0), parentUnitLabel: arg(a, 1), label: (arg(a, 2) as String?) ?? "entry")
        return .null
    },
    "assertEntryInvariants": { a in try assertEntryInvariants(arg(a, 0)); return .null },
]
```

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "error:" | sort -u | head`
Expected: compile errors (`cannot find 'shelfForEntry'…`).

- [ ] **Step 2: Port**

`…/Domain/Shelf.swift`:

```swift
/// Port of src/domain/shelf.ts. Derived, never stored (D3).

/// JS's Array.prototype.sort is stable; Swift's `sorted` doesn't promise it,
/// so ties on ordinal keep their input order explicitly.
func byOrdinal(_ entries: [Entry]) -> [Entry] {
    entries.enumerated()
        .sorted { a, b in
            let (x, y) = (a.element.ordinal ?? 0, b.element.ordinal ?? 0)
            return x != y ? x < y : a.offset < b.offset
        }
        .map(\.element)
}

public func shelfForEntry(_ entry: Entry) -> Shelf {
    if entry.status == .done { return .done }
    // A6: paused overrides in_progress.
    if entry.paused { return .backlog }
    if entry.status == .inProgress { return .currently }
    return .backlog
}

/// A6: `paused` never overrides a fully finished series.
public func shelfForSeries(_ children: [Entry], paused: Bool = false) -> Shelf {
    if children.isEmpty { return .backlog }
    let doneCount = children.filter { $0.status == .done }.count
    if doneCount == children.count { return .done }
    if paused { return .backlog }
    if children.contains(where: { $0.status == .inProgress }) { return .currently }
    if doneCount > 0 { return .currently }
    return .backlog
}

public struct Progress: Codable, Equatable, Sendable {
    public let done: Int
    public let total: Int
}

public func progressFor(_ children: [Entry]) -> Progress {
    Progress(done: children.filter { $0.status == .done }.count, total: children.count)
}

/// The thing the Currently screen offers to advance.
public func nextEntry(_ children: [Entry]) -> Entry? {
    if let inProgress = children.first(where: { $0.status == .inProgress }) { return inProgress }
    return byOrdinal(children.filter { $0.status == .unstarted }).first
}
```

`…/Domain/Advance.swift`:

```swift
/// Port of src/domain/advance.ts.

/// The single forward transition behind the one-tap advance (D8, A10).
public func advance(_ entry: Entry, now: String) throws -> Entry {
    if entry.status == .done { throw DomainError("Entry \(entry.id) is already done") }
    var e = entry
    if modeFor(entry.mediaType) == .watch && entry.seriesId == nil {
        e.status = .done
        e.startedAt = entry.startedAt ?? now
        e.finishedAt = now
        return e
    }
    if entry.status == .unstarted {
        e.status = .inProgress
        e.startedAt = now
        return e
    }
    e.status = .done
    e.finishedAt = now
    return e
}

/// A12: jump straight to a position; returns only the entries that changed.
public func setPosition(_ children: [Entry], targetOrdinal: Int, now: String) throws -> [Entry] {
    if targetOrdinal < 1 || targetOrdinal > children.count {
        throw DomainError("Position \(targetOrdinal) is out of range for a \(children.count)-unit series")
    }
    var changed: [Entry] = []
    for (index, child) in byOrdinal(children).enumerated() {
        let position = index + 1
        var u = child
        if position < targetOrdinal {
            u.status = .done
            u.startedAt = child.startedAt ?? now
            u.finishedAt = child.finishedAt ?? now
        } else if position == targetOrdinal {
            u.status = .inProgress
            u.startedAt = child.startedAt ?? now
            u.finishedAt = nil
        } else {
            u.status = .unstarted
            u.startedAt = nil
            u.finishedAt = nil
        }
        if u.status != child.status || u.startedAt != child.startedAt || u.finishedAt != child.finishedAt {
            changed.append(u)
        }
    }
    return changed
}

/// A23: the auto-appended trailing unit of an ongoing series, or nil.
public func ongoingPlaceholder(_ children: [Entry], ongoing: Bool) -> Entry? {
    guard ongoing, children.count >= 2 else { return nil }
    let ordered = byOrdinal(children)
    let last = ordered[ordered.count - 1]
    let previous = ordered[ordered.count - 2]
    return last.status != .done && previous.finishedAt != nil && last.createdAt == previous.finishedAt ? last : nil
}

public struct CompletedUnits: Codable, Equatable, Sendable {
    public let updated: [Entry]
    public let removedIds: [String]
}

/// A23: finish a whole track by hand.
public func completeUnits(_ children: [Entry], ongoing: Bool, now: String) -> CompletedUnits {
    let ordered = byOrdinal(children)
    let removedIds = ongoingPlaceholder(ordered, ongoing: ongoing).map { [$0.id] } ?? []
    let updated = ordered
        .filter { $0.status != .done && !removedIds.contains($0.id) }
        .map { c -> Entry in
            var u = c
            u.status = .done
            u.startedAt = c.startedAt ?? now
            u.finishedAt = now
            return u
        }
    return CompletedUnits(updated: updated, removedIds: removedIds)
}
```

`…/Domain/ISODate.swift`:

```swift
import Foundation

/// The fields of an ISO-8601 string that passes validate.ts's regex AND that
/// V8's Date.parse accepts (probed 2026-10-06): month 1–12; day 1–31 in any
/// month (Feb 31 rolls over, as in JS); hour 0–23, or 24 only as exactly
/// 24:00:00.000; minute and second 0–59; offset hours 0–23, minutes 0–59.
struct ISOParts {
    var year, month, day: Int
    var hour = 0, minute = 0, second = 0, millisecond = 0
    var hasTime = false
    /// Seconds east of UTC; nil when the string carries no offset.
    var offsetSeconds: Int?
}

func isoParts(_ s: String) -> ISOParts? {
    let re = jsRegex(#/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/#)
    guard let m = s.wholeMatch(of: re) else { return nil }
    var p = ISOParts(year: Int(m.1)!, month: Int(m.2)!, day: Int(m.3)!)
    guard (1...12).contains(p.month), (1...31).contains(p.day) else { return nil }
    if let h = m.4, let mi = m.5 {
        p.hasTime = true
        p.hour = Int(h)!
        p.minute = Int(mi)!
        p.second = m.6.map { Int($0)! } ?? 0
        p.millisecond = m.7.map { Int(String($0.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0))! } ?? 0
        guard p.minute <= 59, p.second <= 59 else { return nil }
        guard p.hour <= 23 || (p.hour == 24 && p.minute == 0 && p.second == 0 && p.millisecond == 0) else { return nil }
        if let z = m.8, z != "Z" {
            let digits = z.dropFirst().filter { $0 != ":" }
            let oh = Int(digits.prefix(2))!, om = Int(digits.suffix(2))!
            guard oh <= 23, om <= 59 else { return nil }
            p.offsetSeconds = (z.first == "-" ? -1 : 1) * (oh * 3600 + om * 60)
        } else if m.8 != nil {
            p.offsetSeconds = 0
        }
    }
    return p
}

/// `new Date(iso)`: date-only strings are UTC, date-times without an offset
/// are local (the calendar's zone), and out-of-range fields roll over.
func isoDate(_ s: String, calendar: Calendar) -> Date? {
    guard let p = isoParts(s) else { return nil }
    var cal = Calendar(identifier: .gregorian)
    if let offset = p.offsetSeconds {
        cal.timeZone = TimeZone(secondsFromGMT: offset)!
    } else if !p.hasTime {
        cal.timeZone = TimeZone(identifier: "UTC")!
    } else {
        cal.timeZone = calendar.timeZone
    }
    let comps = DateComponents(
        year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute, second: p.second,
        nanosecond: p.millisecond * 1_000_000
    )
    return cal.date(from: comps)
}
```

`…/Domain/Validate.swift`:

```swift
/// Port of src/domain/validate.ts — entry invariants every write path enforces.

/// A parentless entry is a book, a movie, or (A16) a comic collection.
public func isStandaloneMediaType(_ mediaType: String) -> Bool {
    ["book", "movie", "comic"].contains(mediaType)
}

/// ISO-8601 date or date-time that JS's Date.parse also accepts.
public func isIsoTimestamp(_ value: String) -> Bool {
    isoParts(value) != nil
}

public func assertIsoTimestamp(_ value: String?, field: String) throws {
    guard let value else { return }
    if !isIsoTimestamp(value) {
        throw DomainError("\(field) must be an ISO-8601 timestamp, got: \(value)")
    }
}

/// Ordinals number the units of a series: never negative, never fractional.
public func assertOrdinal(_ value: Double?, field: String = "ordinal") throws {
    guard let value else { return }
    if !value.isFinite || value.rounded(.towardZero) != value || value < 0 {
        throw DomainError("\(field) must be a non-negative whole number, got: \(jsNumberString(value))")
    }
}

/// The message still says "book or movie" though comics are standalone too
/// (A16) — verbatim from TS, which the fixtures hold Swift to.
public func assertMediaTypeMatchesParent(_ mediaType: EntryMediaType, parentUnitLabel: UnitLabel?, label: String = "entry") throws {
    guard let parentUnitLabel else {
        if !isStandaloneMediaType(mediaType.rawValue) {
            throw DomainError("\(label) has no parent series, so its media type must be book or movie, got: \(mediaType.rawValue)")
        }
        return
    }
    if mediaType.rawValue != parentUnitLabel.rawValue {
        throw DomainError("\(label) has media type \(mediaType.rawValue) but its series is tracked in \(parentUnitLabel.rawValue)s")
    }
}

public struct EntryInvariants: Codable, Equatable, Sendable {
    /// Used only to name the offending row in error messages.
    public var label: String?
    public var mediaType: EntryMediaType
    public var parentUnitLabel: UnitLabel?
    public var ordinal: Double?
    public var createdAt: String?
    public var startedAt: String?
    public var finishedAt: String?
}

/// Every entry invariant in one call, so no write path can enforce a subset.
public func assertEntryInvariants(_ input: EntryInvariants) throws {
    let label = input.label ?? "entry"
    try assertMediaTypeMatchesParent(input.mediaType, parentUnitLabel: input.parentUnitLabel, label: label)
    try assertOrdinal(input.ordinal, field: "\(label) ordinal")
    try assertIsoTimestamp(input.createdAt, field: "\(label) createdAt")
    try assertIsoTimestamp(input.startedAt, field: "\(label) startedAt")
    try assertIsoTimestamp(input.finishedAt, field: "\(label) finishedAt")
}
```

- [ ] **Step 3: Run, and watch them pass**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed|failing case|error:" | tail -8`
Expected: 0 failures. If any parity case fails (most likely an `isIsoTimestamp` edge), the failure line names it. Fix `isoParts`, not the fixture.

- [ ] **Step 4: Commit**

```bash
git add apple/IrisCore/Sources/IrisCore/Domain/Shelf.swift apple/IrisCore/Sources/IrisCore/Domain/Advance.swift apple/IrisCore/Sources/IrisCore/Domain/ISODate.swift apple/IrisCore/Sources/IrisCore/Domain/Validate.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Shelf.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Advance.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Validate.swift apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift
git commit -m "feat(iris-core): port shelf, advance and validate, with V8-equivalent ISO checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: seriesTitle, genres, seasons

**Files:**
- Create: `…/Domain/{SeriesTitle,Genres,Seasons}.swift`, `…/Fixtures/Registry+{SeriesTitle,Genres,Seasons}.swift`
- Modify: `…/FixtureTests.swift`

**Interfaces:**
- Produces: `public protocol GenresCarrying`, `TrackMetadata: GenresCarrying`, `ParsedSeriesTitle`, `SeasonSegment`, `CurrentSeason`, `SeasonPosition`.

- [ ] **Step 1: Register and watch them fail**

Move `"seriesTitle", "genres", "seasons"` to `ported`, then add:

```swift
    func testSeriesTitle() throws { try check("seriesTitle", seriesTitleFixtures) }
    func testGenres() throws { try check("genres", genresFixtures) }
    func testSeasons() throws { try check("seasons", seasonsFixtures) }
```

`…/Fixtures/Registry+SeriesTitle.swift`:

```swift
@testable import IrisCore

let seriesTitleFixtures: [String: FixtureFn] = [
    "parseSeriesTitle": { a in try toJSON(parseSeriesTitle(arg(a, 0))) },
    "stripBareTrailingNumber": { a in try toJSON(stripBareTrailingNumber(arg(a, 0))) },
]
```

`…/Fixtures/Registry+Genres.swift`:

```swift
@testable import IrisCore

/// withGenres is generic over GenresCarrying; fixtures pass arbitrary objects
/// ({ a: 1 }), so this adapter carries one through the real function.
private struct JSONObjectWithGenres: GenresCarrying {
    var object: [String: JSON]
    var genres: [String]? {
        get {
            guard case let .array(xs)? = object["genres"] else { return nil }
            return xs.compactMap { if case let .string(s) = $0 { s } else { nil } }
        }
        set { object["genres"] = newValue.map { .array($0.map(JSON.string)) } }
    }
}

let genresFixtures: [String: FixtureFn] = [
    "genresFrom": { a in try toJSON(genresFrom(arg(a, 0))) },
    "withGenres": { a in
        guard case let .object(base) = a.first else { throw FixtureError("withGenres: base must be an object") }
        return try .object(withGenres(JSONObjectWithGenres(object: base), arg(a, 1)).object)
    },
]
```

`…/Fixtures/Registry+Seasons.swift`:

```swift
@testable import IrisCore

let seasonsFixtures: [String: FixtureFn] = [
    "seasonSegments": { a in try toJSON(seasonSegments(arg(a, 0), doneCount: arg(a, 1))) },
    "currentSeason": { a in try toJSON(currentSeason(arg(a, 0), doneCount: arg(a, 1))) },
    "ordinalFor": { a in try toJSON(ordinalFor(arg(a, 0), seasonNumber: arg(a, 1), episodeNumber: arg(a, 2))) },
    "positionIn": { a in try toJSON(positionIn(arg(a, 0), ordinal: arg(a, 1))) },
]
```

Run `swift test --package-path apple/IrisCore` and expect compile errors.

- [ ] **Step 2: Port**

`…/Domain/SeriesTitle.swift`:

```swift
/// Port of src/domain/seriesTitle.ts (A10, A11).
public struct ParsedSeriesTitle: Codable, Equatable, Sendable {
    public let title: String
    public let ordinal: Int?
}

/// "Absolute Batman #1" → ("Absolute Batman", 1). A title stripping would
/// empty is left alone. Tried in order; the first matching pattern wins.
public func parseSeriesTitle(_ raw: String) -> ParsedSeriesTitle {
    let trimmed = jsTrim(raw)
    let patterns = [
        jsRegex(#/#\s*(\d+)\s*$/#),
        jsRegex(#/\b(?:volume|vol\.?)\s+(\d+)\s*$/#).ignoresCase(),
        jsRegex(#/\b(?:issue|iss\.?)\s+(\d+)\s*$/#).ignoresCase(),
    ]
    for pattern in patterns {
        guard let match = trimmed.firstMatch(of: pattern), let n = Int(match.1) else { continue }
        let stripped = jsTrim(String(trimmed[..<match.range.lowerBound]))
        if stripped.isEmpty { continue }
        return ParsedSeriesTitle(title: stripped, ordinal: n)
    }
    return ParsedSeriesTitle(title: trimmed, ordinal: nil)
}

/// A11: Google Books' bare trailing volume number — provider titles only.
public func stripBareTrailingNumber(_ raw: String) -> ParsedSeriesTitle {
    let trimmed = jsTrim(raw)
    guard let match = trimmed.firstMatch(of: jsRegex(#/\s+(\d+)\s*$/#)), let n = Int(match.1) else {
        return ParsedSeriesTitle(title: trimmed, ordinal: nil)
    }
    let stripped = jsTrim(String(trimmed[..<match.range.lowerBound]))
    if stripped.isEmpty { return ParsedSeriesTitle(title: trimmed, ordinal: nil) }
    return ParsedSeriesTitle(title: stripped, ordinal: n)
}
```

`…/Domain/Genres.swift`:

```swift
/// Port of src/domain/genres.ts (A26).

/// Each "/" path segment is its own genre; filler and case-insensitive
/// duplicates drop out, first spelling kept.
public func genresFrom(_ raw: [String?]?) -> [String] {
    let filler: Set<String> = ["general", "other", "miscellaneous"]
    var seen = Set<String>()
    var out: [String] = []
    for value in raw ?? [] {
        for part in (value ?? "").split(separator: "/", omittingEmptySubsequences: false) {
            let name = jsTrim(String(part))
            let key = name.lowercased()
            if name.isEmpty || filler.contains(key) || seen.contains(key) { continue }
            seen.insert(key)
            out.append(name)
        }
    }
    return out
}

/// Anything that can carry catalogue genres.
public protocol GenresCarrying {
    var genres: [String]? { get set }
}

extension TrackMetadata: GenresCarrying {}

/// `genres` set only when there are any, so a record with none looks exactly
/// as it did before genres were collected.
public func withGenres<T: GenresCarrying>(_ base: T, _ raw: [String?]?) -> T {
    let genres = genresFrom(raw)
    guard !genres.isEmpty else { return base }
    var out = base
    out.genres = genres
    return out
}
```

`…/Domain/Seasons.swift`:

```swift
/// Port of src/domain/seasons.ts (A11, A12) — display math; entries stay flat (D3).
public struct SeasonSegment: Codable, Equatable, Sendable {
    public let number: Int
    public let episodeCount: Int
    public let done: Int
}

public struct CurrentSeason: Codable, Equatable, Sendable {
    public let number: Int
    public let nextEpisode: Int
    public let episodeCount: Int
}

public struct SeasonPosition: Codable, Equatable, Sendable {
    public let season: Int
    public let episode: Int
}

public func seasonSegments(_ seasons: [SeasonBoundary], doneCount: Int) -> [SeasonSegment] {
    var cursor = 0
    return seasons.map { season in
        let done = max(0, min(season.episodeCount, doneCount - cursor))
        cursor += season.episodeCount
        return SeasonSegment(number: season.number, episodeCount: season.episodeCount, done: done)
    }
}

public func currentSeason(_ seasons: [SeasonBoundary], doneCount: Int) -> CurrentSeason? {
    var cursor = 0
    for season in seasons {
        let doneInSeason = max(0, min(season.episodeCount, doneCount - cursor))
        if doneInSeason < season.episodeCount {
            return CurrentSeason(number: season.number, nextEpisode: doneInSeason + 1, episodeCount: season.episodeCount)
        }
        cursor += season.episodeCount
    }
    return nil
}

public func ordinalFor(_ seasons: [SeasonBoundary], seasonNumber: Int, episodeNumber: Int) -> Int? {
    var cursor = 0
    for season in seasons {
        if season.number == seasonNumber {
            if episodeNumber < 1 || episodeNumber > season.episodeCount { return nil }
            return cursor + episodeNumber
        }
        cursor += season.episodeCount
    }
    return nil
}

public func positionIn(_ seasons: [SeasonBoundary], ordinal: Int) -> SeasonPosition? {
    if ordinal < 1 { return nil }
    var cursor = 0
    for season in seasons {
        if ordinal <= cursor + season.episodeCount {
            return SeasonPosition(season: season.number, episode: ordinal - cursor)
        }
        cursor += season.episodeCount
    }
    return nil
}
```

- [ ] **Step 3: Run, and watch them pass; then commit**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed|failing case|error:" | tail -8`
Expected: 0 failures.

```bash
git add apple/IrisCore/Sources/IrisCore/Domain/SeriesTitle.swift apple/IrisCore/Sources/IrisCore/Domain/Genres.swift apple/IrisCore/Sources/IrisCore/Domain/Seasons.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+SeriesTitle.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Genres.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Seasons.swift apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift
git commit -m "feat(iris-core): port series titles, genres and seasons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: rating

**Files:**
- Create: `…/Domain/Rating.swift`, `…/Fixtures/Registry+Rating.swift`
- Modify: `…/FixtureTests.swift`

**Interfaces:**
- Produces: `Sentiment` (`CaseIterable` in best-first order), `RatingProfile`, `RankedItem` (flat, with `.profile`), `KeyedSentiment`, `Answer`, `RankingSession` (field names `candidate, sentiment, bucket, lo, hi, opponent, comparisons`, which are part of the fixture contract), `RatingSummary`, `scoreAt`, `scoresFor` (ordered `[(key: String, score: Double)]`), `similarity`, `matchupReason`, `pickOpponent`, `startRanking`, `answer`, `isPlaced`, `placeInRanking`, `formatScore`.

- [ ] **Step 1: Register and watch it fail**

Move `"rating"` to `ported`, then add `func testRating() throws { try check("rating", ratingFixtures) }`.

`…/Fixtures/Registry+Rating.swift`:

```swift
@testable import IrisCore

let ratingFixtures: [String: FixtureFn] = [
    "scoreAt": { a in try toJSON(scoreAt(arg(a, 0), index: arg(a, 1), size: arg(a, 2))) },
    "scoresFor": { a in
        // A Map in TS, recorded as an object (insertion order); keys are unique in a ranking.
        let pairs = scoresFor(try arg(a, 0))
        return .object(Dictionary(uniqueKeysWithValues: pairs.map { ($0.key, JSON.number($0.score)) }))
    },
    "similarity": { a in try toJSON(similarity(arg(a, 0), arg(a, 1))) },
    "matchupReason": { a in try toJSON(matchupReason(arg(a, 0), arg(a, 1))) },
    "pickOpponent": { a in try toJSON(pickOpponent(arg(a, 0), lo: arg(a, 1), hi: arg(a, 2), candidate: arg(a, 3))) },
    "startRanking": { a in try toJSON(startRanking(arg(a, 0), sentiment: arg(a, 1), ranking: arg(a, 2))) },
    "answer": { a in try toJSON(answer(arg(a, 0), arg(a, 1))) },
    "isPlaced": { a in try toJSON(isPlaced(arg(a, 0))) },
    "placeInRanking": { a in
        try toJSON(placeInRanking(arg(a, 0), key: arg(a, 1), sentiment: arg(a, 2), indexInBucket: arg(a, 3)))
    },
    "formatScore": { a in try toJSON(formatScore(arg(a, 0))) },
    // Mirrors shared/fixtures/registry.ts: a whole session as one vector.
    "rankingScenario": { a in
        var session = startRanking(try arg(a, 0), sentiment: try arg(a, 1), ranking: try arg(a, 2))
        let answers: [Answer] = try arg(a, 3)
        var opponents: [String] = []
        for choice in answers {
            guard let opponent = session.opponent else { break }
            opponents.append(session.bucket[opponent].key)
            session = answer(session, choice)
        }
        return .object([
            "opponents": .array(opponents.map(JSON.string)),
            "lo": .number(Double(session.lo)),
            "comparisons": .number(Double(session.comparisons)),
            "placed": .bool(isPlaced(session)),
        ])
    },
]
```

Run `swift test --package-path apple/IrisCore` and expect compile errors.

- [ ] **Step 2: Port**

`…/Domain/Rating.swift`:

```swift
import Foundation

/// Port of src/domain/rating.ts (A26): Beli-style ratings, per category.

/// Best first — the order the buckets sit in within a ranking.
public enum Sentiment: String, Codable, Sendable, CaseIterable { case liked, fine, disliked }

/// Each sentiment owns a third of the 1–10 scale.
func scoreBand(_ s: Sentiment) -> (lo: Double, hi: Double) {
    switch s {
    case .liked: (7, 10)
    case .fine: (4, 7)
    case .disliked: (1, 4)
    }
}

/// What the matchup picker knows about a track.
public struct RatingProfile: Codable, Equatable, Sendable {
    public var key: String
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?
}

/// One rated track, in a category's best-first order.
public struct RankedItem: Codable, Equatable, Sendable {
    public var key: String
    public var creator: String?
    public var genres: [String]
    public var releaseYear: String?
    public var sentiment: Sentiment
    public var profile: RatingProfile { RatingProfile(key: key, creator: creator, genres: genres, releaseYear: releaseYear) }
}

/// A ranking position, as stored: only the order is persisted (D3).
public struct KeyedSentiment: Codable, Equatable, Sendable {
    public var key: String
    public var sentiment: Sentiment
}

public func scoreAt(_ sentiment: Sentiment, index: Int, size: Int) -> Double {
    let (lo, hi) = scoreBand(sentiment)
    let raw = hi - ((hi - lo) * (Double(index) + 0.5)) / Double(size)
    return jsRound(raw * 10) / 10
}

/// Scores for a whole category ranking, in ranking order (a Map in TS).
public func scoresFor(_ ranking: [KeyedSentiment]) -> [(key: String, score: Double)] {
    var sizes: [Sentiment: Int] = [:]
    for item in ranking { sizes[item.sentiment, default: 0] += 1 }
    var seen: [Sentiment: Int] = [:]
    var order: [String] = []
    var scores: [String: Double] = [:]
    for item in ranking {
        let index = seen[item.sentiment] ?? 0
        seen[item.sentiment] = index + 1
        if scores[item.key] == nil { order.append(item.key) } // a Map keeps a key's first position
        scores[item.key] = scoreAt(item.sentiment, index: index, size: sizes[item.sentiment]!)
    }
    return order.map { ($0, scores[$0]!) }
}

/// "Frank Herbert, Brian Herbert" / "Lee & Kirby" → individual names, as written.
private func creatorNames(_ creator: String?) -> [String] {
    (creator ?? "")
        .split(separator: jsRegex(#/,|&|\band\b/#).ignoresCase(), omittingEmptySubsequences: false)
        .map { jsTrim(String($0)) }
        .filter { !$0.isEmpty }
}

private func creatorsOf(_ creator: String?) -> Set<String> {
    Set(creatorNames(creator).map { $0.lowercased() })
}

/// How hard a matchup is likely to feel: shared creator ≫ shared genres (≤ 3) ≫ release within 5 years.
public func similarity(_ a: RatingProfile, _ b: RatingProfile) -> Double {
    var score = 0.0
    if !creatorsOf(a.creator).isDisjoint(with: creatorsOf(b.creator)) { score += 4 }
    let genres = Set(b.genres.map { $0.lowercased() })
    score += Double(min(3, a.genres.filter { genres.contains($0.lowercased()) }.count))
    if let ya = a.releaseYear.flatMap(jsParseInt), let yb = b.releaseYear.flatMap(jsParseInt), abs(ya - yb) <= 5 {
        score += 0.5
    }
    return score
}

/// "Both by Frank Herbert" (first track's spelling) / "Both Drama & Crime", or nil.
public func matchupReason(_ a: RatingProfile, _ b: RatingProfile) -> String? {
    let theirs = creatorsOf(b.creator)
    if let shared = creatorNames(a.creator).first(where: { theirs.contains($0.lowercased()) }) {
        return "Both by \(shared)"
    }
    let genres = Set(b.genres.map { $0.lowercased() })
    let common = a.genres.filter { genres.contains($0.lowercased()) }.prefix(2)
    return common.isEmpty ? nil : "Both \(common.joined(separator: " & "))"
}

public enum Answer: String, Codable, Sendable { case candidate, opponent, tie }

/// A binary-insertion search over the tracks sharing the new track's sentiment.
/// Field names are part of the shared fixture contract.
public struct RankingSession: Codable, Equatable, Sendable {
    public var candidate: RatingProfile
    public var sentiment: Sentiment
    /// The bucket's tracks, best first.
    public var bucket: [RankedItem]
    public var lo: Int
    public var hi: Int
    /// Index into `bucket` of the track to compare against; nil once placed.
    public var opponent: Int?
    public var comparisons: Int
}

/// The most similar track in the middle half of [lo, hi), ties to the midpoint.
public func pickOpponent(_ bucket: [RankedItem], lo: Int, hi: Int, candidate: RatingProfile) -> Int? {
    let size = hi - lo
    if size <= 0 { return nil }
    let mid = lo + size / 2
    let margin = size / 4
    var best = mid
    var bestScore = -1.0
    var i = lo + margin
    while i <= hi - 1 - margin {
        let score = similarity(candidate, bucket[i].profile)
        if score > bestScore || (score == bestScore && abs(i - mid) < abs(best - mid)) {
            best = i
            bestScore = score
        }
        i += 1
    }
    return best
}

/// A re-rank leaves the track's own earlier rating out of the comparison.
public func startRanking(_ candidate: RatingProfile, sentiment: Sentiment, ranking: [RankedItem]) -> RankingSession {
    let bucket = ranking.filter { $0.sentiment == sentiment && $0.key != candidate.key }
    return RankingSession(
        candidate: candidate, sentiment: sentiment, bucket: bucket, lo: 0, hi: bucket.count,
        opponent: pickOpponent(bucket, lo: 0, hi: bucket.count, candidate: candidate), comparisons: 0
    )
}

/// "Too tough to call" settles it just below the opponent.
public func answer(_ session: RankingSession, _ choice: Answer) -> RankingSession {
    guard let at = session.opponent else { return session }
    var s = session
    switch choice {
    case .candidate: s.hi = at
    case .opponent: s.lo = at + 1
    case .tie: s.lo = at + 1; s.hi = at + 1
    }
    s.opponent = pickOpponent(s.bucket, lo: s.lo, hi: s.hi, candidate: s.candidate)
    s.comparisons += 1
    return s
}

public func isPlaced(_ session: RankingSession) -> Bool { session.opponent == nil }

/// The category's new best-first order: other buckets untouched, the candidate
/// inserted at `indexInBucket` (clamped) within its own.
public func placeInRanking(_ ranking: [KeyedSentiment], key: String, sentiment: Sentiment, indexInBucket: Int) -> [KeyedSentiment] {
    let others = ranking.filter { $0.key != key }
    var out: [KeyedSentiment] = []
    for s in Sentiment.allCases {
        var bucket = others.filter { $0.sentiment == s }
        if s == sentiment {
            bucket.insert(KeyedSentiment(key: key, sentiment: sentiment), at: max(0, min(indexInBucket, bucket.count)))
        }
        out += bucket
    }
    return out
}

/// A26: what a rated track shows.
public struct RatingSummary: Codable, Equatable, Sendable {
    public var sentiment: Sentiment
    public var score: Double
    /// 1-based, within its category.
    public var rank: Int
    public var outOf: Int
    public var category: Category
}

/// "8.4" — always one decimal, rounded the way JS's toFixed(1) rounds.
public func formatScore(_ score: Double) -> String { jsToFixed1(score) }
```

- [ ] **Step 3: Run, and watch it pass; then commit**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed|failing case|error:" | tail -8`
Expected: 0 failures. The 48 slot scenarios must report identical `opponents` sequences. If one doesn't, the cause is `pickOpponent`'s tie-break or `similarity`.

```bash
git add apple/IrisCore/Sources/IrisCore/Domain/Rating.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Rating.swift apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift
git commit -m "feat(iris-core): port Beli-style rating, held to the TS opponent order

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: formatters, with the calendar parameter

**Files:**
- Create: `…/Domain/Formatters.swift`, `…/Fixtures/Registry+Formatters.swift`, `apple/IrisCore/Tests/IrisCoreTests/CalendarTests.swift`
- Modify: `…/FixtureTests.swift`

**Interfaces:**
- Consumes: `isoDate(_:calendar:)` (Task 3), `jsTrim`, `jsRound`, `jsRegex` (Task 2).
- Produces: `decodeEntities`, `cleanDescription`, `yearOf`, `initialsOf`, `creatorLine`, `UnitTimes`, `Timeline`, `timelineOf(addedAt:units:)`, `Entry.times`, `daysBetween(_:_:calendar:)`, `formatDuration`, `formatRelative(_:now:calendar:)`, `formatDate(_:calendar:)` and `activityLine(_:timeline:now:calendar:)`. `calendar` defaults to `.current`.

- [ ] **Step 1: Write the failing tests (Review Focus 1 + the fixtures)**

`apple/IrisCore/Tests/IrisCoreTests/CalendarTests.swift`:

```swift
import Foundation
import XCTest
@testable import IrisCore

/// Review Focus 1: the app passes Calendar.current; "late tonight → early
/// tomorrow" is one day on the *device's* calendar, which the UTC-pinned
/// fixtures can't show.
final class CalendarTests: XCTestCase {
    func testDaysBetweenUsesTheGivenCalendarsDay() {
        var denver = Calendar(identifier: .gregorian)
        denver.timeZone = TimeZone(identifier: "America/Denver")!
        // 23:30 and 00:30 Denver time (MDT, UTC−6) on Aug 12 → 13.
        let lateTonight = "2026-08-13T05:30:00.000Z"
        let earlyTomorrow = "2026-08-13T06:30:00.000Z"
        XCTAssertEqual(daysBetween(lateTonight, earlyTomorrow, calendar: denver), 1)
        XCTAssertEqual(daysBetween(lateTonight, earlyTomorrow, calendar: utc), 0)
        XCTAssertEqual(formatDate(lateTonight, calendar: denver), "Aug 12, 2026")
        XCTAssertEqual(formatDate(lateTonight, calendar: utc), "Aug 13, 2026")
    }
}
```

Move `"formatters"` from `pending` to `ported`. **`pending` is now empty.** Add `func testFormatters() throws { try check("formatters", formattersFixtures) }`.

`…/Fixtures/Registry+Formatters.swift`:

```swift
@testable import IrisCore

let formattersFixtures: [String: FixtureFn] = [
    "decodeEntities": { a in try toJSON(decodeEntities(arg(a, 0))) },
    "cleanDescription": { a in try toJSON(cleanDescription(arg(a, 0))) },
    "yearOf": { a in try toJSON(yearOf(arg(a, 0))) },
    "initialsOf": { a in try toJSON(initialsOf(arg(a, 0))) },
    "creatorLine": { a in try toJSON(creatorLine(arg(a, 0), creator: arg(a, 1))) },
    "timelineOf": { a in try toJSON(timelineOf(addedAt: arg(a, 0), units: arg(a, 1))) },
    "daysBetween": { a in try toJSON(daysBetween(arg(a, 0), arg(a, 1), calendar: utc)) },
    "formatDuration": { a in try toJSON(formatDuration(arg(a, 0))) },
    "formatRelative": { a in try toJSON(formatRelative(arg(a, 0), now: arg(a, 1), calendar: utc)) },
    "formatDate": { a in try toJSON(formatDate(arg(a, 0), calendar: utc)) },
    "activityLine": { a in try toJSON(activityLine(arg(a, 0), timeline: arg(a, 1), now: arg(a, 2), calendar: utc)) },
]
```

Run `swift test --package-path apple/IrisCore` and expect compile errors.

- [ ] **Step 2: Port**

`…/Domain/Formatters.swift`:

```swift
import Foundation

/// Port of src/domain/formatters.ts (A22) — display text, pure. Functions that
/// read the calendar day take `calendar` (default `.current`) instead of a
/// global timezone, so tests can pin UTC and the app gets the device's day.

private let namedEntities: [String: String] = [
    "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ",
    "mdash": "—", "ndash": "–", "hellip": "…", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”",
    "copy": "©", "reg": "®", "trade": "™", "eacute": "é", "egrave": "è", "aacute": "á", "oacute": "ó",
    "uacute": "ú", "iacute": "í", "ntilde": "ñ", "uuml": "ü", "ouml": "ö", "auml": "ä", "ccedil": "ç",
]

/// Named and numeric entities; anything unknown or out of range is left as written.
/// (A lone surrogate code — JS produces a broken string — is also left as written.)
public func decodeEntities(_ text: String) -> String {
    text.replacing(jsRegex(#/&(#x[0-9a-f]+|#\d+|[a-z]+);/#).ignoresCase()) { match in
        let body = match.1
        if body.hasPrefix("#") {
            let hex = body.dropFirst().first.map { $0 == "x" || $0 == "X" } ?? false
            if let code = UInt32(body.dropFirst(hex ? 2 : 1), radix: hex ? 16 : 10), code > 0, let scalar = Unicode.Scalar(code) {
                return String(Character(scalar))
            }
            return String(match.0)
        }
        return namedEntities[body.lowercased()] ?? String(match.0)
    }
}

/// Catalogue descriptions arrive as HTML fragments.
public func cleanDescription(_ raw: String?) -> String? {
    guard let raw, !raw.isEmpty else { return nil }
    let tags = "a|abbr|b|big|blockquote|br|center|cite|code|dd|del|div|dl|dt|em|font|h[1-6]|hr|i|img|ins|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul"
    func re(_ pattern: String) -> Regex<AnyRegexOutput> {
        // swiftlint:disable:next force_try — the patterns are literals in this file.
        jsRegex(try! Regex(pattern)).ignoresCase()
    }
    let stripped = raw
        .replacing(re(#"<br(?:\s[^<>]*)?\s*/?\s*>"#), with: "\n")
        .replacing(re(#"</(p|div|li|h[1-6])\s*>"#), with: "\n\n")
        .replacing(re(#"</?(?:\#(tags))(?:\s[^<>]*)?/?>"#), with: "")
    let text = jsTrim(
        decodeEntities(stripped)
            .replacing(jsRegex(#/\r\n?/#), with: "\n")
            .replacing(jsRegex(#/[ \t ]+/#), with: " ")
            .replacing(jsRegex(#/ *\n */#), with: "\n")
            .replacing(jsRegex(#/\n{3,}/#), with: "\n\n")
    )
    return text.isEmpty ? nil : text
}

/// "2020-09-15" or "2018" → "2020"/"2018"; anything shorter is not a year.
public func yearOf(_ date: String?) -> String? {
    guard let date, let m = date.prefixMatch(of: jsRegex(#/\d{4}/#)) else { return nil }
    return String(m.0)
}

/// First letters of the first two words. JS takes the first UTF-16 unit, so
/// this takes the first unicode scalar (decomposed "é" → "E"), not the Character.
public func initialsOf(_ title: String) -> String {
    let words = jsTrim(title).split(whereSeparator: { $0.unicodeScalars.allSatisfy(\.properties.isWhitespace) })
    if words.isEmpty { return "?" }
    return words.prefix(2).map { String($0.unicodeScalars.first!).uppercased() }.joined()
}

public func creatorLine(_ category: Category, creator: String?) -> String? {
    guard let creator, !creator.isEmpty else { return nil }
    switch category {
    case .show: return "Created by \(creator)"
    case .movie: return "Directed by \(creator)"
    default: return "By \(creator)"
    }
}

/// The timestamps timelineOf reads from a unit (TS: Pick<Entry, …>).
public struct UnitTimes: Codable, Equatable, Sendable {
    public var status: Status
    public var startedAt: String?
    public var finishedAt: String?
}

extension Entry {
    public var times: UnitTimes { UnitTimes(status: status, startedAt: startedAt, finishedAt: finishedAt) }
}

public struct Timeline: Codable, Equatable, Sendable {
    public var addedAt: String
    public var startedAt: String?
    public var finishedAt: String?
}

/// Derived from unit timestamps at read time (D3).
public func timelineOf(addedAt: String, units: [UnitTimes]) -> Timeline {
    var startedAt: String?
    var finishedAt: String?
    for u in units {
        if let s = u.startedAt, startedAt.map({ s < $0 }) ?? true { startedAt = s }
        if let f = u.finishedAt, finishedAt.map({ f > $0 }) ?? true { finishedAt = f }
    }
    let allDone = !units.isEmpty && units.allSatisfy { $0.status == .done }
    return Timeline(addedAt: addedAt, startedAt: startedAt, finishedAt: allDone ? finishedAt : nil)
}

/// Whole calendar days between two instants on `calendar`'s days; round()
/// absorbs a 23- or 25-hour DST day. Unparseable input is out of contract
/// (writes are validated) and counts as 0.
public func daysBetween(_ fromIso: String, _ toIso: String, calendar: Calendar = .current) -> Int {
    guard let from = isoDate(fromIso, calendar: calendar), let to = isoDate(toIso, calendar: calendar) else { return 0 }
    let ms = (calendar.startOfDay(for: to).timeIntervalSince1970 - calendar.startOfDay(for: from).timeIntervalSince1970) * 1000
    return max(0, Int(jsRound(ms / 86_400_000)))
}

public func formatDuration(_ days: Int) -> String {
    func plural(_ n: Int, _ unit: String) -> String { "\(n) \(unit)\(n == 1 ? "" : "s")" }
    if days < 1 { return "less than a day" }
    if days < 14 { return plural(days, "day") }
    if days < 60 { return plural(Int(jsRound(Double(days) / 7)), "week") }
    if days < 730 { return plural(Int(jsRound(Double(days) / 30)), "month") }
    return plural(Int(jsRound(Double(days) / 365)), "year")
}

public func formatRelative(_ iso: String, now nowIso: String, calendar: Calendar = .current) -> String {
    let days = daysBetween(iso, nowIso, calendar: calendar)
    if days == 0 { return "today" }
    if days == 1 { return "yesterday" }
    return "\(formatDuration(days)) ago"
}

/// "Aug 12, 2026" on `calendar`'s day. Unparseable input is out of contract → "".
public func formatDate(_ iso: String, calendar: Calendar = .current) -> String {
    guard let date = isoDate(iso, calendar: calendar) else { return "" }
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    let c = calendar.dateComponents([.year, .month, .day], from: date)
    return "\(months[c.month! - 1]) \(c.day!), \(c.year!)"
}

public func activityLine(_ category: Category, timeline: Timeline, now nowIso: String, calendar: Calendar = .current) -> String? {
    if let finishedAt = timeline.finishedAt {
        return "Finished in \(formatDuration(daysBetween(timeline.startedAt ?? timeline.addedAt, finishedAt, calendar: calendar)))"
    }
    if let startedAt = timeline.startedAt {
        let verb = [.book, .comic, .manga].contains(category) ? "Reading" : "Watching"
        return "\(verb) for \(formatDuration(daysBetween(startedAt, nowIso, calendar: calendar)))"
    }
    return nil
}
```

(`formatDate` reads the components with `calendar`, the caller's calendar, while `isoDate` uses its own zone choice only to *parse* the string. That split is what makes "late evening in Denver" print as that evening's date.)

- [ ] **Step 3: Run, and watch it pass**

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed|failing case|error:" | tail -8`
Expected: 0 failures, `CalendarTests` included.

- [ ] **Step 4: Commit**

```bash
git add apple/IrisCore/Sources/IrisCore/Domain/Formatters.swift apple/IrisCore/Tests/IrisCoreTests/Fixtures/Registry+Formatters.swift apple/IrisCore/Tests/IrisCoreTests/CalendarTests.swift apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift
git commit -m "feat(iris-core): port formatters; local-day math takes the caller's calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Completion check, app build, docs, merge

**Files:**
- Modify: `apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift`, `shared/README.md`, `apple/README.md`, `docs/HANDOFF.md`, `DEVLOG.md`

- [ ] **Step 1: Pin "done" — Review Focus 5**

In `FixtureTests.swift`, add:

```swift
    func testEveryFixtureModuleIsPorted() {
        XCTAssertEqual(Self.pending, [], "I3 is complete only when every shared/fixtures module runs in Swift")
    }
```

Run: `swift test --package-path apple/IrisCore 2>&1 | grep -E "Executed" | tail -1`
Expected: passes (`pending` was emptied in Task 6).

Then count the cases Swift ran against the JSON. Every case is in some module, and every module has a test:

```bash
python3 -c "import json,glob;print(sum(len(json.load(open(f))['cases']) for f in glob.glob('shared/fixtures/*.json')))"
```

Record the number in HANDOFF.

- [ ] **Step 2: The whole app still builds and passes**

Run: `apple/scripts/test.sh`, then `npm run typecheck && npx jest 2>&1 | tail -3`
Expected: `✓ All Iris tests passed` (IrisCore now includes the fixture suite); jest green.

- [ ] **Step 3: Docs**

`shared/README.md`, append:

```markdown
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
```

`apple/README.md` **Rules**, add:

```markdown
- `IrisCore/Domain` ports `src/domain` one file per TS file, held to it by
  `shared/fixtures` (every case runs in `swift test`). Where the TS relies on
  a JavaScript built-in's quirks, reproduce them in `JSCompat.swift` /
  `ISODate.swift`, never inline.
```

`docs/HANDOFF.md`, "Iris kicked off" **Status**: I3 done. The Swift domain passes all N fixture cases. List the rulings from the ledger. Next is I4 (persistence: GRDB, migrations replayed verbatim so `schema.sql` matches byte for byte).

`DEVLOG.md`, new top entry:

```markdown
## 2026-10-06 — Iris I3: Swift domain port

- `apple/IrisCore/Sources/IrisCore/Domain/` ports all of `src/domain`, one
  file per TS file; XCTest replays every `shared/fixtures` case.
- **Why reproduce JS quirks**: TS is the reference. V8 accepts Feb 31 and
  24:00; toFixed rounds exact ties up; JS regex \d is ASCII. Each became a
  "Swift parity" fixture first, then a JSCompat helper.
- **Why a calendar parameter**: the TS reads the process timezone; Swift
  takes `calendar: Calendar = .current`, so fixtures pin UTC and the app
  gets the device's day without a global.
```

- [ ] **Step 4: Commit, merge**

```bash
git add apple/IrisCore/Tests/IrisCoreTests/FixtureTests.swift shared/README.md apple/README.md docs/HANDOFF.md DEVLOG.md
git commit -m "docs(iris): record I3 — the Swift domain passes every shared fixture

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Merge as before: `git worktree add .claude/worktrees/iris-integration iris`, then `git merge --no-ff worktree-iris-domain -m "Merge worktree-iris-domain: Swift domain port (I3)"`. Re-run `apple/scripts/test.sh` + typecheck + jest on the merged tree, then remove the temporary worktree. Push `iris` and `worktree-iris-domain` to origin. Both branches are already there, and the user approved pushing them on 2026-10-06.
