import type { FakeResponse, ProviderCase } from '../types';

// Extracted from src/providers/__tests__/anilist.test.ts. AniList is keyless,
// so every case runs with an empty env; requests record the parsed GraphQL
// body, so Swift must send the exact `query` text.
const ok = (body: unknown): FakeResponse => ({ body });
const fail: FakeResponse = { status: 500, body: {} };
const media = (m: Record<string, unknown>) => ok({ data: { Media: m } });
const page = (hits: unknown[]) => ok({ data: { Page: { media: hits } } });
const pick = (id: string, title: string, count = 1) => ({ id, title, category: 'manga', count });
const at = (name: string, call: string, args: unknown[], responses: FakeResponse[] = []): ProviderCase => ({
  name,
  provider: 'anilist',
  env: {},
  call,
  args,
  responses,
});

const STAFF = {
  edges: [
    { role: 'Art', node: { name: { full: 'Someone Else' } } },
    { role: 'Story & Art', node: { name: { full: 'Kentaro Miura' } } },
  ],
};

export const cases: ProviderCase[] = [
  at('search posts a GraphQL query and maps hits to SearchResult, tagged manga', 'search', ['Monster'], [
    page([{ id: 30001, title: { romaji: 'MONSTER', english: 'Monster' } }]),
  ]),
  at('search falls back to the romaji title when there is no english one', 'search', ['x'], [page([{ id: 1, title: { romaji: 'Only Romaji' } }])]),
  at('search on a blank query never calls the network', 'search', ['   '], [ok({})]),
  at('hydrate for a real match reads volumes and a FINISHED status as completed', 'hydrate', [pick('30001', 'Monster')], [
    media({ volumes: 18, chapters: 162, status: 'FINISHED' }),
  ]),
  at('hydrate falls back to chapters when a manga has no separate volume count', 'hydrate', [pick('1', 'One-shot-ish')], [
    media({ volumes: null, chapters: 42, status: 'FINISHED' }),
  ]),
  at('hydrate reads RELEASING as ongoing, ignoring whatever count came back', 'hydrate', [pick('2', 'One Piece')], [
    media({ volumes: 12, chapters: 100, status: 'RELEASING' }),
  ]),
  at('hydrate for an unmatched (hand-typed) title never calls the network', 'hydrate', [pick('anilist', 'Some Manga', 5)]),
  at('hydrate metaLine/blurb (A17): a finished manga gets a closed year range, a volume count, and "Completed"', 'hydrate', [pick('30001', 'Monster')], [
    media({
      volumes: 18,
      chapters: 162,
      status: 'FINISHED',
      description: 'Dr. Tenma sets out on a journey.<br><br>Years later...',
      startDate: { year: 1994 },
      endDate: { year: 2001 },
    }),
  ]),
  at('hydrate metaLine/blurb (A17): an ongoing manga gets an open year range and "Ongoing"', 'hydrate', [pick('2', 'One Piece')], [
    media({ volumes: 12, status: 'RELEASING', startDate: { year: 2018 } }),
  ]),
  at('hydrate metaLine/blurb (A17): falls back to a chapter-labelled count when there is no volume count', 'hydrate', [pick('1', 'One-shot-ish')], [
    media({ chapters: 42, status: 'FINISHED' }),
  ]),
  at('A22/A24 metadata: search hits carry the story author, start year and cover', 'search', ['Berserk'], [
    page([{ id: 1, title: { english: 'Berserk' }, startDate: { year: 1989 }, coverImage: { large: 'https://a/m.jpg' }, staff: STAFF }]),
  ]),
  at('A22/A24 metadata: details maps cover, author, cleaned description, and year', 'details', ['1'], [
    media({ description: 'Guts.<br><br>Griffith &amp; the Band.', startDate: { year: 1989 }, coverImage: { large: 'https://a/l.jpg' }, staff: STAFF }),
  ]),
  at('A22/A24 metadata: A26: details asks for and carries genres', 'details', ['1'], [media({ genres: ['Action', 'Drama', 'Fantasy'] })]),
  at('A22/A24 metadata: details returns null on a failed request', 'details', ['1'], [fail]),

  // --- Iris parity ---
  at('Iris parity: search sends the trimmed query as a GraphQL variable', 'search', ['  Ça & "Kaiju" No. 8  '], [page([])]),
  at('Iris parity: search on a network error throws', 'search', ['Berserk'], [{ networkError: true }]),
  at('Iris parity: search on a 500 throws with the status', 'search', ['Berserk'], [fail]),
  at('Iris parity: hydrate on a 500 throws (no silent fallback)', 'hydrate', [pick('1', 'Berserk')], [fail]),
  at('Iris parity: details on a network error is null', 'details', ['1'], [{ networkError: true }]),
  at('Iris parity: details with no Media is null', 'details', ['1'], [ok({ data: { Media: null } })]),
  at('Iris parity: a non-numeric id is sent as a null GraphQL variable', 'details', ['abc'], [ok({ data: {} })]),
  at('Iris parity: NOT_YET_RELEASED is ongoing; extraLarge beats large; no story credit names the first', 'hydrate', [pick('3', 'Upcoming', 2)], [
    media({
      volumes: 0,
      status: 'NOT_YET_RELEASED',
      startDate: { year: 2027 },
      coverImage: { extraLarge: 'https://a/xl.jpg', large: 'https://a/l.jpg' },
      staff: { edges: [{ role: 'Art', node: { name: { full: 'First' } } }, { role: 'Original Creator', node: { name: { full: 'Second' } } }] },
      genres: ['Action', null, 'Drama'],
    }),
  ]),
  at('Iris parity: a single volume finished in its start year', 'hydrate', [pick('4', 'One Volume')], [
    media({ volumes: 1, chapters: 9, status: 'FINISHED', startDate: { year: 2020 }, endDate: { year: 2020 } }),
  ]),
  at('Iris parity: a finished manga with no counts keeps the guess', 'hydrate', [pick('5', 'Unknown', 3)], [
    media({ status: 'CANCELLED', startDate: { year: null }, endDate: { year: 2001 } }),
  ]),
  at('Iris parity: loose JSON — a numeric english title drops the hit (no romaji fallback); a null english falls back', 'search', ['x'], [
    page([{ id: 1, title: { english: 9, romaji: 'Nine' } }, { id: 2, title: {} }, { id: 3, title: { english: null, romaji: 'Three' }, staff: { edges: [] } }]),
  ]),
  at('Iris parity: loose JSON — no Page at all', 'search', ['x'], [ok({ data: null })]),
];
