# Iris I1 — Design Tokens & Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One file, `design/iris/tokens.json`, is the single source of the Iris look. A dependency-free generator turns it into Swift (iOS), TS (Android/web, adopted in I13), CSS (web, landing page) and a specimen page. Both test suites fail if any generated file is stale.

**Architecture:** `scripts/iris-tokens.js` (CommonJS Node, no dependencies) validates the JSON, then renders four strings in memory. Only after all four render does it write them, or in `--check` mode compare them to what's committed. Every output embeds the SHA-256 of `tokens.json`. Jest regenerates and diffs all four outputs. XCTest, which can't run Node, recomputes the hash with CryptoKit and compares it to `IrisTokens.sourceSHA256`.

**Tech Stack:** Node 22 (`crypto`, `fs`), Jest (jest-expo preset), Swift 6 / SwiftUI / UIKit / CryptoKit / XCTest, xcodegen, headless Chromium via Playwright for the specimen screenshot.

**Spec:** `docs/superpowers/specs/2026-10-06-iris-design.md` §4.1 (tokens), §4.3 (visual parity), §8 I1.

## Global Constraints

- Tokens are **semantic** ("named for purpose, never for a hue"). Color groups: `background`, `groupedBackground`, `secondaryGroupedBackground`, `label`, `secondaryLabel`, `tertiaryLabel`, `separator`, `fill`, `accent`, `onAccent`, `destructive`, and one `category.<kind>` tint per category (show, movie, book, comic, manga). In the JSON these are flat keys: `categoryShow`, `categoryMovie`, `categoryBook`, `categoryComic`, `categoryManga`.
- On iOS, the neutrals map to **system dynamic colours** (`.label`, `.systemGroupedBackground`…). The JSON still holds their published light/dark values so other platforms can match.
- Type follows Apple's text styles: `largeTitle`, `title1`–`title3`, `headline`, `body`, `callout`, `subheadline`, `footnote`, `caption1`, `caption2`. iOS uses the real text style, so it gets Dynamic Type.
- Space is a 4-pt scale. Radius names are `control`, `card` (20), `sheet` (32), `pill` (9999); the card and sheet values come from ROADMAP v2.0.0.
- Motion uses named springs `snappy`, `smooth`, `bouncy`, each a response/damping pair.
- Material: `glass.regular` and `glass.clear`, each with a non-glass fallback (blur, tint, border).
- Outputs, exactly: `apple/Iris/DesignSystem/IrisTokens.swift`, `src/ui/iris/tokens.ts`, `design/iris/iris.css`, plus `docs/design/iris.html` (the §4.3 specimen; component specimens arrive in I6).
- Generated files carry a "GENERATED … do not edit" header and are committed, so builds don't need Node.
- `src/ui/iris/tokens.ts` is generated now but **no Android/web screen imports it until I13**.
- Work on `worktree-iris-tokens` (in `.claude/worktrees/iris-tokens`). Finish with a `--no-ff` merge into `iris` through a temporary worktree, as in I0.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (substitute the model in use).

**Ruling against the spec, recorded here:** spec §4.1 says "a jest test and an XCTest regenerate in memory". The XCTest can't run the Node generator, so it checks the SHA-256 embedded in `IrisTokens.swift` against `tokens.json` instead. That catches the same thing: a `tokens.json` edit without a regenerate. It does not catch a hand edit to `IrisTokens.swift`; the jest diff covers that case. Cost if wrong: a Swift-only hand edit that slips past a run where jest wasn't executed.

**Decision for the user, flagged in review:** `accent` is Apple's **system blue** (`#007AFF`/`#0A84FF`). It's what first-party apps use, and it continues the M3 blue the user chose for Track It (see HANDOFF / design-direction notes). Category tints are Apple system colours: show = purple, movie = orange, book = green, comic = pink, manga = teal. Changing any of these later is a one-line JSON edit plus `npm run tokens`.

## Review Focus

1. **A generated file is hand-edited**: the jest diff fails and names the file. Pinned in Task 2, Step 4.
2. **A malformed `tokens.json`** (bad hex, missing `dark`, unknown weight, invalid JSON): the generator exits 1 with a message naming the token, and **writes nothing**. Pinned in Task 1, Steps 1 and 5.
3. **Dark mode actually resolves on iOS**: a dynamic colour must give its dark value under a dark trait collection, not just compile. Pinned in Task 3, Step 1.
4. **Translucent colours** (`secondaryLabel`, `separator`, glass tints): CSS must emit `rgba(...)` with the right alpha, and Swift must pass the alpha through. Pinned in Task 1, Step 1 and Task 3, Step 1.
5. **Nested theme scoping in CSS**: a `data-theme="dark"` block inside a light page (the specimen shows both side by side) must render dark. Pinned in Task 4, Step 2 (screenshot).

---

## File structure

| Path | Responsibility |
| --- | --- |
| `design/iris/tokens.json` | The single source of the look |
| `scripts/iris-tokens.js` | Validate → render 4 outputs → write, or `--check` |
| `scripts/__tests__/iris-tokens.test.ts` | Generator unit tests + the repo-wide staleness test |
| `apple/Iris/DesignSystem/IrisTokens.swift` | GENERATED, iOS |
| `src/ui/iris/tokens.ts` | GENERATED, TS |
| `design/iris/iris.css` | GENERATED, CSS custom properties, light/dark |
| `docs/design/iris.html` | GENERATED, specimen page |
| `apple/IrisTests/IrisTokensTests.swift` | XCTest: hash staleness + dark-mode resolution |
| `apple/project.yml` | Adds the `IrisTests` unit-test target to the `Iris` scheme |
| `package.json` | `tokens` and `tokens:check` scripts |

---

### Task 1: The generator

**Files:**
- Create: `scripts/iris-tokens.js`
- Test: `scripts/__tests__/iris-tokens.test.ts`

