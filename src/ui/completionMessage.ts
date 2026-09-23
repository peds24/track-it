import type { TrackSummary } from '@/data/trackRepo';

/**
 * A23: the body of the "Mark … complete?" confirm, shared by the swipe row and
 * the detail screen so the two copies can't drift. When completing would drop
 * an ongoing series' auto-appended unit, it says so by name — the rule also
 * catches a unit the user reached but never tapped Done on.
 */
export function completionMessage(track: Pick<TrackSummary, 'kind' | 'ongoing' | 'completionDrops'>): string {
  if (track.kind === 'entry') return 'It moves to Done.';
  if (track.completionDrops) {
    return `${track.completionDrops} isn't marked done, so it's removed and the series ends at the last one you finished. Tap Done on it first if you finished it.`;
  }
  return track.ongoing
    ? 'Everything you have reached is marked done and the series stops growing. It moves to Done.'
    : 'Every remaining unit is marked done. It moves to Done.';
}
