import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type Outputs = Record<'mark' | 'light' | 'dark' | 'tinted' | 'launchLight' | 'launchDark', string>;
type Gen = {
  generate(markRaw: string, tokensRaw: string): Outputs;
  main(argv: string[], root?: string): number;
  OUTPUTS: Record<keyof Outputs, string>;
  SOURCES: { mark: string; tokens: string };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gen: Gen = require('../iris-mark');

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const markRaw = read('design/iris/mark.json');
const tokensRaw = read('design/iris/tokens.json');
const tokens = JSON.parse(tokensRaw);
const out = gen.generate(markRaw, tokensRaw);

/** The fill of each blade path, in order. */
const bladeFills = (svg: string) => [...svg.matchAll(/<path [^>]*fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]);
const grey = (hex: string) => parseInt(hex.slice(1, 3), 16) / 255;

describe('iris mark', () => {
  test('the committed SVGs are up to date', () => {
    for (const [key, rel] of Object.entries(gen.OUTPUTS)) expect([rel, read(rel)]).toEqual([rel, out[key as keyof Outputs]]);
  });

  test('six blades, light from the light token values, dark from the dark ones', () => {
    const light = bladeFills(out.light);
    const dark = bladeFills(out.dark);
    expect(light).toHaveLength(6);
    expect(light[0]).toBe(tokens.color.accentFill.light.toUpperCase());
    expect(light[1]).toBe(tokens.color.categoryShow.light.toUpperCase());
    expect(light[5]).toBe(tokens.color.categoryManga.light.toUpperCase());
    expect(dark[0]).toBe(tokens.color.accent.dark.toUpperCase());
    expect(dark[1]).toBe(tokens.color.categoryShow.dark.toUpperCase());
    expect(bladeFills(out.launchLight)).toEqual(light);
    expect(bladeFills(out.launchDark)).toEqual(dark);
  });

  test('a token change reaches the mark', () => {
    const changed = JSON.parse(tokensRaw);
    changed.color.categoryBook.light = '#123456';
    expect(bladeFills(gen.generate(markRaw, JSON.stringify(changed)).light)[4]).toBe('#123456');
  });

  test('tinted blades are greys at least 12% apart, so the aperture survives the tint', () => {
    const fills = bladeFills(out.tinted);
    expect(fills).toHaveLength(6);
    for (const f of fills) expect(f.slice(1, 3)).toBe(f.slice(3, 5));
    const levels = fills.map(grey);
    for (let i = 0; i < levels.length; i++)
      for (let j = i + 1; j < levels.length; j++) expect(Math.abs(levels[i] - levels[j])).toBeGreaterThanOrEqual(0.12);
  });

  test('icons are opaque full-bleed squares; the mark and launch marks have no background', () => {
    for (const key of Object.keys(gen.OUTPUTS) as (keyof Outputs)[]) expect(out[key]).toContain('viewBox="0 0 1024 1024"');
    expect(out.light).toContain('<rect width="1024" height="1024" fill="#FFFFFF"/>');
    expect(out.dark).toContain('<rect width="1024" height="1024" fill="#000000"/>');
    expect(out.tinted).toContain('<rect width="1024" height="1024" fill="#000000"/>');
    for (const key of ['mark', 'launchLight', 'launchDark'] as const) expect(out[key]).not.toContain('<rect');
  });

  test('every output names its sources by hash', () => {
    const hash = (s: string) => require('crypto').createHash('sha256').update(s).digest('hex');
    for (const svg of Object.values(out)) expect(svg).toContain(`mark.json ${hash(markRaw)}, tokens.json ${hash(tokensRaw)}`);
  });

  test('rejects a blade colour that names no token', () => {
    const bad = JSON.parse(markRaw);
    bad.order[2] = 'categoryNope';
    expect(() => gen.generate(JSON.stringify(bad), tokensRaw)).toThrow('mark.json: order[2] names no colour token "categoryNope"');
  });

  test('--check fails on a stale output and passes once written', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-mark-'));
    for (const rel of Object.values(gen.SOURCES)) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
    }
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(gen.main(['--check'], tmp)).toBe(1);
    expect(gen.main([], tmp)).toBe(0);
    expect(gen.main(['--check'], tmp)).toBe(0);
    err.mockRestore();
    log.mockRestore();
  });
});