**Interfaces:**
- Produces (CommonJS `module.exports`):
  - `generate(raw: string): { swift: string; ts: string; css: string; html: string }`. Throws `Error` with a message naming the offending token.
  - `parseColor(value: string, where: string): { r: number; g: number; b: number; alpha: number; hex: string }`
  - `main(argv: string[], root?: string): number`. Exit code; `root` defaults to the repo root.
  - `OUTPUTS: Record<'swift'|'ts'|'css'|'html', string>`, the repo-relative output paths.
  - `SOURCE = 'design/iris/tokens.json'`.

- [ ] **Step 1: Write the failing tests**

`scripts/__tests__/iris-tokens.test.ts`:

```ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Gen = {
  generate(raw: string): { swift: string; ts: string; css: string; html: string };
  parseColor(value: string, where: string): { r: number; g: number; b: number; alpha: number; hex: string };
  main(argv: string[], root?: string): number;
  OUTPUTS: Record<'swift' | 'ts' | 'css' | 'html', string>;
  SOURCE: string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gen: Gen = require('../iris-tokens');

/** The smallest valid token set: one of everything. */
function tiny(): Record<string, unknown> {
  return {
    color: {
      label: { light: '#000000', dark: '#FFFFFF', ios: 'label' },
      separator: { light: '#3C3C434A', dark: '#54545899' },
      categoryShow: { light: '#AF52DE', dark: '#BF5AF2' },
    },
    type: { body: { size: 17, lineHeight: 22, weight: 'regular', tracking: -0.43, ios: 'body' } },
    space: { md: 12 },
    radius: { card: 20 },
    motion: { snappy: { response: 0.3, damping: 0.85 } },
    glass: {
      regular: { blur: 20, tint: { light: '#FFFFFFB3', dark: '#1E1E1E99' }, border: { light: '#FFFFFF4D', dark: '#FFFFFF1F' } },
    },
  };
}

describe('parseColor', () => {
  test('reads #RRGGBB as opaque', () => {
    expect(gen.parseColor('#AF52DE', 'x')).toEqual({ r: 175, g: 82, b: 222, alpha: 1, hex: 'AF52DE' });
  });
  test('reads #RRGGBBAA alpha to three decimals', () => {
    expect(gen.parseColor('#3C3C4399', 'x').alpha).toBe(0.6);
  });
  test('rejects shorthand and names the token', () => {
    expect(() => gen.parseColor('#FFF', 'color.label.light')).toThrow('color.label.light: "#FFF" is not #RRGGBB or #RRGGBBAA');
  });
});

describe('generate', () => {
  const out = gen.generate(JSON.stringify(tiny()));

  test('every output carries the GENERATED header and the source hash', () => {
    const hash = require('crypto').createHash('sha256').update(JSON.stringify(tiny())).digest('hex');
    for (const text of Object.values(out)) {
      expect(text).toContain('GENERATED by scripts/iris-tokens.js');
      expect(text).toContain(hash);
    }
  });
  test('an iOS-mapped colour uses the system colour in Swift', () => {
    expect(out.swift).toContain('static let label = Color(uiColor: .label)');
  });
  test('an unmapped colour becomes a light/dark dynamic colour in Swift, alpha included', () => {
    expect(out.swift).toContain('static let separator = dynamic((0x3C3C43, 0.29), (0x545458, 0.6))');
  });
  test('CSS emits rgba for translucent colours and a dark block', () => {
    expect(out.css).toContain('--iris-color-separator: rgba(60, 60, 67, 0.29);');
    expect(out.css).toMatch(/\[data-theme="dark"\][^}]*--iris-color-label: #FFFFFF;/s);
  });
  test('TS exposes light and dark palettes', () => {
    expect(out.ts).toContain('export const irisColors =');
    expect(out.ts).toContain('"categoryShow": "#BF5AF2"');
  });
  test('type weights become numeric in TS and named in Swift', () => {
    expect(out.ts).toContain('"fontWeight": "400"');
    expect(out.swift).toContain('font: .system(.body, weight: .regular)');
  });
});

describe('validation names the broken token', () => {
  const broken = (mutate: (t: any) => void) => {
    const t: any = tiny();
    mutate(t);
    return () => gen.generate(JSON.stringify(t));
  };
  test('missing dark', () => {
    expect(broken((t) => delete t.color.label.dark)).toThrow('color.label: needs both "light" and "dark"');
  });
  test('unknown weight', () => {
    expect(broken((t) => (t.type.body.weight = 'heavy'))).toThrow('type.body.weight: "heavy" is not one of');
  });
  test('missing group', () => {
    expect(broken((t) => delete t.motion)).toThrow('tokens.json: missing "motion"');
  });
  test('invalid JSON', () => {
    expect(() => gen.generate('{ nope')).toThrow('design/iris/tokens.json: invalid JSON');
  });
});

describe('main', () => {
  function sandbox(tokens: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-tokens-'));
    fs.mkdirSync(path.join(root, 'design/iris'), { recursive: true });
    fs.writeFileSync(path.join(root, gen.SOURCE), tokens);
    return root;
  }
  const quiet = () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  };
  afterEach(() => jest.restoreAllMocks());

  test('writes all four outputs, then --check passes', () => {
    quiet();
    const root = sandbox(JSON.stringify(tiny()));
    expect(gen.main([], root)).toBe(0);
    for (const rel of Object.values(gen.OUTPUTS)) expect(fs.existsSync(path.join(root, rel))).toBe(true);
    expect(gen.main(['--check'], root)).toBe(0);
  });
  test('--check fails when an output was hand-edited', () => {
    quiet();
    const root = sandbox(JSON.stringify(tiny()));
    gen.main([], root);
    fs.appendFileSync(path.join(root, gen.OUTPUTS.css), '/* edit */');
    expect(gen.main(['--check'], root)).toBe(1);
  });
  test('a broken token set exits 1 and writes nothing', () => {
    quiet();
    const root = sandbox('{ nope');
    expect(gen.main([], root)).toBe(1);
    for (const rel of Object.values(gen.OUTPUTS)) expect(fs.existsSync(path.join(root, rel))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest scripts/__tests__/iris-tokens.test.ts`
