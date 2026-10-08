import type { TrackSummary } from '@/data/trackRepo';
import { currentSeason } from '@/domain/seasons';
import type { Category } from '@/domain/types';

// Pure row text, shared by TrackRow and (through shared/fixtures/trackLabels.json)
// the Iris iOS rows, so the two platforms can't drift. No React imports.

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

/** "watched" vs "read" is presentation only — the database stores neither. */
export function verbFor(category: Category): string {
  return READ_CATEGORIES.includes(category) ? 'read' : 'watched';
}

/**
 * The middle of the meta line: where you are, in words. Derived from shelf and
 * mode, matching the mockups — "Next Episode 4", "Not started", "Reading",
 * "Watched", "Finished".
 */
export function positionLabel(track: TrackSummary): string {
  const read = READ_CATEGORIES.includes(track.category);
  if (track.shelf === 'done') {
    if (track.kind === 'series') return 'Finished';
    return read ? 'Read' : 'Watched';
  }
  if (track.shelf === 'backlog') {
    // A6: paused keeps the row pointed at wherever it was left, rather than
    // reporting "Not started" for something that plainly was.
    if (track.paused && track.nextEntryTitle && track.nextEntryTitle !== track.title) {
      return `Paused · ${track.nextEntryTitle}`;
    }
    if (track.paused) return 'Paused';
    return 'Not started';
  }
  if (track.nextEntryTitle && track.nextEntryTitle !== track.title) {
    if (!read) return `Watching ${track.nextEntryTitle}`;
    const verb = track.nextEntryStatus === 'in_progress' ? 'Reading' : 'Next';
    return `${verb} ${track.nextEntryTitle}`;
  }
  return read ? 'Reading' : 'Watching';
}

/**
 * A11/A13: a show gets season treatment (this label, and the segmented bar
 * below) whenever it has real progress worth showing correctly — actively
 * being watched, or paused with something already underway. A13 widened
 * this from "Currently only": a paused show still has genuine progress,
 * and "Paused" alone hid exactly what a segmented bar exists to convey. A
 * show that has never been started (backlog, not paused) is excluded on
 * purpose — there is no season position to report yet.
 */
export function hasSeasonProgress(track: TrackSummary): boolean {
  const eligible = track.shelf === 'currently' || (track.shelf === 'backlog' && track.paused);
  return eligible && !!track.seasons && track.seasons.length > 0 && !!track.progress;
}

/**
 * Replaces the whole-series `positionLabel` when `hasSeasonProgress` — "S3
 * Ep 15 of 24" instead of "Watching Episode 61", or "Paused · S3 Ep 15 of
 * 24" instead of a bare "Paused" once a show has season data.
 */
export function seasonPositionLabel(track: TrackSummary): string | null {
  if (!hasSeasonProgress(track) || !track.progress) return null;
  const current = currentSeason(track.seasons!, track.progress.done);
  if (!current) return null;
  const seasonText = `S${current.number} Ep ${current.nextEpisode} of ${current.episodeCount}`;
  return track.paused ? `Paused · ${seasonText}` : seasonText;
}

export function canEditPosition(track: TrackSummary): boolean {
  return (
    track.kind === 'series' &&
    track.shelf === 'currently' &&
    !track.ongoing &&
    track.progress !== null &&
    track.progress.total > 0
  );
}

/** The row's one button: what it says and what it does. */
export type RowAction = { kind: 'advance' | 'resume'; entryId: string; label: string; accessibilityLabel: string };

export function rowAction(track: TrackSummary): RowAction | null {
  const { nextEntryId, nextEntryTitle } = track;
  if (!nextEntryId || !nextEntryTitle) return null;
  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  const startLabel = track.category === 'movie' ? 'Watched' : 'Start';
  return {
    kind: resuming ? 'resume' : 'advance',
    entryId: nextEntryId,
    label: resuming ? 'Resume' : starting ? startLabel : 'Done',
    accessibilityLabel: resuming
      ? `Resume ${track.title}`
      : starting
        ? `${startLabel} ${track.title}`
        : `Mark ${nextEntryTitle} ${verbFor(track.category)}`,
  };
}
