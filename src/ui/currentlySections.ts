import { Ionicons } from '@expo/vector-icons';
import type { TrackSummary } from '@/data/trackRepo';
import type { Category } from '@/domain/types';

export type CurrentlySection = {
  category: Category;
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
  data: readonly TrackSummary[];
  count: number;
  collapsed: boolean;
};

const CATEGORY_ORDER: readonly {
  category: Category;
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { category: 'show', title: 'Shows', iconName: 'tv-outline' },
  { category: 'movie', title: 'Movies', iconName: 'film-outline' },
  { category: 'book', title: 'Books', iconName: 'book-outline' },
  { category: 'comic', title: 'Comics', iconName: 'sparkles-outline' },
  { category: 'manga', title: 'Manga', iconName: 'library-outline' },
];

/**
 * A21: groups Currently's tracks by category, in a fixed display order,
 * keeping each section's own most-recently-advanced ordering (trackRepo's
 * own sort) intact — one section per category that actually has something
 * in it. A collapsed category keeps its `count` (for the header badge) but
 * empties `data`, so `SectionList` renders nothing under it without losing
 * track of how many rows it's hiding.
 */
export function currentlySections(
  tracks: readonly TrackSummary[],
  collapsedCategories: ReadonlySet<Category>,
): CurrentlySection[] {
  return CATEGORY_ORDER.map(({ category, title, iconName }) => {
    const data = tracks.filter((t) => t.category === category);
    const collapsed = collapsedCategories.has(category);
    return { category, title, iconName, data: collapsed ? [] : data, count: data.length, collapsed };
  }).filter((s) => s.count > 0);
}