Expected: FAIL, `Cannot find module '../iris-tokens'`.

- [ ] **Step 3: Implement the generator**

`scripts/iris-tokens.js`:

```js
#!/usr/bin/env node
// Iris design tokens (spec §4.1): design/iris/tokens.json → Swift, TS, CSS
// and the docs/design/iris.html specimen. No dependencies.
//   node scripts/iris-tokens.js          write every output
//   node scripts/iris-tokens.js --check  exit 1 if a committed output is stale
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'design/iris/tokens.json';
const OUTPUTS = {
  swift: 'apple/Iris/DesignSystem/IrisTokens.swift',
  ts: 'src/ui/iris/tokens.ts',
  css: 'design/iris/iris.css',
  html: 'docs/design/iris.html',
};
const GROUPS = ['color', 'type', 'space', 'radius', 'motion', 'glass'];
const WEIGHTS = { regular: '400', medium: '500', semibold: '600', bold: '700' };
const HEX = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

function parseColor(value, where) {
  const m = typeof value === 'string' ? HEX.exec(value) : null;
  if (!m) throw new Error(`${where}: "${value}" is not #RRGGBB or #RRGGBBAA`);
  const n = parseInt(m[1], 16);
  const alpha = m[2] === undefined ? 1 : Math.round((parseInt(m[2], 16) / 255) * 1000) / 1000;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha, hex: m[1].toUpperCase() };
}

function num(value, where) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${where}: must be a number`);
  return value;
}

function pair(t, where) {
  if (!t || t.light === undefined || t.dark === undefined) throw new Error(`${where}: needs both "light" and "dark"`);
  return { light: parseColor(t.light, `${where}.light`), dark: parseColor(t.dark, `${where}.dark`) };
}

function validate(tokens) {
  for (const g of GROUPS) if (!tokens[g]) throw new Error(`tokens.json: missing "${g}"`);
  const colors = {};
  for (const [name, t] of Object.entries(tokens.color)) colors[name] = { ...pair(t, `color.${name}`), ios: t.ios ?? null };
  const type = {};
  for (const [name, t] of Object.entries(tokens.type)) {
    if (!(t.weight in WEIGHTS)) throw new Error(`type.${name}.weight: "${t.weight}" is not one of ${Object.keys(WEIGHTS).join(', ')}`);
    if (typeof t.ios !== 'string') throw new Error(`type.${name}.ios: must name a SwiftUI Font.TextStyle`);
    type[name] = {
      size: num(t.size, `type.${name}.size`),
      lineHeight: num(t.lineHeight, `type.${name}.lineHeight`),
      tracking: num(t.tracking, `type.${name}.tracking`),
      weight: t.weight,
      ios: t.ios,
    };
  }
  const flat = (g) => Object.fromEntries(Object.entries(tokens[g]).map(([k, v]) => [k, num(v, `${g}.${k}`)]));
  const motion = {};
  for (const [name, t] of Object.entries(tokens.motion)) {
    motion[name] = { response: num(t.response, `motion.${name}.response`), damping: num(t.damping, `motion.${name}.damping`) };
  }
  const glass = {};
  for (const [name, t] of Object.entries(tokens.glass)) {
    glass[name] = { blur: num(t.blur, `glass.${name}.blur`), tint: pair(t.tint, `glass.${name}.tint`), border: pair(t.border, `glass.${name}.border`) };
  }
  return { colors, type, space: flat('space'), radius: flat('radius'), motion, glass };
}

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const css = (c) => (c.alpha === 1 ? `#${c.hex}` : `rgba(${c.r}, ${c.g}, ${c.b}, ${c.alpha})`);
const sw = (c) => `(0x${c.hex}, ${c.alpha === 1 ? '1.0' : c.alpha})`;
const header = (open, close, hash) =>
  `${open} GENERATED by scripts/iris-tokens.js from ${SOURCE} — do not edit; run \`npm run tokens\`.${close}\n` +
  `${open} source-sha256: ${hash}${close}\n`;

function renderSwift(t, hash) {
  const L = [header('//', '', hash), 'import SwiftUI', 'import UIKit', ''];
  L.push('/// Iris design tokens (spec §4.1). Edit design/iris/tokens.json, then `npm run tokens`.');
  L.push('enum IrisTokens {', `    static let sourceSHA256 = "${hash}"`, '');
  L.push('    enum Colors {');
  for (const [n, c] of Object.entries(t.colors)) {
    L.push(c.ios ? `        static let ${n} = Color(uiColor: .${c.ios})` : `        static let ${n} = dynamic(${sw(c.light)}, ${sw(c.dark)})`);
  }
  L.push('    }', '');
  L.push('    struct TextStyle: Sendable {', '        let font: Font', '        let size: CGFloat', '        let lineHeight: CGFloat', '        let tracking: CGFloat', '    }', '');
  L.push('    enum Typography {');
  for (const [n, s] of Object.entries(t.type)) {
    L.push(`        static let ${n} = TextStyle(font: .system(.${s.ios}, weight: .${s.weight}), size: ${s.size}, lineHeight: ${s.lineHeight}, tracking: ${s.tracking})`);
  }
  L.push('    }', '');
  for (const [g, Name] of [['space', 'Space'], ['radius', 'Radius']]) {
    L.push(`    enum ${Name} {`);
    for (const [n, v] of Object.entries(t[g])) L.push(`        static let ${n}: CGFloat = ${v}`);
    L.push('    }', '');
  }
  L.push('    enum Motion {');
  for (const [n, m] of Object.entries(t.motion)) L.push(`        static let ${n} = Animation.spring(response: ${m.response}, dampingFraction: ${m.damping})`);
  L.push('    }', '');
  L.push('    /// Used when Liquid Glass is unavailable or Reduce Transparency is on.');
  L.push('    struct GlassFallback: Sendable {', '        let blur: CGFloat', '        let tint: Color', '        let border: Color', '    }', '');
  L.push('    enum Glass {');
  for (const [n, g] of Object.entries(t.glass)) {
    L.push(`        static let ${n} = GlassFallback(blur: ${g.blur}, tint: dynamic(${sw(g.tint.light)}, ${sw(g.tint.dark)}), border: dynamic(${sw(g.border.light)}, ${sw(g.border.dark)}))`);
  }
  L.push('    }', '}', '');
  L.push('/// A colour that follows the trait collection: light value, dark value.');
  L.push('private func dynamic(_ light: (UInt32, Double), _ dark: (UInt32, Double)) -> Color {');
  L.push('    Color(uiColor: UIColor { traits in');
  L.push('        let (rgb, alpha) = traits.userInterfaceStyle == .dark ? dark : light');
  L.push('        return UIColor(');
  L.push('            red: CGFloat((rgb >> 16) & 0xFF) / 255,');
  L.push('            green: CGFloat((rgb >> 8) & 0xFF) / 255,');
  L.push('            blue: CGFloat(rgb & 0xFF) / 255,');
  L.push('            alpha: alpha');
  L.push('        )');
  L.push('    })');
  L.push('}', '');
  return L.join('\n');
}

