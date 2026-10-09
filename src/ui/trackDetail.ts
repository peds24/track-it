import type { TrackSummary } from '@/data/trackRepo';
import { formatDate, formatRelative, type Timeline } from '@/domain/formatters';
import { ordinalFor, positionIn } from '@/domain/seasons';
import type { UnitLabel } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { KIND_LABEL, verbFor } from '@/ui/trackLabels';

// Pure text and rules of the track detail screen (A22) and its position
// editor (A12), shared by app/track/[kind]/[id].tsx, ProgressEditor.tsx and
// (through shared/fixtures/trackDetail.json) the Iris iOS detail screen.

/** "MOVIE · 2016 · Ongoing" — the line under the credit. */
export function detailMeta(track: TrackSummary, releaseYear: string | null): string {
  return [KIND_LABEL[track.category], releaseYear, track.ongoing ? 'Ongoing' : null]
    .filter((s): s is string => !!s)
    .join(' · ');
}

/** The screen's main button, or null when there is nothing to advance. */
export function detailPrimaryLabel(track: TrackSummary): string | null {
  if (!track.nextEntryId) return null;
  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  return resuming
    ? 'Resume'
    : starting
      ? track.category === 'movie'
        ? 'Watched'
        : 'Start'
      : `Mark ${track.nextEntryTitle} ${verbFor(track.category)}`;
}

/** "13 of 19 episodes", or null without progress or a unit. */
export function progressCaption(track: TrackSummary, unitLabel: UnitLabel | null): string | null {
  if (!track.progress || !unitLabel) return null;
  return `${track.progress.done} of ${track.progress.total} ${unitLabel}${track.progress.total === 1 ? '' : 's'}`;
}

/** The timeline rows under the progress card. */
export function detailStats(timeline: Timeline, now: string): [string, string][] {
  const stats: [string, string][] = [['Added', `${formatDate(timeline.addedAt)} · ${formatRelative(timeline.addedAt, now)}`]];
  if (timeline.startedAt) stats.push(['Started', `${formatDate(timeline.startedAt)} · ${formatRelative(timeline.startedAt, now)}`]);
  if (timeline.finishedAt) stats.push(['Finished', formatDate(timeline.finishedAt)]);
  return stats;
}

const UNIT_WORD: Record<UnitLabel, string> = {
  episode: 'Episode',
  issue: 'Issue',
  volume: 'Volume',
};

/** A field's number, or null for anything but plain digits. */
function typed(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** A12: what the position editor shows for what was typed, and the ordinal Save would set. */
export type PositionEdit = {
  unitWord: string;
  /** Shows a Season field (a show with season data). */
  seasoned: boolean;
  seasonPlaceholder: number | null;
  seasonCount: number | null;
  unitPlaceholder: number;
  /** "of N" beside the unit field; null shows "—". */
  unitTotal: number | null;
  /** null keeps Save disabled. */
  target: number | null;
};

export function positionEdit(track: TrackSummary, seasonText: string, unitText: string): PositionEdit {
  const total = track.progress?.total ?? 0;
  const unit = unitLabelFor(track.category) ?? 'episode';
  const unitWord = UNIT_WORD[unit];
  const currentOrdinal = (track.progress?.done ?? 0) + 1;
  const seasons = track.seasons && track.seasons.length > 0 ? track.seasons : null;
  const at = seasons ? positionIn(seasons, currentOrdinal) : null;
  const seasoned = seasons !== null && at !== null;
  const seasonNumber = seasoned ? (typed(seasonText) ?? at.season) : null;
  const seasonTotal =
    seasoned && seasonNumber !== null ? (seasons.find((s) => s.number === seasonNumber)?.episodeCount ?? null) : null;
  const unitTotal = seasoned ? seasonTotal : total;
  const unitPlaceholder = seasoned ? at.episode : currentOrdinal;
  const typedUnit = typed(unitText);
  const target = (() => {
    if (typedUnit === null) return null;
    if (seasoned) {
      if (seasonNumber === null) return null;
      const flat = ordinalFor(seasons, seasonNumber, typedUnit);
      return flat !== null && flat <= total ? flat : null;
    }
    return typedUnit >= 1 && typedUnit <= total ? typedUnit : null;
  })();
  return {
    unitWord,
    seasoned,
    seasonPlaceholder: seasoned ? at.season : null,
    seasonCount: seasoned ? seasons.length : null,
    unitPlaceholder,
    unitTotal,
    target,
  };
}
