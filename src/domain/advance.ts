import { modeFor } from '@/domain/mode';
import type { Entry } from '@/domain/types';

/**
 * The single forward transition behind the one-tap advance (D8).
 * Watch-mode entries go straight to done; read-mode entries pass through
 * in_progress first.
 */
export function advance(entry: Entry, now: string): Entry {
  if (entry.status === 'done') {
    throw new Error(`Entry ${entry.id} is already done`);
  }

  if (modeFor(entry.mediaType) === 'watch') {
    return { ...entry, status: 'done', startedAt: entry.startedAt ?? now, finishedAt: now };
  }

  if (entry.status === 'unstarted') {
    return { ...entry, status: 'in_progress', startedAt: now };
  }

  return { ...entry, status: 'done', finishedAt: now };
}
