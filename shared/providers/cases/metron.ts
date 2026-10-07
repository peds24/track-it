import type { FakeResponse, ProviderCase } from '../types';

// Extracted from src/providers/__tests__/metron.test.ts.
const CREDS = { METRON_USERNAME: 'user', METRON_PASSWORD: 'pass' };
const UP = { METRON_USERNAME: 'u', METRON_PASSWORD: 'p' };
const ok = (body: unknown): FakeResponse => ({ body });
const fail: FakeResponse = { status: 500, body: {} };
const empty = ok({ results: [] });
const issue = ok({ id: 50, series: { id: 15, name: 'Saga' } });
const pick = (count = 1) => ({ id: '50', title: 'Saga (2012) #1', category: 'comic', count });
const at = (name: string, call: string, args: unknown[], responses: FakeResponse[] = [], env: Record<string, string> = CREDS): ProviderCase => ({
  name,
  provider: 'metron',
  env,
  call,
  args,
  responses,
});

const ISSUE = {
  id: 7,
  series: { id: 3, name: 'Saga' },
  image: 'https://static.metron.cloud/1.jpg',
  credits: [
    { creator: 'Brian K. Vaughan', role: [{ name: 'Writer' }] },
    { creator: 'Fiona Staples', role: [{ name: 'Artist' }, { name: 'Cover' }] },
  ],
};
const SERIES = { issue_count: 54, year_began: 2012, year_end: null, desc: '<p>Space &amp; war.</p>' };

