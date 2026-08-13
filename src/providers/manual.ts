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
