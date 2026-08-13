import type { EntryMediaType, Mode, Status } from '@/domain/types';

const MODE_BY_MEDIA_TYPE: Record<EntryMediaType, Mode> = {
  episode: 'watch',
  movie: 'watch',
  book: 'read',
  issue: 'read',
  volume: 'read',
};

/** Mode is a total function of media type, so it is derived, never stored. */
export function modeFor(mediaType: EntryMediaType): Mode {
  return MODE_BY_MEDIA_TYPE[mediaType];
}

/** You do not sit half-way inside an episode, so watch mode has no in_progress. */
export function isStatusValid(mediaType: EntryMediaType, status: Status): boolean {
  if (modeFor(mediaType) === 'watch') return status !== 'in_progress';
  return true;
}
