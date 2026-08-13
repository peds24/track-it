import type { Category, UnitLabel } from '@/domain/types';
import type { MetadataProvider, SearchResult, SeriesDraft } from '@/providers/types';

const UNIT_LABEL_BY_CATEGORY: Record<Category, UnitLabel | null> = {
  show: 'episode',
  comic: 'issue',
  manga: 'volume',
  book: null,
  movie: null,
};

/** null means the category is a standalone entry with no container (D1). */
export function unitLabelFor(category: Category): UnitLabel | null {
  return UNIT_LABEL_BY_CATEGORY[category];
}

const DISPLAY: Record<UnitLabel, string> = {
  episode: 'Episode',
  issue: 'Issue',
  volume: 'Volume',
};

/** Upper bound on generated entries — far above any real series, far below a freeze. */
export const MAX_UNITS = 5000;

export class ManualProvider implements MetadataProvider {
  readonly id = 'manual';

  /** No catalogue in v1 (D5), so there is nothing to search. */
  async search(_query: string): Promise<SearchResult[]> {
    return [];
  }

  async hydrate(result: SearchResult): Promise<SeriesDraft> {
    if (result.count < 1) {
      throw new Error('A track must have at least 1 unit');
    }
    // Validated here rather than on the Add screen so every caller is covered.
    // A fractional count silently truncates, and a mistyped huge one issues that
    // many INSERTs in a single transaction — unrecoverable with no delete UI.
    if (!Number.isInteger(result.count)) {
      throw new Error('A unit count must be a whole number');
    }
    if (result.count > MAX_UNITS) {
      throw new Error(`A track cannot have more than ${MAX_UNITS} units`);
    }

    const unitLabel = unitLabelFor(result.category);
    if (unitLabel === null) {
      throw new Error(`${result.category} is a standalone track and has no entries to generate`);
    }

    return {
      title: result.title,
      mediaType: result.category as SeriesDraft['mediaType'],
      unitLabel,
      entries: Array.from({ length: result.count }, (_, i) => ({
        ordinal: i + 1,
        title: `${DISPLAY[unitLabel]} ${i + 1}`,
      })),
    };
  }
}
