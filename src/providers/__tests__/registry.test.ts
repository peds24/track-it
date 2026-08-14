import { GoogleBooksProvider } from '@/providers/googleBooks';
import { MetronProvider } from '@/providers/metron';
import { providerFor } from '@/providers/registry';
import { TmdbProvider } from '@/providers/tmdb';

// A9 fulfils D5: one real provider per category, resolved per category (D10),
// never a global search.
test('book and manga resolve to Google Books', () => {
  expect(providerFor('book')).toBeInstanceOf(GoogleBooksProvider);
  expect(providerFor('manga')).toBeInstanceOf(GoogleBooksProvider);
});

test('comic resolves to Metron', () => {
  expect(providerFor('comic')).toBeInstanceOf(MetronProvider);
});

test('show and movie resolve to TMDB', () => {
  expect(providerFor('show')).toBeInstanceOf(TmdbProvider);
  expect(providerFor('movie')).toBeInstanceOf(TmdbProvider);
});

test('registering a category does not change what any other category resolves to', () => {
  // Guards against a shared mutable instance leaking category-specific state
  // (GoogleBooksProvider/TmdbProvider each fix their category at construction).
  expect(providerFor('book')).not.toBe(providerFor('manga'));
  expect(providerFor('show')).not.toBe(providerFor('movie'));
});
