import type { Entry, Shelf } from '@/domain/types';

export function shelfForEntry(entry: Entry): Shelf {
  if (entry.status === 'done') return 'done';
  if (entry.status === 'in_progress') return 'currently';
  return 'backlog';
}

/**
 * Derived, never stored (D3). The in_progress clause is load-bearing: read-mode
 * series reach Currently before they have a single done child.
 */
export function shelfForSeries(children: readonly Entry[]): Shelf {
  if (children.length === 0) return 'backlog';
  if (children.some((c) => c.status === 'in_progress')) return 'currently';

  const doneCount = children.filter((c) => c.status === 'done').length;
  if (doneCount === children.length) return 'done';
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