function renderTs(t, hash) {
  const scheme = (k) => Object.fromEntries(Object.entries(t.colors).map(([n, c]) => [n, css(c[k])]));
  const type = Object.fromEntries(
    Object.entries(t.type).map(([n, s]) => [n, { fontSize: s.size, lineHeight: s.lineHeight, fontWeight: WEIGHTS[s.weight], letterSpacing: s.tracking }]),
  );
  const glass = Object.fromEntries(
    Object.entries(t.glass).map(([n, g]) => [
      n,
      { blur: g.blur, tint: { light: css(g.tint.light), dark: css(g.tint.dark) }, border: { light: css(g.border.light), dark: css(g.border.dark) } },
    ]),
  );
  const out = (name, value) => `export const ${name} = ${JSON.stringify(value, null, 2)} as const;\n`;
  return [
    header('//', '', hash),
    `export const irisSourceSha256 = '${hash}';\n`,
    out('irisColors', { light: scheme('light'), dark: scheme('dark') }),
    out('irisType', type),
    out('irisSpace', t.space),
    out('irisRadius', t.radius),
    out('irisMotion', t.motion),
    out('irisGlass', glass),
  ].join('\n');
}

function renderCss(t, hash) {
  const colors = (k) => Object.entries(t.colors).map(([n, c]) => `  --iris-color-${kebab(n)}: ${css(c[k])};`);
  const glassColors = (k) =>
    Object.entries(t.glass).flatMap(([n, g]) => [
      `  --iris-glass-${kebab(n)}-tint: ${css(g.tint[k])};`,
      `  --iris-glass-${kebab(n)}-border: ${css(g.border[k])};`,
    ]);
  const fixed = [
    '  --iris-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif;',
    ...Object.entries(t.type).flatMap(([n, s]) => [
      `  --iris-type-${kebab(n)}-size: ${s.size}px;`,
      `  --iris-type-${kebab(n)}-line-height: ${s.lineHeight}px;`,
      `  --iris-type-${kebab(n)}-weight: ${WEIGHTS[s.weight]};`,
      `  --iris-type-${kebab(n)}-tracking: ${s.tracking}px;`,
    ]),
    ...Object.entries(t.space).map(([n, v]) => `  --iris-space-${kebab(n)}: ${v}px;`),
    ...Object.entries(t.radius).map(([n, v]) => `  --iris-radius-${kebab(n)}: ${v}px;`),
    ...Object.entries(t.glass).map(([n, g]) => `  --iris-glass-${kebab(n)}-blur: ${g.blur}px;`),
  ];
  const typeClasses = Object.keys(t.type).map(
    (n) =>
      `.iris-type-${kebab(n)} { font-family: var(--iris-font-family); font-size: var(--iris-type-${kebab(n)}-size); ` +
      `line-height: var(--iris-type-${kebab(n)}-line-height); font-weight: var(--iris-type-${kebab(n)}-weight); ` +
      `letter-spacing: var(--iris-type-${kebab(n)}-tracking); }`,
  );
  return [
    header('/*', ' */', hash),
    ':root {',
    '  color-scheme: light dark;',
    ...fixed,
    '}',
    '',
    ':root, [data-theme="light"] {',
    ...colors('light'),
    ...glassColors('light'),
    '}',
    '',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    ...colors('dark').map((l) => `  ${l}`),
    ...glassColors('dark').map((l) => `  ${l}`),
    '  }',
    '}',
    '',
    '[data-theme="dark"] {',
    ...colors('dark'),
    ...glassColors('dark'),
    '}',
    '',
    ...typeClasses,
    '',
  ].join('\n');
}

