import type { TrackSummary } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { currentlySections } from '@/ui/currentlySections';

function track(category: Category, id: string): TrackSummary {
  return {
    kind: 'series',
    id,
    title: id,
    category,
    shelf: 'currently',
    createdAt: '2026-08-12T10:00:00.000Z',
    progress: { done: 0, total: 1 },
    nextEntryId: `${id}-e1`,
    nextEntryOrdinal: 1,
    entryCount: 1,
    ongoing: false,
    paused: false,
    seasons: null,
    nextEntryStatus: 'unstarted',
    nextEntryTitle: 'Episode 1',
    lastAdvancedAt: null,
  };
}

test('groups tracks into one section per category that has something in it', () => {
  const tracks = [track('show', 's1'), track('book', 'b1'), track('show', 's2')];
  const sections = currentlySections(tracks, new Set());

  expect(sections.map((s) => s.category)).toEqual(['show', 'book']);
  expect(sections.find((s) => s.category === 'show')!.data).toEqual([tracks[0], tracks[2]]);
});

test('a category with nothing Currently gets no section at all', () => {
  const sections = currentlySections([track('show', 's1')], new Set());
  expect(sections.some((s) => s.category === 'movie')).toBe(false);
});

test('sections follow a fixed display order regardless of track order', () => {
  const tracks = [track('manga', 'm1'), track('show', 's1'), track('book', 'b1')];
  const sections = currentlySections(tracks, new Set());
  expect(sections.map((s) => s.category)).toEqual(['show', 'book', 'manga']);
});

test('a collapsed category keeps its count but empties its data', () => {
  const tracks = [track('show', 's1'), track('show', 's2')];
  const sections = currentlySections(tracks, new Set(['show']));

  const shows = sections.find((s) => s.category === 'show')!;
  expect(shows.collapsed).toBe(true);
  expect(shows.count).toBe(2);
  expect(shows.data).toEqual([]);
});

test('a category not in the collapsed set stays expanded', () => {
  const tracks = [track('show', 's1')];
  const sections = currentlySections(tracks, new Set(['book']));

  const shows = sections.find((s) => s.category === 'show')!;
  expect(shows.collapsed).toBe(false);
  expect(shows.data).toEqual(tracks);
});

test('a collapsed category with nothing in it still gets no section', () => {
  const sections = currentlySections([track('show', 's1')], new Set(['movie']));
  expect(sections.some((s) => s.category === 'movie')).toBe(false);
});
