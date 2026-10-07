export type ProviderName =
  | 'tmdb-show' | 'tmdb-movie'
  | 'google-books-book' | 'google-books-manga' | 'google-books-comic'
  | 'metron' | 'anilist' | 'manual';
export type KeyName = 'TMDB_API_KEY' | 'GOOGLE_BOOKS_API_KEY' | 'METRON_USERNAME' | 'METRON_PASSWORD';
export type FakeResponse = { status?: number; body?: unknown } | { networkError: true };
/** One provider call against canned HTTP responses (Iris I5). */
export type ProviderCase = {
  name: string;
  provider?: ProviderName;
  env?: Partial<Record<KeyName, string>>;
  call: string;
  args: unknown[];
  responses?: FakeResponse[];
};
