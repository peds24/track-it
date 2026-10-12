import type { Category } from '@/domain/types';
import type { MatchPreview, SearchResult, SeriesDraft } from '@/providers/types';
import type { FixtureCase } from '../types';

// The Add screen's rules from src/ui/addFlow.ts. Inputs only; expectations
// are recorded from TS.
const CATEGORIES: Category[] = ['show', 'movie', 'book', 'comic', 'manga'];
const MODES = [null, 'single', 'collection'] as const;

const sagaHit: SearchResult = { id: 'metron-1', title: 'Saga', category: 'comic', count: 66, ongoing: true, creator: 'Brian K. Vaughan', year: '2012' };
const sagaTpb: SearchResult = { id: 'gb-saga-1', title: 'Saga, Volume One', category: 'comic', count: 1, creator: 'Brian K. Vaughan', year: '2012' };
const expanse: SearchResult = { id: 'tmdb-63639', title: 'The Expanse', category: 'show', count: 62, year: '2015' };
const expanseDraft: SeriesDraft = {
  title: 'The Expanse', mediaType: 'show', unitLabel: 'episode',
  entries: [{ ordinal: 1, title: 'Episode 1' }, { ordinal: 2, title: 'Episode 2' }],
  externalSource: 'tmdb', externalId: '63639', seasons: [{ number: 1, episodeCount: 2 }],
  metaLine: ['2015', '1 season'], blurb: 'A detective and a captain uncover a conspiracy.',
  metadata: { coverUrl: null, creator: 'Mark Fergus', description: null, releaseYear: '2015' },
};
const arrival: SearchResult = { id: 'tmdb-329865', title: 'Arrival', category: 'movie', count: 1, creator: 'Denis Villeneuve', year: '2016' };
const arrivalPreview: MatchPreview = { title: 'Arrival', metaLine: ['2016', '1h 56m'], blurb: 'A linguist is asked to talk to visitors.', metadata: { coverUrl: null, creator: 'Denis Villeneuve', description: null, releaseYear: '2016' } };

// The draft with no metaLine or blurb keys at all (undefined keys don't survive JSON).
const { metaLine: _m, blurb: _b, ...bareDraft } = expanseDraft;
const input = (name: string, args: Record<string, unknown>): FixtureCase => ({ name: `addTrackInput: ${name}`, fn: 'addTrackInput', args: [args] });
const base = { comicMode: null, picked: null, draft: null, previewMetadata: null };

export const cases: FixtureCase[] = [
  ...CATEGORIES.flatMap((c) =>
    (c === 'comic' ? MODES : [null]).flatMap((m): FixtureCase[] => [
      { name: `addCatalogueKey: ${c} ${m ?? 'no mode'}`, fn: 'addCatalogueKey', args: [c, m] },
      { name: `addIsSeries: ${c} ${m ?? 'no mode'}`, fn: 'addIsSeries', args: [c, m] },
      { name: `addBarcodeTypes: ${c} ${m ?? 'no mode'}`, fn: 'addBarcodeTypes', args: [c, m] },
    ]),
  ),
  ...CATEGORIES.flatMap((c): FixtureCase[] => [
    { name: `confirmPrimaryLabel: ${c}`, fn: 'confirmPrimaryLabel', args: [c] },
    { name: `manualPrimaryLabel: ${c}`, fn: 'manualPrimaryLabel', args: [c] },
  ]),
  { name: 'addSaveTitle: a pick with a scanned volume', fn: 'addSaveTitle', args: [{ title: 'Attack on Titan' }, 30, 'attack'] },
  { name: 'addSaveTitle: a pick without one', fn: 'addSaveTitle', args: [{ title: 'Dune' }, null, 'dun'] },
  { name: 'addSaveTitle: nothing picked keeps the typed text as is', fn: 'addSaveTitle', args: [null, null, '  Pluribus '] },
  input('a typed comic issue starts at its number', { ...base, category: 'comic', comicMode: 'single', saveTitle: 'Saga #12' }),
  input('a typed manga volume', { ...base, category: 'manga', saveTitle: 'Berserk #3' }),
  input('a typed manga with no number', { ...base, category: 'manga', saveTitle: 'Berserk' }),
  input('a typed book is trimmed', { ...base, category: 'book', saveTitle: '  Dune  ' }),
  input('a typed book keeps a "#" in its title', { ...base, category: 'book', saveTitle: 'Book #2' }),
  input('a comic collection pick is standalone from Google Books', { ...base, category: 'comic', comicMode: 'collection', saveTitle: sagaTpb.title, picked: sagaTpb }),
  input('a comic single pick', { ...base, category: 'comic', comicMode: 'single', saveTitle: 'Saga', picked: sagaHit }),
  input('a show with its draft', { ...base, category: 'show', saveTitle: expanse.title, picked: expanse, draft: expanseDraft }),
  input('a series pick whose hydrate failed has no draft', { ...base, category: 'show', saveTitle: 'The Expanse', picked: null, draft: null }),
  input('a movie keeps its preview metadata', { ...base, category: 'movie', saveTitle: arrival.title, picked: arrival, previewMetadata: arrivalPreview.metadata }),
  input('a series ignores preview metadata', { ...base, category: 'show', saveTitle: 'The Expanse', previewMetadata: { creator: 'x' } }),
  { name: 'matchSummary: a series with its draft', fn: 'matchSummary', args: [true, expanseDraft, null] },
  { name: 'matchSummary: a series still hydrating', fn: 'matchSummary', args: [true, null, arrivalPreview] },
  { name: 'matchSummary: a standalone with its preview', fn: 'matchSummary', args: [false, null, arrivalPreview] },
  { name: 'matchSummary: a standalone still previewing', fn: 'matchSummary', args: [false, expanseDraft, null] },
  { name: 'matchSummary: a draft without metaLine or blurb', fn: 'matchSummary', args: [true, bareDraft, null] },
];
