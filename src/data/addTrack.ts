import { createSeriesTrack, createStandaloneTrack } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { SearchResult } from '@/providers/types';

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
  },
  now: string,
): Promise<CreatedTrack> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('A track needs a title');

  const provider = providerFor(input.category);

  // Standalone categories have no container and no entries to generate (D1).
  // A search/scan result only ever confirms a title (D5) — there is no fake
  // series wrapper to hydrate, so this goes straight to the standalone path,
  // recording where the title came from when a real match was picked.
  if (unitLabelFor(input.category) === null) {
    const matched = input.match && input.match.id !== provider.id;
    const id = await createStandaloneTrack(
      db,
      {
        title,
        category: input.category as 'book' | 'movie',
        externalSource: matched ? provider.id : undefined,
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
  const result: SearchResult = input.match
    ? { ...input.match, count: input.count, ongoing: input.ongoing === true }
    : { id: provider.id, title, category: input.category, count: input.count, ongoing: input.ongoing === true };
  const draft = await provider.hydrate(result);

  const id = await createSeriesTrack(db, draft, now);
  return { kind: 'series', id };
}
