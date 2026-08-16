import type { Category } from '@/domain/types';
import { AnilistProvider } from '@/providers/anilist';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { ManualProvider } from '@/providers/manual';
import { MetronProvider } from '@/providers/metron';
import { TmdbProvider } from '@/providers/tmdb';
import type { MetadataProvider } from '@/providers/types';

const manual = new ManualProvider();

/**
 * Resolution is per category (D10), never global. Registering a catalogue
 * provider for one category touches no other path (A9 fulfils D5; A11 swaps
 * manga to AniList): Google Books answers `book` alone now — a single hit
 * can never reveal a manga series' total volume count, which is exactly
 * what AniList (manga) and Metron (comic) can. TMDB answers `show`/`movie`.
 * A category with no registered provider — none currently, kept only as a
 * safety net — still falls back to `ManualProvider`, and so does any
 * provider call that turns out to have no real catalogue match.
 */
const REGISTRY: Partial<Record<Category, MetadataProvider>> = {
  book: new GoogleBooksProvider('book'),
  manga: new AnilistProvider(),
  comic: new MetronProvider(),
  show: new TmdbProvider('show'),
  movie: new TmdbProvider('movie'),
};

export function providerFor(category: Category): MetadataProvider {
  return REGISTRY[category] ?? manual;
}
