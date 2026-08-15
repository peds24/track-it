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