function renderHtml(t, hash) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const swatches = (theme) =>
    Object.keys(t.colors)
      .map((n) => `<div class="swatch"><span style="background: var(--iris-color-${kebab(n)})"></span><code>${n}</code></div>`)
      .join('\n        ');
  const ramp = Object.entries(t.type)
    .map(([n, s]) => `<p class="iris-type-${kebab(n)}">${esc(n)} <small>${s.size}/${s.lineHeight} · ${s.weight}</small></p>`)
    .join('\n      ');
  const space = Object.entries(t.space)
    .map(([n, v]) => `<div class="row"><code>${n} ${v}</code><i style="width: var(--iris-space-${kebab(n)})"></i></div>`)
    .join('\n      ');
  const radius = Object.entries(t.radius)
    .map(([n, v]) => `<div class="box" style="border-radius: var(--iris-radius-${kebab(n)})"><code>${n} ${v}</code></div>`)
    .join('\n      ');
  const glass = Object.keys(t.glass)
    .map(
      (n) =>
        `<div class="glass" style="backdrop-filter: blur(var(--iris-glass-${kebab(n)}-blur)); -webkit-backdrop-filter: blur(var(--iris-glass-${kebab(n)}-blur)); ` +
        `background: var(--iris-glass-${kebab(n)}-tint); border: 1px solid var(--iris-glass-${kebab(n)}-border)"><code>glass.${n}</code></div>`,
    )
    .join('\n        ');
  return `<!DOCTYPE html>
${header('<!--', ' -->', hash)}<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Iris Tokens</title>
  <link rel="stylesheet" href="../../design/iris/iris.css">
  <style>
    body { margin: 0; background: var(--iris-color-grouped-background); color: var(--iris-color-label); font-family: var(--iris-font-family); }
    main { max-width: 960px; margin: 0 auto; padding: var(--iris-space-xl) var(--iris-space-lg); }
    section { margin-bottom: var(--iris-space-xxxl); }
    h2 { color: var(--iris-color-secondary-label); }
    .themes { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--iris-space-lg); }
    .panel { background: var(--iris-color-grouped-background); color: var(--iris-color-label); padding: var(--iris-space-lg); border-radius: var(--iris-radius-card); border: 1px solid var(--iris-color-separator); }
    .swatch { display: flex; align-items: center; gap: var(--iris-space-sm); padding: var(--iris-space-xs) 0; }
    .swatch span { width: 36px; height: 36px; border-radius: var(--iris-radius-control); border: 1px solid var(--iris-color-separator); }
    code { font-size: 13px; color: var(--iris-color-secondary-label); }
    small { color: var(--iris-color-tertiary-label); font-size: 12px; }
    p { margin: var(--iris-space-xs) 0; }
    .row { display: flex; align-items: center; gap: var(--iris-space-md); }
    .row code { width: 80px; } .row i { height: 12px; background: var(--iris-color-accent); border-radius: 2px; }
    .boxes { display: flex; flex-wrap: wrap; gap: var(--iris-space-md); }
    .box { width: 120px; height: 80px; background: var(--iris-color-secondary-grouped-background); border: 1px solid var(--iris-color-separator); display: grid; place-items: center; }
    .stage { padding: var(--iris-space-xl); border-radius: var(--iris-radius-card); background: linear-gradient(135deg, var(--iris-color-category-show), var(--iris-color-category-movie), var(--iris-color-category-manga)); display: flex; gap: var(--iris-space-lg); flex-wrap: wrap; }
    .glass { padding: var(--iris-space-lg) var(--iris-space-xl); border-radius: var(--iris-radius-sheet); }
  </style>
</head>
<body>
  <main>
    <h1 class="iris-type-large-title">Iris tokens</h1>
    <p class="iris-type-subheadline">Generated from <code>${SOURCE}</code>. Component specimens arrive in I6.</p>
    <section>
      <h2 class="iris-type-title3">Colour</h2>
      <div class="themes">
        <div class="panel" data-theme="light">
        ${swatches('light')}
        </div>
        <div class="panel" data-theme="dark">
        ${swatches('dark')}
        </div>
      </div>
    </section>
    <section>
      <h2 class="iris-type-title3">Type</h2>
      ${ramp}
    </section>
    <section>
      <h2 class="iris-type-title3">Space</h2>
      ${space}
    </section>
    <section>
      <h2 class="iris-type-title3">Radius</h2>
      <div class="boxes">
      ${radius}
      </div>
    </section>
    <section>
      <h2 class="iris-type-title3">Glass fallback</h2>
      <div class="themes">
        <div class="stage" data-theme="light">
        ${glass}
        </div>
        <div class="stage" data-theme="dark">
        ${glass}
        </div>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function generate(raw) {
  let tokens;
  try {
    tokens = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${SOURCE}: invalid JSON — ${e.message}`);
  }
  const t = validate(tokens);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { swift: renderSwift(t, hash), ts: renderTs(t, hash), css: renderCss(t, hash), html: renderHtml(t, hash) };
}

function main(argv, root = ROOT) {
  let out;
  try {
    out = generate(fs.readFileSync(path.join(root, SOURCE), 'utf8'));
  } catch (e) {
    console.error(e.message);
    return 1;
  }
  if (argv.includes('--check')) {
    const stale = Object.values(OUTPUTS).filter((rel, i) => {
      const file = path.join(root, rel);
      return !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== Object.values(out)[i];
    });
    if (stale.length) {
      console.error(`Stale — run \`npm run tokens\`:\n  ${stale.join('\n  ')}`);
      return 1;
    }
    console.log('Iris tokens up to date');
    return 0;
  }
  for (const [key, rel] of Object.entries(OUTPUTS)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out[key]);
    console.log(`wrote ${rel}`);
  }
  return 0;
}

module.exports = { generate, parseColor, main, OUTPUTS, SOURCE };
if (require.main === module) process.exit(main(process.argv.slice(2)));
```

(`OUTPUTS` and the object `generate` returns share the key order `swift, ts, css, html`. That shared order is what makes the `--check` index pairing correct. Keep them in that order.)

- [ ] **Step 4: Run them and watch them pass**

Run: `npx jest scripts/__tests__/iris-tokens.test.ts`
Expected: all tests pass (3 parseColor + 6 generate + 4 validation + 3 main = 16).

- [ ] **Step 5: Review Focus 2 — the real CLI writes nothing on bad input**

Covered by the `main` test "a broken token set exits 1 and writes nothing". Confirm it's among the passing tests in Step 4's output.

- [ ] **Step 6: Commit**

```bash
git add scripts/iris-tokens.js scripts/__tests__/iris-tokens.test.ts
git diff --staged --stat
git commit -m "feat(iris): add the design-token generator

Spec §4.1: one tokens.json renders Swift, TS, CSS and a specimen page,
all-or-nothing, with a --check mode for staleness.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The real token set, generated outputs, staleness test

**Files:**
- Create: `design/iris/tokens.json`
- Create (generated): `apple/Iris/DesignSystem/IrisTokens.swift`, `src/ui/iris/tokens.ts`, `design/iris/iris.css`, `docs/design/iris.html`
- Modify: `package.json` (scripts)
- Modify: `scripts/__tests__/iris-tokens.test.ts` (add the repo staleness test)

