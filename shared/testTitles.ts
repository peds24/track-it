/**
 * Every test title in a jest source file (test.each templates cut at the
 * first `%`/`$`). Coverage of a recorded corpus is checked by title, not by
 * count, so a new test with no matching case fails (I2 review).
 */
export function testTitles(source: string): string[] {
  const titles: string[] = [];
  const re = /\b(?:it|test)(\.each)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    if (m[1]) {
      for (let depth = 1; depth > 0 && i < source.length; i += 1) {
        if (source[i] === '(') depth += 1;
        else if (source[i] === ')') depth -= 1;
      }
      while (source[i] !== '(' && i < source.length) i += 1;
      i += 1;
    }
    const lit = /^\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/.exec(source.slice(i));
    // Unescape (`draft\\'s` in a single-quoted title is `draft's`).
    if (lit) titles.push(lit[2]!.replace(/\\(.)/g, '$1').split(/[%$]/)[0]!.trim());
  }
  return titles;
}

export const normTitle = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
