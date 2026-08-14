import type { Entry, Shelf } from '@/domain/types';

export function shelfForEntry(entry: Entry): Shelf {
  if (entry.status === 'done') return 'done';
  // A6: paused overrides in_progress — the whole point is to leave Currently
  // without losing the status/timestamps that say where you were.
  if (entry.paused) return 'backlog';
  if (entry.status === 'in_progress') return 'currently';
  return 'backlog';
}

/**
 * Derived, never stored (D3). The in_progress clause is load-bearing: read-mode
 * series reach Currently before they have a single done child.
 *
 * `paused` (A6) is a series-level flag, not a per-child one — it exists so a
 * track can leave Currently without resetting any child's status. It never
 * overrides a fully finished series, since there is nothing left to resume.
 */
export function shelfForSeries(children: readonly Entry[], paused = false): Shelf {
  if (children.length === 0) return 'backlog';

  const doneCount = children.filter((c) => c.status === 'done').length;
  if (doneCount === children.length) return 'done';
  if (paused) return 'backlog';
  if (children.some((c) => c.status === 'in_progress')) return 'currently';
  if (doneCount > 0) return 'currently';
  return 'backlog';
}

export function progressFor(children: readonly Entry[]): { done: number; total: number } {
  return {
    done: children.filter((c) => c.status === 'done').length,
    total: children.length,
  };
}

/** The thing the Currently screen offers to advance. */
export function nextEntry(children: readonly Entry[]): Entry | null {
  const inProgress = children.find((c) => c.status === 'in_progress');
  if (inProgress) return inProgress;

  const unstarted = children
    .filter((c) => c.status === 'unstarted')
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));

  return unstarted[0] ?? null;
}
