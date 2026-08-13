import type { Category } from '@/domain/types';
import { ManualProvider } from '@/providers/manual';
import type { MetadataProvider } from '@/providers/types';

const manual = new ManualProvider();

/**
 * Resolution is per category (D10), never global. Registering a catalogue
 * provider for one category touches no other path.
 */
const REGISTRY: Partial<Record<Category, MetadataProvider>> = {};

export function providerFor(category: Category): MetadataProvider {
  return REGISTRY[category] ?? manual;
}
