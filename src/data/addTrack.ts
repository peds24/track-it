import { createSeriesTrack, createStandaloneTrack } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';

/** Identifies the track just created, so a caller can act on it immediately
 * (e.g. starting it) without a second query to find what was just inserted. */
export type CreatedTrack = { kind: 'series' | 'entry'; id: string };

export async function addTrack(
  db: SqlDriver,
  input: { title: string; category: Category; count: number; ongoing?: boolean },
  now: string,
): Promise<CreatedTrack> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('A track needs a title');

  // Standalone categories have no container and no entries to generate (D1).
  if (unitLabelFor(input.category) === null) {
    const id = await createStandaloneTrack(
      db,
      { title, category: input.category as 'book' | 'movie' },
      now,
    );
    return { kind: 'entry', id };
  }

  // One category, one provider — never a global search (D10).
  const provider = providerFor(input.category);
  const draft = await provider.hydrate({
    id: provider.id,
    title,
    category: input.category,
    count: input.count,
    ongoing: input.ongoing === true,
  });

  const id = await createSeriesTrack(db, draft, now);
  return { kind: 'series', id };
}