**Interfaces:**
- Consumes: `generate`, `main`, `OUTPUTS`, `SOURCE` from Task 1.
- Produces, used by Task 3 and every later UI step: Swift `IrisTokens.Colors.<name>`, `IrisTokens.Typography.<style>` (`TextStyle{font,size,lineHeight,tracking}`), `IrisTokens.Space.<n>`, `IrisTokens.Radius.<n>`, `IrisTokens.Motion.<n>`, `IrisTokens.Glass.<n>` (`GlassFallback{blur,tint,border}`), `IrisTokens.sourceSHA256`. TS `irisColors.{light,dark}`, `irisType`, `irisSpace`, `irisRadius`, `irisMotion`, `irisGlass`. npm scripts `tokens` and `tokens:check`.

- [ ] **Step 1: Write the failing staleness test**

Append to `scripts/__tests__/iris-tokens.test.ts`:

```ts
describe('the committed outputs', () => {
  test('match design/iris/tokens.json (run `npm run tokens` if this fails)', () => {
    const root = path.resolve(__dirname, '../..');
    const out = gen.generate(fs.readFileSync(path.join(root, gen.SOURCE), 'utf8'));
    for (const [key, rel] of Object.entries(gen.OUTPUTS)) {
      const file = path.join(root, rel);
      expect({ file: rel, exists: fs.existsSync(file) }).toEqual({ file: rel, exists: true });
      expect({ file: rel, upToDate: fs.readFileSync(file, 'utf8') === out[key as keyof typeof out] }).toEqual({ file: rel, upToDate: true });
    }
  });
});
```

Run: `npx jest scripts/__tests__/iris-tokens.test.ts -t "committed outputs"`
Expected: FAIL with `ENOENT … design/iris/tokens.json`.

- [ ] **Step 2: Write `design/iris/tokens.json`**

Neutrals use Apple's published system values. Alpha is the trailing two hex digits: 99 = 0.6, 4D = 0.3, 4A = 0.29, 33 = 0.2, 5C = 0.36.

```json
{
  "color": {
    "background":                 { "light": "#FFFFFF",   "dark": "#000000",   "ios": "systemBackground" },
    "groupedBackground":          { "light": "#F2F2F7",   "dark": "#000000",   "ios": "systemGroupedBackground" },
    "secondaryGroupedBackground": { "light": "#FFFFFF",   "dark": "#1C1C1E",   "ios": "secondarySystemGroupedBackground" },
    "label":                      { "light": "#000000",   "dark": "#FFFFFF",   "ios": "label" },
    "secondaryLabel":             { "light": "#3C3C4399", "dark": "#EBEBF599", "ios": "secondaryLabel" },
    "tertiaryLabel":              { "light": "#3C3C434D", "dark": "#EBEBF54D", "ios": "tertiaryLabel" },
    "separator":                  { "light": "#3C3C434A", "dark": "#54545899", "ios": "separator" },
    "fill":                       { "light": "#78788033", "dark": "#7878805C", "ios": "systemFill" },
    "accent":                     { "light": "#007AFF",   "dark": "#0A84FF",   "ios": "systemBlue" },
    "onAccent":                   { "light": "#FFFFFF",   "dark": "#FFFFFF" },
    "destructive":                { "light": "#FF3B30",   "dark": "#FF453A",   "ios": "systemRed" },
    "categoryShow":               { "light": "#AF52DE",   "dark": "#BF5AF2",   "ios": "systemPurple" },
    "categoryMovie":              { "light": "#FF9500",   "dark": "#FF9F0A",   "ios": "systemOrange" },
    "categoryBook":               { "light": "#34C759",   "dark": "#30D158",   "ios": "systemGreen" },
    "categoryComic":              { "light": "#FF2D55",   "dark": "#FF375F",   "ios": "systemPink" },
    "categoryManga":              { "light": "#30B0C7",   "dark": "#40C8E0",   "ios": "systemTeal" }
  },
  "type": {
    "largeTitle":  { "size": 34, "lineHeight": 41, "weight": "bold",     "tracking": 0.4,   "ios": "largeTitle" },
    "title1":      { "size": 28, "lineHeight": 34, "weight": "bold",     "tracking": 0.38,  "ios": "title" },
    "title2":      { "size": 22, "lineHeight": 28, "weight": "bold",     "tracking": -0.26, "ios": "title2" },
    "title3":      { "size": 20, "lineHeight": 25, "weight": "semibold", "tracking": -0.45, "ios": "title3" },
    "headline":    { "size": 17, "lineHeight": 22, "weight": "semibold", "tracking": -0.43, "ios": "headline" },
    "body":        { "size": 17, "lineHeight": 22, "weight": "regular",  "tracking": -0.43, "ios": "body" },
    "callout":     { "size": 16, "lineHeight": 21, "weight": "regular",  "tracking": -0.31, "ios": "callout" },
    "subheadline": { "size": 15, "lineHeight": 20, "weight": "regular",  "tracking": -0.23, "ios": "subheadline" },
    "footnote":    { "size": 13, "lineHeight": 18, "weight": "regular",  "tracking": -0.08, "ios": "footnote" },
    "caption1":    { "size": 12, "lineHeight": 16, "weight": "regular",  "tracking": 0,     "ios": "caption" },
    "caption2":    { "size": 11, "lineHeight": 13, "weight": "regular",  "tracking": 0.06,  "ios": "caption2" }
  },
  "space":  { "xxs": 2, "xs": 4, "sm": 8, "md": 12, "lg": 16, "xl": 20, "xxl": 24, "xxxl": 32 },
  "radius": { "control": 10, "card": 20, "sheet": 32, "pill": 9999 },
  "motion": {
    "snappy": { "response": 0.3, "damping": 0.85 },
    "smooth": { "response": 0.5, "damping": 1.0 },
    "bouncy": { "response": 0.5, "damping": 0.7 }
  },
  "glass": {
    "regular": { "blur": 20, "tint": { "light": "#FFFFFFB3", "dark": "#1E1E1E99" }, "border": { "light": "#FFFFFF4D", "dark": "#FFFFFF1F" } },
    "clear":   { "blur": 12, "tint": { "light": "#FFFFFF59", "dark": "#1E1E1E4D" }, "border": { "light": "#FFFFFF40", "dark": "#FFFFFF14" } }
  }
}
```

