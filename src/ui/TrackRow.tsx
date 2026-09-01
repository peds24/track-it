import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { currentSeason, seasonSegments } from '@/domain/seasons';
import type { Category } from '@/domain/types';
import { font, layout, radius, useTheme, type Palette } from '@/ui/theme';

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

/** "watched" vs "read" is presentation only — the database stores neither. */
function verbFor(category: Category): string {
  return READ_CATEGORIES.includes(category) ? 'read' : 'watched';
}

const KIND_LABEL: Record<Category, string> = {
  show: 'SHOW',
  movie: 'MOVIE',
  book: 'BOOK',
  comic: 'COMIC',
  manga: 'MANGA',
};

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
function hasSeasonProgress(track: TrackSummary): boolean {
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

/**
 * A19: eligible on Currently, or on a paused Backlog row — the same
 * eligibility `hasSeasonProgress` (A13) already applies to the season bar.
 * A backlog row that was never started has nothing worth correcting yet.
 *
 * A20: an ongoing series has no `progress` to check (A4 — it has no total),
 * but its existing entries are just as correctable, bounded by however many
 * exist so far (`entryCount`) rather than a fixed total. A fresh ongoing
 * series with only its first entry is excluded the same way a fresh finite
 * one would be — there being only one entry means there's nothing to walk
 * back through yet.
 */
export function canEditPosition(track: TrackSummary): boolean {
  const hasCorrectableProgress = track.ongoing
    ? track.entryCount > 1
    : track.progress !== null && track.progress.total > 0;
  return (
    track.kind === 'series' &&
    (track.shelf === 'currently' || (track.shelf === 'backlog' && track.paused)) &&
    hasCorrectableProgress
  );
}

export function TrackRow({
  track,
  onAdvance,
  onResume,
  onRename,
  onEditProgress,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onRename: (track: TrackSummary, title: string) => void;
  onEditProgress?: (track: TrackSummary) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { nextEntryId, nextEntryTitle, progress } = track;

  // A15: renaming is a lightweight in-place edit, not a confirm-and-refetch
  // flow — externalSource/externalId (and a show's seasons) live in
  // separate columns a rename never touches, so there's nothing to
  // re-fetch or re-confirm. `titleDraft` is only ever seeded from
  // `track.title` at the moment editing starts, not synced continuously,
  // so it can't fight the user's own typing.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(track.title);

  function commitRename(): void {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed.length > 0 && trimmed !== track.title) onRename(track, trimmed);
  }

  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  const startLabel = track.category === 'movie' ? 'Watched' : 'Start';
  const editable = onEditProgress !== undefined && canEditPosition(track);

  const fraction =
    progress && progress.total > 0 && track.shelf !== 'done'
      ? Math.min(1, Math.max(0, progress.done / progress.total))
      : null;

  // A11/A13: same eligibility as seasonPositionLabel, via the shared helper —
  // a not-yet-started show keeps the flat bar, everything else with season
  // data gets the segmented one.
  const segments = hasSeasonProgress(track) ? seasonSegments(track.seasons!, track.progress!.done) : null;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        {editingTitle ? (
          <TextInput
            style={styles.titleInput}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onSubmitEditing={commitRename}
            onBlur={commitRename}
            autoFocus
            selectTextOnFocus
            cursorColor={palette.primary}
            selectionColor={palette.primaryContainer}
            underlineColorAndroid="transparent"
          />
        ) : (
          <Text
            style={styles.title}
            numberOfLines={1}
            onLongPress={() => {
              setTitleDraft(track.title);
              setEditingTitle(true);
            }}
          >
            {track.title}
          </Text>
        )}

        <View style={styles.meta}>
          <View style={styles.kindBadge}>
            <Text style={styles.kind}>{KIND_LABEL[track.category]}</Text>
          </View>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.position} numberOfLines={1}>
            {seasonPositionLabel(track) ?? positionLabel(track)}
          </Text>
          {track.ongoing && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.count}>Ongoing</Text>
            </>
          )}
          {progress && (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.count}>{`${progress.done} of ${progress.total}`}</Text>
            </>
          )}
        </View>

        {fraction !== null && (
          <View
            style={[styles.progressTrack, segments && styles.progressTrackSegmented]}
            testID="progress-track"
          >
            {segments ? (
              segments.map((seg) => (
                <View key={seg.number} style={[styles.segment, { flex: seg.episodeCount || 1 }]} testID="progress-segment">
                  <View
                    style={[
                      styles.progressFill,
                      { width: seg.episodeCount > 0 ? `${(seg.done / seg.episodeCount) * 100}%` : '0%' },
                    ]}
                  />
                </View>
              ))
            ) : (
              <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
            )}
          </View>
        )}
      </View>

      {nextEntryId && nextEntryTitle && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            resuming
              ? `Resume ${track.title}`
              : starting
                ? `${startLabel} ${track.title}`
                : `Mark ${nextEntryTitle} ${verbFor(track.category)}`
          }
          accessibilityHint={editable ? 'Hold to set which unit you are on' : undefined}
          onPress={() => (resuming ? onResume(track) : onAdvance(nextEntryId))}
          onLongPress={editable ? () => onEditProgress?.(track) : undefined}
          android_ripple={{ color: palette.primaryContainer }}
          style={({ pressed }) => [styles.advance, pressed && styles.advancePressed]}
        >
          {({ pressed }) => (
            <Text style={[styles.advanceText, pressed && styles.advanceTextPressed]}>
              {resuming ? 'Resume' : starting ? startLabel : 'Done'}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.rowGap,
      paddingTop: layout.rowTop,
      paddingBottom: layout.rowBottom,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.outlineVariant,
      backgroundColor: c.surface,
    },
    text: { flex: 1, minWidth: 0 },
    title: {
      ...font.titleMedium,
      color: c.onSurface,
    },
    // A15: the one moment a row's text becomes a control, so it picks up a
    // bottom border rather than a full box — it still reads as the same
    // title in place, just editable.
    titleInput: {
      ...font.titleMedium,
      color: c.onSurface,
      padding: 0,
      borderBottomWidth: 1.5,
      borderBottomColor: c.primary,
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.metaGap,
      marginTop: 4,
    },
    kindBadge: {
      backgroundColor: c.surfaceContainerHigh,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: radius.xs,
    },
    kind: {
      ...font.labelSmall,
      color: c.primary,
      fontWeight: '700',
    },
    dot: {
      ...font.bodySmall,
      color: c.outline,
      flexShrink: 0,
    },
    position: {
      ...font.bodySmall,
      color: c.onSurfaceVariant,
      flexShrink: 1,
    },
    count: {
      ...font.bodySmall,
      color: c.onSurface,
      fontWeight: '600',
      flexShrink: 0,
      fontVariant: ['tabular-nums'],
    },
    progressTrack: {
      height: layout.progressHeight,
      marginTop: 10,
      borderRadius: radius.full,
      backgroundColor: c.surfaceContainerHighest,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radius.full,
      backgroundColor: c.primary,
    },
    progressTrackSegmented: {
      backgroundColor: 'transparent',
      flexDirection: 'row',
      gap: 3,
    },
    segment: {
      height: '100%',
      backgroundColor: c.surfaceContainerHighest,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    advance: {
      flexShrink: 0,
      minWidth: 72,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: c.primary,
      borderRadius: radius.full,
    },
    advancePressed: {
      backgroundColor: c.primaryContainer,
    },
    advanceText: {
      ...font.labelLarge,
      color: c.primary,
      fontWeight: '700',
    },
    advanceTextPressed: {
      color: c.onPrimaryContainer,
    },
  });
}
