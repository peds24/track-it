import type { SeasonBoundary } from '@/domain/types';

export type SeasonSegment = { number: number; episodeCount: number; done: number };
export type CurrentSeason = { number: number; nextEpisode: number; episodeCount: number };

/**
 * Splits a flat done-count across season boundaries, in order — pure
 * display math for the segmented progress bar (A11). `Entry` rows stay
 * flat (D3); this only ever reads the count already derived from them, it
 * never reads or writes an entry itself.
 */
export function seasonSegments(
  seasons: readonly SeasonBoundary[],
  doneCount: number,
): SeasonSegment[] {
  let cursor = 0;
  return seasons.map((season) => {
    const done = Math.max(0, Math.min(season.episodeCount, doneCount - cursor));
    cursor += season.episodeCount;
    return { number: season.number, episodeCount: season.episodeCount, done };
  });
}

/**
 * The season the next episode falls in, and that episode's number *within*
 * the season — "S3 Ep 15 of 24" reads `nextEpisode`/`episodeCount` from
 * this, not the whole-series total. `null` once every season is fully done
 * — nothing left to advance into, the same "no bar when finished" rule the
 * flat count already follows.
 */
export function currentSeason(
  seasons: readonly SeasonBoundary[],
  doneCount: number,
): CurrentSeason | null {
  let cursor = 0;
  for (const season of seasons) {
    const doneInSeason = Math.max(0, Math.min(season.episodeCount, doneCount - cursor));
    if (doneInSeason < season.episodeCount) {
      return { number: season.number, nextEpisode: doneInSeason + 1, episodeCount: season.episodeCount };
    }
    cursor += season.episodeCount;
  }
  return null;
}