export const cases: ProviderCase[] = [
  at('requests carry a Basic auth header built from the configured credentials', 'search', ['saga'], [empty]),
  at('search queries the issue endpoint by series_name, per the current Metron API README', 'search', ['Saga'], [empty]),
  at('search fails clearly when credentials are not configured', 'search', ['saga'], [], {}),
  at('search on a blank query never calls the network', 'search', ['   '], [empty]),
  at('search maps issue results to SearchResult, tagged comic', 'search', ['Saga'], [
    ok({ results: [{ id: 50, issue: 'Saga (2012) #1', series: { id: 15, name: 'Saga' } }] }),
  ]),
  at('searchByUpc: with an EAN-5 supplied, concatenates it onto the UPC-A for an exact upc match', 'searchByUpc', ['759606095582', '00111'], [empty]),
  at('searchByUpc: with the EAN-5 skipped, falls back to a upc_starts_with prefix match', 'searchByUpc', ['759606095582'], [empty]),
  at('searchByUpc: an empty-string EAN-5 is treated the same as skipped', 'searchByUpc', ['759606095582', ''], [empty]),
  at('hydrate for a real match fetches the issue then its series for a real issue_count', 'hydrate', [pick()], [issue, ok({ issue_count: 66, year_end: 2024 })]),
  at('hydrate falls back to the given count when the series has no issue_count', 'hydrate', [pick(3)], [issue, ok({ year_end: 2020 })]),
  at('hydrate reads a null year_end as still-running — ongoing overrides issue_count', 'hydrate', [pick()], [issue, ok({ issue_count: 66, year_end: null })]),
  at('hydrate reads a real year_end as completed', 'hydrate', [pick()], [issue, ok({ issue_count: 66, year_end: 2024 })]),
  at('hydrate for an unmatched (hand-typed) title never calls the network', 'hydrate', [{ id: 'metron', title: 'Saga', category: 'comic', count: 5 }], [], {}),
  at('hydrate metaLine/blurb (A17): a completed series gets a closed year range and "Completed"', 'hydrate', [pick()], [
    issue,
    ok({ issue_count: 66, year_began: 2012, year_end: 2024, publisher: { name: 'Image Comics' }, desc: 'Romeo and Juliet meets Star Wars meets Game of Thrones.' }),
  ]),
  at('hydrate metaLine/blurb (A17): an ongoing series gets an open year range and "Ongoing"', 'hydrate', [pick()], [
    issue,
    ok({ issue_count: 72, year_began: 2012, year_end: null, publisher: { name: 'Image Comics' } }),
  ]),
  at('hydrate metaLine/blurb (A17): missing publisher/desc are simply omitted, not blank entries', 'hydrate', [pick()], [issue, ok({ issue_count: 66, year_end: 2024 })]),
  at('A22/A24 metadata: search hits carry cover date year and cover image', 'search', ['Saga'], [
    ok({ results: [{ id: 7, issue: 'Saga (2012) #1', series: { id: 3, name: 'Saga' }, cover_date: '2012-03-01', image: 'https://static.metron.cloud/1.jpg' }] }),
  ], UP),
  at('A22/A24 metadata: details reads the issue cover and writer, and the series description and year', 'details', ['7'], [ok(ISSUE), ok(SERIES)], UP),
  at('A22/A24 metadata: hydrate carries the same metadata and a cleaned blurb', 'hydrate', [{ id: '7', title: 'Saga (2012) #1', category: 'comic', count: 1 }], [ok(ISSUE), ok(SERIES)], UP),
  at('A22/A24 metadata: A26: details carries the series genres', 'details', ['7'], [ok(ISSUE), ok({ ...SERIES, genres: [{ id: 1, name: 'Science Fiction' }, { id: 2, name: 'Fantasy' }] })], UP),
  at('A22/A24 metadata: details returns null when credentials are missing', 'details', ['7'], [], { METRON_PASSWORD: 'p' }),
  at('A25 unitAt: looks up the series from the stored issue, then the issue by number', 'unitAt', ['7', 5], [
    ok({ id: 7, series: { id: 3, name: 'Saga' } }),
    ok({ results: [{ id: 12, number: '5', image: 'https://static.metron.cloud/5.jpg', series: { id: 3, name: 'Saga' } }] }),
  ]),
  at('A25 unitAt: null when the series has no issue with that number yet', 'unitAt', ['7', 99], [ok({ id: 7, series: { id: 3, name: 'Saga' } }), empty]),
  at('A25 unitAt: null rather than throwing when the lookup fails', 'unitAt', ['7', 5], [fail]),

  // --- Iris parity ---
  at('Iris parity: Basic auth of a non-ASCII password', 'search', ['saga'], [empty], { METRON_USERNAME: 'jöe', METRON_PASSWORD: 'pässwörd€' }),
  at('Iris parity: Basic auth of an emoji password (UTF-16 surrogates encoded one by one)', 'search', ['saga'], [empty], { METRON_USERNAME: 'u', METRON_PASSWORD: 'p😀' }),
  at('Iris parity: search encodes the series name', 'search', ['Spider-Man & Venom: Ça (2018)'], [empty]),
  at('Iris parity: search on a network error throws', 'search', ['Saga'], [{ networkError: true }]),
  at('Iris parity: search on a 500 throws with the status', 'search', ['Saga'], [fail]),
  at('Iris parity: hydrate on a failed series lookup throws', 'hydrate', [pick()], [issue, fail]),
  at('Iris parity: details on a network error is null', 'details', ['7'], [{ networkError: true }]),
  at('Iris parity: a writer credited twice is named once; "Story" counts as writing', 'details', ['7'], [
    ok({
      id: 7,
      series: { id: 3, name: 'Saga' },
      credits: [
        { creator: 'A', role: [{ name: 'Writer' }] },
        { creator: 'B', role: [{ name: 'Story' }] },
        { creator: 'A', role: [{ name: 'writer' }] },
        { creator: '', role: [{ name: 'Writer' }] },
        { role: [{ name: 'Writer' }] },
      ],
    }),
    ok({ year_began: 2012 }),
  ]),
  at('Iris parity: a series ending the year it began reads as one year', 'hydrate', [pick()], [issue, ok({ issue_count: 1, year_began: 2012, year_end: 2012 })]),
  at('Iris parity: loose JSON — a series with no name, an issue with a null image', 'unitAt', ['7', 5], [
    ok({ id: 7, series: { id: 3 } }),
    ok({ results: [{ id: 12, number: '5', image: null }] }),
  ]),
];
