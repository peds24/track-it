import type { Category } from '@/domain/types';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { ManualProvider } from '@/providers/manual';
import { MetronProvider } from '@/providers/metron';
import { TmdbProvider } from '@/providers/tmdb';
import type { MetadataProvider } from '@/providers/types';

const manual = new ManualProvider();

/**
 * Resolution is per category (D10), never global. Registering a catalogue
 * provider for one category touches no other path (A9 fulfils D5): Google
 * Books answers for `book`/`manga` (both ISBN-barcode media, one instance
 * each — see GoogleBooksProvider), Metron for `comic` alone, and TMDB for
 * `show`/`movie`. A category with no registered provider — none currently,
 * kept only as a safety net — still falls back to `ManualProvider`, and so
 * does any provider call that turns out to have no real catalogue match.
 */
const REGISTRY: Partial<Record<Category, MetadataProvider>> = {
  book: new GoogleBooksProvider('book'),
  manga: new GoogleBooksProvider('manga'),
  comic: new MetronProvider(),
  show: new TmdbProvider('show'),
  movie: new TmdbProvider('movie'),
};

export function providerFor(category: Category): MetadataProvider {
  return REGISTRY[category] ?? manual;
}
