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

/**
 * A18: the flat series ordinal a season-and-episode pair names — the inverse
 * of what `currentSeason` reports. The progress editor takes "S3 Ep 15" and
 * has to say which of the 176 flat `Entry` rows that is, because entries stay
 * flat (D3) and seasons remain display metadata (A11).
 *
 * `null` for anything the show does not actually have, rather than a clamped
 * neighbour: the editor disables its Save on `null`, and a silently corrected
 * number would move a track somewhere the user did not type.
 */
export function ordinalFor(
  seasons: readonly SeasonBoundary[],
  seasonNumber: number,
  episodeNumber: number,
): number | null {
  let cursor = 0;
  for (const season of seasons) {
    if (season.number === seasonNumber) {
      if (episodeNumber < 1 || episodeNumber > season.episodeCount) return null;
      return cursor + episodeNumber;
    }
    cursor += season.episodeCount;
  }
  return null;
}

/**
 * A18: the season and within-season episode a flat ordinal falls on. Seeds the
 * editor's two fields from where the track already is, and `null` past either
 * end for the same reason `ordinalFor` returns it.
 */
export function positionIn(
  seasons: readonly SeasonBoundary[],
  ordinal: number,
): { season: number; episode: number } | null {
  if (ordinal < 1) return null;
  let cursor = 0;
  for (const season of seasons) {
    if (ordinal <= cursor + season.episodeCount) {
      return { season: season.number, episode: ordinal - cursor };
    }
    cursor += season.episodeCount;
  }
  return null;
}
