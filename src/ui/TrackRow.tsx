import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { font, layout, radius, useTheme, type Palette } from '@/ui/theme';

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

/** "watched" vs "read" is presentation only — the database stores neither. */
function verbFor(category: Category): string {
  return READ_CATEGORIES.includes(category) ? 'read' : 'watched';
}

/**
 * The medium is a word, not a colour (design language, "Principles"). Every kind
 * uses the same accent, so the colour marks a class of information rather than
 * sorting rows into five groups.
 */
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
  if (track.shelf === 'backlog') return 'Not started';
  if (track.nextEntryTitle && track.nextEntryTitle !== track.title) {
    // An entry already in progress is one you are part-way through, not one you
    // are about to begin. Only read mode ever reaches in_progress (D2), which is
    // why the mockups show "Reading Volume 5" but "Next Issue 13".
    const verb = track.nextEntryStatus === 'in_progress' ? 'Reading' : 'Next';
    return `${verb} ${track.nextEntryTitle}`;
  }
  return read ? 'Reading' : 'Watching';
}

export function TrackRow({
  track,
  onAdvance,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { nextEntryId, nextEntryTitle, progress } = track;

  // Only a series has something to be part-way through numerically; a standalone
  // book or movie draws no bar, and the absence is the signal.
  //
  // A finished series draws no bar either. The bar exists to show how far in you
  // are, which is not a question a completed track raises — and the Done shelf is
  // deliberately de-emphasised, so a full-width accent bar on every row would make
  // the least important screen the most colourful one in the app.
  const fraction =
    progress && progress.total > 0 && track.shelf !== 'done'
      ? Math.min(1, Math.max(0, progress.done / progress.total))
      : null;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>

        <View style={styles.meta}>
          <Text style={styles.kind}>{KIND_LABEL[track.category]}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.position} numberOfLines={1}>
            {positionLabel(track)}
          </Text>
          {/* A4: an ongoing series has no denominator, so the word replaces the
              count rather than a total the app would have to invent. */}
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
          <View style={styles.progressTrack} testID="progress-track">
            <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
          </View>
        )}
      </View>

      {nextEntryId && nextEntryTitle && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${nextEntryTitle} ${verbFor(track.category)}`}
          onPress={() => onAdvance(nextEntryId)}
          style={({ pressed }) => [styles.advance, pressed && styles.advancePressed]}
        >
          {({ pressed }) => (
            <Text style={[styles.advanceText, pressed && styles.advanceTextPressed]}>Done</Text>
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
      // Rows are separated by a hairline, not a card.
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    text: { flex: 1, minWidth: 0 },
    title: { ...font.rowTitle, color: c.ink },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.metaGap,
      marginTop: 3,
    },
    kind: { ...font.kind, color: c.accent, flexShrink: 0 },
    dot: { ...font.meta, color: c.faint, flexShrink: 0 },
    position: { ...font.meta, color: c.muted, flexShrink: 1 },
    count: { ...font.meta, color: c.muted, flexShrink: 0, fontVariant: ['tabular-nums'] },
    progressTrack: {
      height: layout.progressHeight,
      marginTop: 8,
      borderRadius: radius.bar,
      backgroundColor: c.rule,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: radius.bar, backgroundColor: c.accent },
    advance: {
      flexShrink: 0,
      paddingVertical: 6,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: c.rule,
      borderRadius: radius.sm,
    },
    // Fills with accent only while held.
    advancePressed: { backgroundColor: c.accent, borderColor: c.accent },
    advanceText: { ...font.control, color: c.ink },
    advanceTextPressed: { color: c.onAccent },
  });
}
