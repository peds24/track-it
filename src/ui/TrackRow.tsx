import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
 * A11: replaces the whole-series `positionLabel` when a show has season
 * data and is actively being watched — "S3 Ep 15 of 24" instead of
 * "Watching Episode 61".
 */
export function seasonPositionLabel(track: TrackSummary): string | null {
  if (track.shelf !== 'currently' || !track.seasons || track.seasons.length === 0 || !track.progress) {
    return null;
  }
  const current = currentSeason(track.seasons, track.progress.done);
  if (!current) return null;
  return `S${current.number} Ep ${current.nextEpisode} of ${current.episodeCount}`;
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

export function TrackRow({
  track,
  onAdvance,
  onResume,
  onEditProgress,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onEditProgress?: (track: TrackSummary) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { nextEntryId, nextEntryTitle, progress } = track;

  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  const startLabel = track.category === 'movie' ? 'Watched' : 'Start';
  const editable = onEditProgress !== undefined && canEditPosition(track);

  const fraction =
    progress && progress.total > 0 && track.shelf !== 'done'
      ? Math.min(1, Math.max(0, progress.done / progress.total))
      : null;

  const segments =
    track.shelf === 'currently' && track.seasons && track.seasons.length > 0 && track.progress
      ? seasonSegments(track.seasons, track.progress.done)
      : null;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>

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

