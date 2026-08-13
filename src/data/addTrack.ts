import { createSeriesTrack, createStandaloneTrack } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';

export async function addTrack(
  db: SqlDriver,
  input: { title: string; category: Category; count: number; ongoing?: boolean },
  now: string,
): Promise<void> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('A track needs a title');

  // Standalone categories have no container and no entries to generate (D1).
  if (unitLabelFor(input.category) === null) {
    await createStandaloneTrack(db, { title, category: input.category as 'book' | 'movie' }, now);
    return;
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

  await createSeriesTrack(db, draft, now);
}
