import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { formatScore } from '@/domain/rating';
import type { Category } from '@/domain/types';
import { seasonSegments } from '@/domain/seasons';
import { font, layout, radius, useTheme, type Palette } from '@/ui/theme';

import { canEditPosition, hasSeasonProgress, positionLabel, rowAction, seasonPositionLabel } from '@/ui/trackLabels';

export { canEditPosition, positionLabel, seasonPositionLabel } from '@/ui/trackLabels';

export const KIND_LABEL: Record<Category, string> = {
  show: 'SHOW',
  movie: 'MOVIE',
  book: 'BOOK',
  comic: 'COMIC',
  manga: 'MANGA',
};


export function TrackRow({
  track,
  onAdvance,
  onResume,
  onRename,
  onEditProgress,
  onOpen,
  score,
  onRate,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onRename: (track: TrackSummary, title: string) => void;
  onEditProgress?: (track: TrackSummary) => void;
  onOpen?: (track: TrackSummary) => void;
  /** A26: this track's 1–10 score, or null when it hasn't been rated. */
  score?: number | null;
  /** A26: given on Done, where an unrated row offers Rate in place of a control. */
  onRate?: (track: TrackSummary) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { nextEntryId, progress } = track;

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

  const action = rowAction(track);
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
      {/* A22: tapping a row's text opens its detail screen; holding it still
          renames in place (A15). The advance button is a sibling, not a
          child, so it never opens. */}
      <Pressable
        style={styles.text}
        disabled={editingTitle}
        onPress={onOpen ? () => onOpen(track) : undefined}
        onLongPress={() => {
          setTitleDraft(track.title);
          setEditingTitle(true);
        }}
        accessibilityHint={onOpen ? 'Opens details. Hold to rename.' : 'Hold to rename.'}
        accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={onOpen ? track.title : undefined}
        // While renaming, stop grouping the column into one element so the
        // TextInput inside stays reachable by screen readers.
        accessible={!editingTitle}
      >
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
          <Text style={styles.title} numberOfLines={1}>
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
      </Pressable>

      {action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel}
          accessibilityHint={editable ? 'Hold to set which unit you are on' : undefined}
          onPress={() => (action.kind === 'resume' ? onResume(track) : onAdvance(action.entryId))}
          onLongPress={editable ? () => onEditProgress?.(track) : undefined}
          android_ripple={{ color: palette.primaryContainer }}
          style={({ pressed }) => [styles.advance, pressed && styles.advancePressed]}
        >
          {({ pressed }) => (
            <Text style={[styles.advanceText, pressed && styles.advanceTextPressed]}>{action.label}</Text>
          )}
        </Pressable>
      )}

      {!nextEntryId && typeof score === 'number' && (
        <View style={styles.score} accessible accessibilityLabel={`Rated ${formatScore(score)} out of 10`}>
          <Text style={styles.scoreText}>{formatScore(score)}</Text>
        </View>
      )}
      {!nextEntryId && score === null && onRate && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Rate ${track.title}`}
          onPress={() => onRate(track)}
          android_ripple={{ color: palette.primaryContainer }}
          style={({ pressed }) => [styles.advance, pressed && styles.advancePressed]}
        >
          {({ pressed }) => <Text style={[styles.advanceText, pressed && styles.advanceTextPressed]}>Rate</Text>}
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
    score: {
      minWidth: 48,
      height: 32,
      paddingHorizontal: 8,
      borderRadius: radius.full,
      backgroundColor: c.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreText: { ...font.titleSmall, color: c.onPrimaryContainer, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
