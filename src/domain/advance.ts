import { modeFor } from '@/domain/mode';
import type { Entry } from '@/domain/types';

/**
 * The single forward transition behind the one-tap advance (D8).
 * Read-mode entries, and watch-mode series children (episodes), pass through
 * in_progress first. A standalone watch-mode entry (a movie) has no series to
 * belong to and no next unit to reveal, so it still goes straight to done in
 * one call — D2's original binary rule, unchanged for that one case (A10).
 */
export function advance(entry: Entry, now: string): Entry {
  if (entry.status === 'done') {
    throw new Error(`Entry ${entry.id} is already done`);
  }

  if (modeFor(entry.mediaType) === 'watch' && entry.seriesId === null) {
    return { ...entry, status: 'done', startedAt: entry.startedAt ?? now, finishedAt: now };
  }

  if (entry.status === 'unstarted') {
    return { ...entry, status: 'in_progress', startedAt: now };
  }

  return { ...entry, status: 'done', finishedAt: now };
}

/**
 * A12: jump straight to a position instead of tapping `advance` up to it.
 * Everything before `targetOrdinal` becomes done, the target itself becomes
 * in_progress, and everything after goes back to unstarted — the same shape
 * `advance` leaves behind after A5's auto-start, just reached in one move.
 *
 * "Position" is the unit you are *on*, not the count you have finished: a
 * target of 5 means four are done and the fifth is in progress. That matches
 * how the row already talks ("Watching Episode 5", "S3 Ep 15 of 24"), and it
 * is why the target can never be a series' end — being on the last episode is
 * not the same as having finished it, so the editor positions a track and the
 * Done button still finishes it.
 *
 * Timestamps are preserved wherever the status is unchanged: re-watching from
 * an earlier point should not rewrite when you first finished episode 1. Units
 * that move backwards out of done lose theirs, because they no longer describe
 * anything that happened.
 *
 * Returns only the entries that actually changed, so the caller writes the few
 * rows that moved rather than every child of the series.
 */
export function setPosition(
  children: readonly Entry[],
  targetOrdinal: number,
  now: string,
): Entry[] {
  if (targetOrdinal < 1 || targetOrdinal > children.length) {
    throw new Error(`Position ${targetOrdinal} is out of range for a ${children.length}-unit series`);
  }

  const ordered = [...children].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

  const changed: Entry[] = [];
  ordered.forEach((child, index) => {
    const position = index + 1;
    const updated =
      position < targetOrdinal
        ? { ...child, status: 'done' as const, startedAt: child.startedAt ?? now, finishedAt: child.finishedAt ?? now }
        : position === targetOrdinal
          ? { ...child, status: 'in_progress' as const, startedAt: child.startedAt ?? now, finishedAt: null }
          : { ...child, status: 'unstarted' as const, startedAt: null, finishedAt: null };

    if (
      updated.status !== child.status ||
      updated.startedAt !== child.startedAt ||
      updated.finishedAt !== child.finishedAt
    ) {
      changed.push(updated);
    }
  });

  return changed;
}
