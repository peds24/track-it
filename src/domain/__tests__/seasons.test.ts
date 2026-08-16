import { currentSeason, seasonSegments } from '@/domain/seasons';
import type { SeasonBoundary } from '@/domain/types';

// House's real 8-season breakdown, specials excluded — 176 episodes total.
const HOUSE: SeasonBoundary[] = [
  { number: 1, episodeCount: 22 },
  { number: 2, episodeCount: 24 },
  { number: 3, episodeCount: 24 },
  { number: 4, episodeCount: 16 },
  { number: 5, episodeCount: 24 },
  { number: 6, episodeCount: 21 },
  { number: 7, episodeCount: 23 },
  { number: 8, episodeCount: 22 },
];

describe('seasonSegments', () => {
  test('splits a flat done-count across season boundaries in order', () => {
    const segments = seasonSegments(HOUSE, 60);
    expect(segments[0]).toEqual({ number: 1, episodeCount: 22, done: 22 });
    expect(segments[1]).toEqual({ number: 2, episodeCount: 24, done: 24 });
    expect(segments[2]).toEqual({ number: 3, episodeCount: 24, done: 14 });
    expect(segments[3]).toEqual({ number: 4, episodeCount: 16, done: 0 });
    expect(segments[7]).toEqual({ number: 8, episodeCount: 22, done: 0 });
  });

  test('a done-count of zero leaves every segment empty', () => {
    const segments = seasonSegments(HOUSE, 0);
    expect(segments.every((s) => s.done === 0)).toBe(true);
  });

  test('a done-count past the total fills every segment', () => {
    const segments = seasonSegments(HOUSE, 999);
    expect(segments.every((s) => s.done === s.episodeCount)).toBe(true);
  });

  test('an empty seasons list produces an empty result', () => {
    expect(seasonSegments([], 10)).toEqual([]);
  });
});

describe('currentSeason', () => {
  test('finds the season the next episode falls in, and its number within that season', () => {
    // 60 done overall: seasons 1-2 (46 eps) are full, season 3 has 14 done —
    // episode 15 of season 3 is next.
    expect(currentSeason(HOUSE, 60)).toEqual({ number: 3, nextEpisode: 15, episodeCount: 24 });
  });

  test('nothing done yet starts at season 1, episode 1', () => {
    expect(currentSeason(HOUSE, 0)).toEqual({ number: 1, nextEpisode: 1, episodeCount: 22 });
  });

  test('every season fully done returns null — nothing left to advance into', () => {
    expect(currentSeason(HOUSE, 176)).toBeNull();
  });

  test('an empty seasons list returns null', () => {
    expect(currentSeason([], 10)).toBeNull();
  });
});
