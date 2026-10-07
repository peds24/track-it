import { AnilistProvider } from '@/providers/anilist';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { googleBooksImage, httpsUrl, sharpCoverUrl, tmdbImage } from '@/providers/images';
import { generateEntries, ManualProvider, unitLabelFor } from '@/providers/manual';
import { MetronProvider } from '@/providers/metron';
import { providerFor, providerForSource } from '@/providers/registry';
import { seasonBreakdown, sumEpisodeCount, TmdbProvider } from '@/providers/tmdb';
import type { MetadataProvider } from '@/providers/types';
import type { ProviderName } from './types';

export function makeProvider(name: ProviderName): MetadataProvider & Record<string, unknown> {
  switch (name) {
    case 'tmdb-show': return new TmdbProvider('show') as never;
    case 'tmdb-movie': return new TmdbProvider('movie') as never;
    case 'google-books-book': return new GoogleBooksProvider('book') as never;
    case 'google-books-manga': return new GoogleBooksProvider('manga') as never;
    case 'google-books-comic': return new GoogleBooksProvider('comic') as never;
    case 'metron': return new MetronProvider() as never;
    case 'anilist': return new AnilistProvider() as never;
    case 'manual': return new ManualProvider() as never;
  }
}

/** What a resolved provider is, as data both platforms can report. */
const describe = (p: MetadataProvider | null) =>
  p === null ? null : { id: p.id, category: ((p as unknown as { category?: string }).category ?? null) };

/* eslint-disable @typescript-eslint/no-explicit-any */
export const pureCalls: Record<string, (...args: any[]) => unknown> = {
  sumEpisodeCount,
  seasonBreakdown,
  httpsUrl,
  tmdbImage,
  googleBooksImage,
  sharpCoverUrl,
  unitLabelFor,
  generateEntries,
  providerFor: (category) => describe(providerFor(category)),
  providerForSource: (source, category) => describe(providerForSource(source, category)),
};
