import type { EntryMediaType, Mode, Status } from '@/domain/types';

const MODE_BY_MEDIA_TYPE: Record<EntryMediaType, Mode> = {
  episode: 'watch',
  movie: 'watch',
  book: 'read',
  issue: 'read',
  volume: 'read',
  // A16: a standalone comic collection reads the same two-tap way a book
  // does — unstarted -> in_progress -> done — not the binary watch-mode
  // rule (that only ever applied to a standalone entry with no next unit
  // to reveal a middle state about, which a comic never was).
  comic: 'read',
};

/** Mode is a total function of media type, so it is derived, never stored. */
export function modeFor(mediaType: EntryMediaType): Mode {
  return MODE_BY_MEDIA_TYPE[mediaType];
}

/**
 * A5/A7 already made a series child's tracking granularity a function of its
 * position in the series rather than its mode — that's why a manga volume
 * has an in_progress state. A10 makes an episode consistent with that: a
 * standalone watch-mode entry (a movie) has no in_progress state, since it
 * has no next unit for a middle state to mean anything about, but a
 * watch-mode series child (an episode) does.
 */
export function isStatusValid(
  mediaType: EntryMediaType,
  status: Status,
  isSeriesChild: boolean,
): boolean {
  if (modeFor(mediaType) === 'watch' && !isSeriesChild) return status !== 'in_progress';
  return true;
}
