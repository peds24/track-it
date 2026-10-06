import type { FixtureCase } from '../types';

// Extracted from src/domain/__tests__/seasons.test.ts.
// House's real 8-season breakdown, specials excluded — 176 episodes total.
const HOUSE = [
  { number: 1, episodeCount: 22 },
  { number: 2, episodeCount: 24 },
  { number: 3, episodeCount: 24 },
  { number: 4, episodeCount: 16 },
  { number: 5, episodeCount: 24 },
  { number: 6, episodeCount: 21 },
  { number: 7, episodeCount: 23 },
  { number: 8, episodeCount: 22 },
];

const c = (name: string, fn: string, ...args: unknown[]): FixtureCase => ({ name, fn, args });

// "round-trips every ordinal": positionIn for every season's first and last
// episode, plus a sample in between (the full 176-way loop adds nothing a
// boundary walk doesn't).
const boundaryOrdinals = [1, 22, 23, 46, 47, 70, 71, 86, 87, 110, 111, 131, 132, 154, 155, 176];

export const cases: FixtureCase[] = [
  c('seasonSegments splits a flat done-count across season boundaries in order', 'seasonSegments', HOUSE, 60),
  c('seasonSegments: a done-count of zero leaves every segment empty', 'seasonSegments', HOUSE, 0),
  c('seasonSegments: a done-count past the total fills every segment', 'seasonSegments', HOUSE, 999),
  c('seasonSegments: an empty seasons list produces an empty result', 'seasonSegments', [], 10),
  c('currentSeason finds the season the next episode falls in, and its number within that season', 'currentSeason', HOUSE, 60),
  c('currentSeason: nothing done yet starts at season 1, episode 1', 'currentSeason', HOUSE, 0),
  c('currentSeason: every season fully done returns null — nothing left to advance into', 'currentSeason', HOUSE, 176),
  c('currentSeason: an empty seasons list returns null', 'currentSeason', [], 10),
  c('currentSeason at a season boundary moves to the next season', 'currentSeason', HOUSE, 46),
  c('ordinalFor converts a season and within-season episode to a flat series ordinal', 'ordinalFor', HOUSE, 3, 15),
  c('ordinalFor: season 1 episode 1 is ordinal 1', 'ordinalFor', HOUSE, 1, 1),
  c('ordinalFor: the last episode of the last season is the series total', 'ordinalFor', HOUSE, 8, 22),
  c('ordinalFor: an episode past that season length is out of range', 'ordinalFor', HOUSE, 4, 17),
  c('ordinalFor: an episode below 1 is out of range', 'ordinalFor', HOUSE, 4, 0),
  c('ordinalFor: a season the show does not have is out of range', 'ordinalFor', HOUSE, 9, 1),
  c('positionIn converts a flat series ordinal back to a season and within-season episode', 'positionIn', HOUSE, 61),
  ...boundaryOrdinals.map((o) => c(`positionIn round-trips every ordinal in the series: ${o}`, 'positionIn', HOUSE, o)),
  c('positionIn: an ordinal past the series total has no position', 'positionIn', HOUSE, 177),
  c('positionIn: an ordinal below 1 has no position', 'positionIn', HOUSE, 0),
  c('Swift parity: seasonSegments with a negative done-count is all empty', 'seasonSegments', HOUSE, -5),
];
