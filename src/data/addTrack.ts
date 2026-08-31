import { createSeriesTrack, createStandaloneTrack } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { SearchResult, SeriesDraft } from '@/providers/types';

/** Identifies the track just created, so a caller can act on it immediately
 * (e.g. starting it) without a second query to find what was just inserted. */
export type CreatedTrack = { kind: 'series' | 'entry'; id: string };

export async function addTrack(
  db: SqlDriver,
  input: {
    title: string;
    category: Category;
    count: number;
    ongoing?: boolean;
    /**
     * A9: the search/scan result the user tapped, if any. Lets a real
     * provider fetch fresh data keyed off a real external ID (a true episode
     * count, a true issue count) and record where the track came from.
     * Omitted for a hand-typed title, which still goes through the exact same
     * path — every provider treats a result whose `id` equals its own `id` as
     * "no real match", the same sentinel `ManualProvider` always ignored.
     */
    match?: SearchResult;
    /**
     * A10: the entry to start `in_progress` at creation, parsed from a
     * trailing volume/issue number in the title before this was called (e.g.
     * "Saga #12" -> 12). Ignored for a standalone category and for an
     * out-of-range ordinal — `createSeriesTrack` is the one place that
     * decides whether it actually applies, since only it knows the draft's
     * final entry count.
     */
    startAtOrdinal?: number;
    /**
     * A11: a draft the caller already hydrated and had the user confirm (or
     * override) — used exactly as given, with no second `hydrate()` call.
     * Only meaningful for a series category; ignored for a standalone one.
     */
    draft?: SeriesDraft;
    /**
     * A16: overrides the category's default series/standalone routing —
     * used only for a comic collection, which tracks as a standalone item
     * (like a book) despite `comic`'s category having a series unit label
     * for the single-issue path.
     */
    standalone?: boolean;
    /**
     * A16: overrides the registry-derived provider id recorded as
     * `externalSource` for a standalone save. Needed specifically when the
     * match didn't come from the category's own registered provider — a
     * comic collection matches via Google Books, but `comic`'s registry
     * entry stays Metron, the single-issue default (A9/A14).
     */
    externalSource?: string;
  },
  now: string,
): Promise<CreatedTrack> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('A track needs a title');

  const provider = providerFor(input.category);

  // Standalone categories have no container and no entries to generate (D1).
  // A search/scan result only ever confirms a title (D5) — there is no fake
  // series wrapper to hydrate, so this goes straight to the standalone path,
  // recording where the title came from when a real match was picked. The
  // caller (never `addTrack` itself) is the only source of a standalone
  // `match`, so its mere presence already means "real" — no sentinel-id
  // check needed here the way the series branch below needs one.
  if (unitLabelFor(input.category) === null || input.standalone === true) {
    const matched = input.match !== undefined;
    const id = await createStandaloneTrack(
      db,
      {
        title,
        category: input.category as 'book' | 'movie' | 'comic',
        externalSource: matched ? (input.externalSource ?? provider.id) : undefined,
        externalId: matched ? input.match!.id : undefined,
      },
      now,
    );
    return { kind: 'entry', id };
  }

  // One category, one provider — never a global search (D10). The typed
  // count/ongoing state always rides along even when a real result was
  // picked: a catalogue hit only ever confirms a title, never a count (see
  // GoogleBooksProvider) — a provider that *can* fetch a real total (TMDB,
  // Metron) decides for itself whether to trust this or override it.
  // `title` (already trimmed, and already stripped of a comic/manga volume/
  // issue number by the caller — A10) always wins over `input.match.title`:
  // the two agree in practice, since picking a result sets the title field to
  // exactly that result's title, but only `title` reflects the A10 strip.
  const result: SearchResult = input.match
    ? { ...input.match, title, count: input.count, ongoing: input.ongoing === true }
    : { id: provider.id, title, category: input.category, count: input.count, ongoing: input.ongoing === true };
  const draft = input.draft ?? (await provider.hydrate(result));

  const id = await createSeriesTrack(db, draft, now, input.startAtOrdinal);
  return { kind: 'series', id };
}