(The `ios` names for `title1` and `caption1` are `title` and `caption`, which are SwiftUI's actual `Font.TextStyle` case names.)

- [ ] **Step 3: Add npm scripts and generate**

In `package.json` `"scripts"`, add after `"typecheck"`:

```json
    "tokens": "node scripts/iris-tokens.js",
    "tokens:check": "node scripts/iris-tokens.js --check"
```

Run: `npm run tokens`
Expected: four `wrote …` lines.

- [ ] **Step 4: Run the staleness test, then Review Focus 1**

Run: `npx jest scripts/__tests__/iris-tokens.test.ts`
Expected: PASS, 17 tests.

Then prove it bites: `echo "// edit" >> src/ui/iris/tokens.ts && npx jest scripts/__tests__/iris-tokens.test.ts -t "committed outputs"`
Expected: FAIL naming `src/ui/iris/tokens.ts` with `upToDate: false`. Restore with `npm run tokens`, re-run, and it passes. Also `npm run tokens:check` prints `Iris tokens up to date`.

- [ ] **Step 5: Typecheck the generated TS, run the full suite**

Run: `npm run typecheck && npx jest 2>&1 | tail -4`
Expected: typecheck clean; all suites pass (550 + the 17 new tests = **567**, 53 suites). If the base count differs, the new total must be the old total + 17.

- [ ] **Step 6: Commit**

```bash
git add design/iris/tokens.json apple/Iris/DesignSystem/IrisTokens.swift src/ui/iris/tokens.ts design/iris/iris.css docs/design/iris.html package.json scripts/__tests__/iris-tokens.test.ts
git diff --staged --stat
git commit -m "feat(iris): add the Iris token set and generate every platform's tokens

Neutrals are Apple's system colours (mapped to the dynamic UIKit colours
on iOS); accent is system blue; one tint per category. A jest test fails
if any generated file drifts from tokens.json.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Swift side: unit-test target, hash staleness, dark-mode resolution

**Files:**
- Modify: `apple/project.yml` (add the `IrisTests` target and put it in the scheme)
- Test: `apple/IrisTests/IrisTokensTests.swift`
- Modify: `apple/Iris/App/RootView.swift` (tint the symbol with `IrisTokens.Colors.accent`, so tokens are used by real UI)

**Interfaces:**
- Consumes: `IrisTokens` (Task 2), and `apple/scripts/test.sh` (I0), which runs the `Iris` scheme, now including `IrisTests`.

- [ ] **Step 1: Write the tests**

`apple/IrisTests/IrisTokensTests.swift`:

```swift
import CryptoKit
import SwiftUI
import UIKit
import XCTest
@testable import Iris

final class IrisTokensTests: XCTestCase {
    /// spec §4.1: generated Swift must match tokens.json. The Node generator
    /// can't run here, so compare the embedded hash (plan I1 ruling).
    func testGeneratedSwiftMatchesTokensJSON() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // IrisTests/
            .deletingLastPathComponent() // apple/
            .deletingLastPathComponent() // repo root
        let data = try Data(contentsOf: root.appendingPathComponent("design/iris/tokens.json"))
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(IrisTokens.sourceSHA256, hash, "IrisTokens.swift is stale — run `npm run tokens`")
    }

    /// A dynamic token must really change with the appearance, alpha intact.
    func testDynamicColourResolvesPerAppearance() {
        let tint = UIColor(IrisTokens.Glass.regular.tint)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0

        tint.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light)).getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 1, accuracy: 0.01)
        XCTAssertEqual(a, 0.702, accuracy: 0.01)

        tint.resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark)).getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 30.0 / 255, accuracy: 0.01)
        XCTAssertEqual(a, 0.6, accuracy: 0.01)
    }

    /// iOS-mapped neutrals are the system colours themselves (spec §4.1).
    /// Compared by components: UIColor equality also compares colour spaces.
    func testMappedNeutralIsTheSystemColour() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            XCTAssertEqual(
                rgba(UIColor(IrisTokens.Colors.label).resolvedColor(with: traits)),
                rgba(UIColor.label.resolvedColor(with: traits)),
                "label differs in \(style == .dark ? "dark" : "light")"
            )
        }
    }

    private func rgba(_ c: UIColor) -> [Double] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        c.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a].map { (Double($0) * 1000).rounded() / 1000 }
    }
}
```

- [ ] **Step 2: Add the target to `apple/project.yml`, and watch the tests fail**

Add under `targets:` (after `IrisUITests`):

```yaml
  IrisTests:
    type: bundle.unit-test
    platform: iOS
    sources: [IrisTests]
    dependencies:
      - target: Iris
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.peds24.iris.tests
        GENERATE_INFOPLIST_FILE: YES
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/Iris.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Iris"
        BUNDLE_LOADER: "$(TEST_HOST)"
