import { currentSeason, ordinalFor, positionIn, seasonSegments } from '@/domain/seasons';
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

describe('ordinalFor', () => {
  test('converts a season and within-season episode to a flat series ordinal', () => {
    // Seasons 1-2 are 46 episodes; S3 E15 is the 61st episode overall.
    expect(ordinalFor(HOUSE, 3, 15)).toBe(61);
  });

  test('season 1 episode 1 is ordinal 1', () => {
    expect(ordinalFor(HOUSE, 1, 1)).toBe(1);
  });

  test('the last episode of the last season is the series total', () => {
    expect(ordinalFor(HOUSE, 8, 22)).toBe(176);
  });

  test('an episode past that season length is out of range', () => {
    expect(ordinalFor(HOUSE, 4, 17)).toBeNull();
  });

  test('an episode below 1 is out of range', () => {
    expect(ordinalFor(HOUSE, 4, 0)).toBeNull();
  });

  test('a season the show does not have is out of range', () => {
    expect(ordinalFor(HOUSE, 9, 1)).toBeNull();
  });
});

describe('positionIn', () => {
  test('converts a flat series ordinal back to a season and within-season episode', () => {
    expect(positionIn(HOUSE, 61)).toEqual({ season: 3, episode: 15 });
  });

  test('round-trips every ordinal in the series', () => {
    for (let ordinal = 1; ordinal <= 176; ordinal++) {
      const at = positionIn(HOUSE, ordinal);
      expect(at).not.toBeNull();
      expect(ordinalFor(HOUSE, at!.season, at!.episode)).toBe(ordinal);
    }
  });

  test('an ordinal past the series total has no position', () => {
    expect(positionIn(HOUSE, 177)).toBeNull();
  });

  test('an ordinal below 1 has no position', () => {
    expect(positionIn(HOUSE, 0)).toBeNull();
  });
});
