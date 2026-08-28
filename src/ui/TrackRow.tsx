import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { currentSeason, seasonSegments } from '@/domain/seasons';
import type { Category } from '@/domain/types';
import { font, layout, radius, underline, useTheme, type Palette } from '@/ui/theme';

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

/** "watched" vs "read" is presentation only — the database stores neither. */
function verbFor(category: Category): string {
  return READ_CATEGORIES.includes(category) ? 'read' : 'watched';
}

/**
 * The medium is a word, not a colour (design language, "Principles"). Every kind
 * gets the same underline, so the mark identifies a class of information rather
 * than sorting rows into five groups.
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
    // A10: an episode does have an in_progress state now, same as a volume,
    // but "Watching" stays unconditional here rather than splitting into a
    // Reading/Next-style pair — a series only reaches Currently once its next
    // episode is either being watched or was just auto-started by finishing
    // the one before it (A5), so an unstarted-but-current episode is not a
    // state this app's flows actually produce.
    if (!read) return `Watching ${track.nextEntryTitle}`;
    // Read mode does distinguish: an entry already in progress is one you are
    // part-way through, one still unstarted is one you have not opened yet —
    // "Reading Volume 5" vs "Next Issue 13".
    const verb = track.nextEntryStatus === 'in_progress' ? 'Reading' : 'Next';
    return `${verb} ${track.nextEntryTitle}`;
  }
  return read ? 'Reading' : 'Watching';
}

/**
 * A11: replaces the whole-series `positionLabel` when a show has season
 * data and is actively being watched — "S3 Ep 15 of 24" instead of
 * "Watching Episode 61". Scoped to the Currently shelf specifically: a
 * not-yet-started or paused show keeps its existing "Not started"/"Paused"
 * wording, which a season fraction would misrepresent.
 */
export function seasonPositionLabel(track: TrackSummary): string | null {
  if (track.shelf !== 'currently' || !track.seasons || track.seasons.length === 0 || !track.progress) {
    return null;
  }
  const current = currentSeason(track.seasons, track.progress.done);
  if (!current) return null;
  return `S${current.number} Ep ${current.nextEpisode} of ${current.episodeCount}`;
}

/**
 * A12: whether holding the advance control should open the progress editor.
 * A position is only a thing a finite series has — a movie or a standalone
 * book has no units to be part-way through, and an ongoing series (A4) has no
 * total for a position to sit inside. Scoped to Currently for the same reason
 * `seasonPositionLabel` is: the gesture is attached to the Done button, and a
 * backlog row's control is Start or Resume, which mean something else.
 */
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

  // A6: a paused row is one that already has progress — Resume must only clear
  // the flag, never advance an entry, or it would silently mark something done
  // that was only ever "left off here".
  const resuming = track.shelf === 'backlog' && track.paused;
  // Nothing has been touched yet, so the control begins the track rather than
  // completing part of it. "Done" on an untouched backlog row claims you have
  // finished something you have not started.
  const starting = track.shelf === 'backlog' && !track.paused;
  // A10: a movie completes in one tap (D2's binary rule, unlike a series
  // episode) — "Start" implies a middle state a movie never has, so its own
  // backlog control says what tapping it actually does. Category-aware, not
  // mode-aware: a standalone book is also read-mode-binary-adjacent in
  // wording terms but genuinely is two-tap, so it keeps "Start".
  const startLabel = track.category === 'movie' ? 'Watched' : 'Start';

  const editable = onEditProgress !== undefined && canEditPosition(track);

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

  // A11: segmented only while actively watching, mirroring seasonPositionLabel's
  // own scoping — a paused or not-yet-started show keeps the flat bar.
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
          <Text style={styles.kind}>{KIND_LABEL[track.category]}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.position} numberOfLines={1}>
            {seasonPositionLabel(track) ?? positionLabel(track)}
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
    kind: { ...font.kind, ...underline, color: c.ink, flexShrink: 0 },
    dot: { ...font.meta, color: c.faint, flexShrink: 0 },
    position: { ...font.meta, color: c.muted, flexShrink: 1 },
    count: { ...font.count, color: c.ink, flexShrink: 0, fontVariant: ['tabular-nums'] },
    progressTrack: {
      height: layout.progressHeight,
      marginTop: 8,
      borderRadius: radius.bar,
      backgroundColor: c.rule,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: radius.bar, backgroundColor: c.ink },
    // A11: hairline gaps between season segments read as dividers — the
    // container's own rule-coloured background (used for the flat bar) is
    // switched off here so the gap shows the row's background instead.
    progressTrackSegmented: { backgroundColor: 'transparent', flexDirection: 'row', gap: 1.5 },
    segment: { height: '100%', backgroundColor: c.rule, overflow: 'hidden' },
    advance: {
      flexShrink: 0,
      paddingVertical: 6,
      paddingHorizontal: 13,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.sm,
    },
    // No accent to fill with — pressed inverts instead, the way an e-ink
    // pixel flips rather than tints.
    advancePressed: { backgroundColor: c.ink, borderColor: c.ink },
    advanceText: { ...font.control, color: c.ink },
    advanceTextPressed: { color: c.bg },
  });
}