```

In `schemes.Iris`, add `IrisTests: [test]` under `build.targets`, and `- IrisTests` under `test.targets`.

To see the red, temporarily stash the generated Swift: `mv apple/Iris/DesignSystem/IrisTokens.swift "$TMPDIR/"`. Run `apple/scripts/test.sh`. Expected: compile failure, `cannot find 'IrisTokens' in scope`. Restore it: `mv "$TMPDIR/IrisTokens.swift" apple/Iris/DesignSystem/`.

- [ ] **Step 3: Run the tests and watch them pass**

Run: `apple/scripts/test.sh`
Expected: `✓ All Iris tests passed`. Confirm all 4 app tests ran (3 `IrisTokensTests` + 1 `LaunchTests`): `xcrun xcresulttool get test-results summary --path "$(ls -td apple/DerivedData/Logs/Test/*.xcresult | head -1)" | grep -E '"(passed|failed)Tests"'` → `passedTests : 4`, `failedTests : 0`.

Then prove the hash check bites: add a space inside `design/iris/tokens.json` (e.g. after the first `{`), run `apple/scripts/test.sh` → `testGeneratedSwiftMatchesTokensJSON` fails with "IrisTokens.swift is stale". Revert the edit with `git checkout design/iris/tokens.json`.

- [ ] **Step 4: Use a token in real UI and look at it**

In `apple/Iris/App/RootView.swift`, replace the `ContentUnavailableView(...)` call with the builder form, so the aperture takes the accent token:

```swift
ContentUnavailableView {
    Label("Iris", systemImage: "camera.aperture")
        .foregroundStyle(IrisTokens.Colors.accent)
} description: {
    Text("Schema v\(IrisSchema.version)")
}
```

Then run `apple/scripts/test.sh` (still green) and screenshot light and dark, as in I0 Task 2 Step 7. Expected: the aperture and the "Iris" label in system blue (#007AFF light, #0A84FF dark); "Schema v10" in secondary grey.

- [ ] **Step 5: Commit**

```bash
git add apple/project.yml apple/IrisTests/IrisTokensTests.swift apple/Iris/App/RootView.swift
git diff --staged --stat
git commit -m "test(ios): check Iris tokens are fresh and resolve per appearance

Adds the IrisTests unit-test target: the generated Swift's hash must
match tokens.json, dynamic tokens must change with light/dark, and
mapped neutrals must be the system colours.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Specimen check, docs, merge into `iris`

**Files:**
- Modify: `docs/HANDOFF.md`, `DEVLOG.md`, `apple/README.md`
- Modify (outside repo): `/Users/pedrosh/Desktop/scripts-dictionary.md`

- [ ] **Step 1: Screenshot the specimen in headless Chromium**

Per the user's global CLAUDE.md, use Playwright with headless Chrome, never the Chrome extension. In the session scratchpad:

```bash
cd "$SCRATCH" && npm init -y >/dev/null && npm i playwright@1 >/dev/null && npx playwright install chromium >/dev/null
cat > shot.js <<'EOF'
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const p = await b.newPage({ viewport: { width: 1000, height: 1800 }, colorScheme: scheme });
    await p.goto('file://' + process.argv[2]);
    await p.screenshot({ path: `iris-tokens-${scheme}.png`, fullPage: true });
  }
  await b.close();
})();
EOF
node shot.js "<worktree>/docs/design/iris.html"
```

- [ ] **Step 2: Look at it — Review Focus 5**

Open both PNGs with the Read tool. Expected: the stylesheet loaded (system font, grouped-grey page in light mode, black in dark). The colour section shows a **light panel and a dark panel side by side in both screenshots**; the dark panel's swatches are visibly the dark values. Type ramp from 34pt down to 11pt. Accent-blue space bars. Five radii. Glass cards over a purple→orange→teal gradient. If the dark panel renders light, the nested `[data-theme="dark"]` scoping is broken; fix it in `renderCss` with a failing test first.

- [ ] **Step 3: Docs**

`apple/README.md`, append to **Rules**:

```markdown
- Never hand-edit `Iris/DesignSystem/IrisTokens.swift`. Edit
  `design/iris/tokens.json` and run `npm run tokens` from the repo root.
```

`docs/HANDOFF.md`, in "Iris kicked off", replace the **Status:** paragraph's first sentence with: `**Status:** I0 and I1 done — tokens live in design/iris/tokens.json (npm run tokens regenerates Swift/TS/CSS/specimen; both suites fail on drift).` Keep the rest of the paragraph, but change "Next is I1 (tokens) and I2 (fixtures)" to "Next is I2 (fixtures), then I3".

`DEVLOG.md`, new top entry:

```markdown
## 2026-10-06 — Iris I1: design tokens

- `design/iris/tokens.json` → `scripts/iris-tokens.js` → IrisTokens.swift,
  src/ui/iris/tokens.ts, design/iris/iris.css, docs/design/iris.html.
- **Why hand-rolled, not Style Dictionary**: four small outputs and no
  dependency to keep current; the generator is ~250 lines and tested.
- **Why a hash check in XCTest**: Swift tests can't run Node, so they
  verify the generated file's embedded SHA-256 against tokens.json; jest
  does the full regenerate-and-diff.
- Accent is Apple system blue; category tints are system colours.
```

Scripts dictionary, a new entry after the `iris test.sh` one:

```markdown
---

## iris-tokens.js (Iris design-token generator)

**Location:** repo `~/personal_projects/track-it`, branch `iris`; script at `scripts/iris-tokens.js`.

**Purpose:** Turn `design/iris/tokens.json` (the single source of the Iris look) into Swift, TS, CSS and a specimen page.

**Usage:**
```bash
npm run tokens         # regenerate all four outputs
npm run tokens:check   # exit 1 if any committed output is stale
```

**Behavior:**
- Validates every token first. A bad hex, a missing light/dark, an unknown weight or invalid JSON prints the token's path and exits 1, **writing nothing**.
- Writes `apple/Iris/DesignSystem/IrisTokens.swift`, `src/ui/iris/tokens.ts`, `design/iris/iris.css` and `docs/design/iris.html`, each stamped with the SHA-256 of tokens.json.
- jest (`scripts/__tests__/iris-tokens.test.ts`) and XCTest (`apple/IrisTests`) both fail when the outputs drift.
```

- [ ] **Step 4: Full verification, commit, merge**

```bash
npm run typecheck && npx jest 2>&1 | tail -4 && npm run tokens:check && apple/scripts/test.sh
git add docs/HANDOFF.md DEVLOG.md apple/README.md
git commit -m "docs(iris): record I1 tokens in HANDOFF, DEVLOG and the README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Merge, as in I0: from the main checkout, `git worktree add .claude/worktrees/iris-integration iris`, then in it `git merge --no-ff worktree-iris-tokens -m "Merge worktree-iris-tokens: Iris design tokens (I1)"`. Re-run the full verification on the merged tree (symlink `node_modules` in for jest, then remove the symlink). Then `git worktree remove .claude/worktrees/iris-integration`. Don't push.
