import type { Category, Entry } from '@/domain/types';

/**
 * A22: display text for the detail and confirm screens. Pure — provider
 * payloads are cleaned here once, at the boundary, and again at render as a
 * defence for anything an older build stored raw.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  eacute: 'é',
  egrave: 'è',
  aacute: 'á',
  oacute: 'ó',
  uacute: 'ú',
  iacute: 'í',
  ntilde: 'ñ',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  ccedil: 'ç',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Catalogue descriptions arrive as HTML fragments (Google Books, Metron,
 * AniList) — this is what the detail screen showed raw before A22. */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Whitelist of real HTML tags (case-insensitive, with attributes allowed)
  const tagWhitelist = 'a|abbr|b|big|blockquote|br|center|cite|code|dd|del|div|dl|dt|em|font|h[1-6]|hr|i|img|ins|li|ol|p|pre|s|small|span|strike|strong|sub|sup|table|tbody|td|th|thead|tr|u|ul';
  const stripped = raw
    .replace(new RegExp(`<br(?:\\s[^<>]*)?\\s*/?\\s*>`, 'gi'), '\n')
    .replace(new RegExp(`</(p|div|li|h[1-6])\\s*>`, 'gi'), '\n\n')
    .replace(new RegExp(`</?(?:${tagWhitelist})(?:\\s[^<>]*)?/?>`, 'gi'), '');
  const text = decodeEntities(stripped)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}

/** "2020-09-15" or "2018" -> "2020"/"2018"; anything shorter is not a year. */
export function yearOf(date: string | null | undefined): string | null {
  const match = date ? /^\d{4}/.exec(date) : null;
  return match ? match[0] : null;
}

export function initialsOf(title: string): string {
  const words = title.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function creatorLine(category: Category, creator: string | null): string | null {
  if (!creator) return null;
  if (category === 'show') return `Created by ${creator}`;
  if (category === 'movie') return `Directed by ${creator}`;
  return `By ${creator}`;
}

export type Timeline = { addedAt: string; startedAt: string | null; finishedAt: string | null };

/** Derived from unit timestamps at read time (D3) — nothing here is stored. */
export function timelineOf(
  addedAt: string,
  units: readonly Pick<Entry, 'status' | 'startedAt' | 'finishedAt'>[],
): Timeline {
  let startedAt: string | null = null;
  let finishedAt: string | null = null;
  for (const u of units) {
    if (u.startedAt !== null && (startedAt === null || u.startedAt < startedAt)) startedAt = u.startedAt;
    if (u.finishedAt !== null && (finishedAt === null || u.finishedAt > finishedAt)) finishedAt = u.finishedAt;
  }
  const allDone = units.length > 0 && units.every((u) => u.status === 'done');
  return { addedAt, startedAt, finishedAt: allDone ? finishedAt : null };
}

const DAY_MS = 86_400_000;

/** Midnight of the device-local calendar day an instant falls on. */
function localMidnight(iso: string): number {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole calendar days between two instants, on the device's own calendar —
 * 23:30 tonight to 00:30 tomorrow is one day, and nothing west of UTC shifts
 * an evening into tomorrow. `round` absorbs a DST day being 23 or 25 hours.
 */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((localMidnight(toIso) - localMidnight(fromIso)) / DAY_MS));
}

export function formatDuration(days: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (days < 1) return 'less than a day';
  if (days < 14) return plural(days, 'day');
  if (days < 60) return plural(Math.round(days / 7), 'week');
  if (days < 730) return plural(Math.round(days / 30), 'month');
  return plural(Math.round(days / 365), 'year');
}

export function formatRelative(iso: string, nowIso: string): string {
  const days = daysBetween(iso, nowIso);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${formatDuration(days)} ago`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string): string {
  // Local getters: a date is read on the user's calendar, not UTC's.
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

export function activityLine(category: Category, timeline: Timeline, nowIso: string): string | null {
  if (timeline.finishedAt !== null) {
    return `Finished in ${formatDuration(daysBetween(timeline.startedAt ?? timeline.addedAt, timeline.finishedAt))}`;
  }
  if (timeline.startedAt !== null) {
    const verb = READ_CATEGORIES.includes(category) ? 'Reading' : 'Watching';
    return `${verb} for ${formatDuration(daysBetween(timeline.startedAt, nowIso))}`;
  }
  return null;
}
