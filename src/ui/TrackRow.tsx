import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { theme } from '@/ui/theme';

const READ_CATEGORIES: readonly Category[] = ['book', 'comic', 'manga'];

/** "watched" vs "read" is presentation only — the database stores neither. */
function verbFor(category: Category): string {
  return READ_CATEGORIES.includes(category) ? 'read' : 'watched';
}

export function TrackRow({
  track,
  onAdvance,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
}) {
  const { nextEntryId, nextEntryTitle, progress } = track;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {nextEntryTitle && nextEntryTitle !== track.title ? `Next: ${nextEntryTitle}` : ''}
          {progress
            ? `${nextEntryTitle && nextEntryTitle !== track.title ? '  ·  ' : ''}${progress.done} of ${progress.total}`
            : ''}
        </Text>
      </View>

      {nextEntryId && nextEntryTitle && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${nextEntryTitle} ${verbFor(track.category)}`}
          onPress={() => onAdvance(nextEntryId)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
    gap: theme.space.md,
  },
  text: { flex: 1 },
  title: { ...theme.font.row, color: theme.color.text },
  meta: { ...theme.font.meta, color: theme.color.muted, marginTop: 2 },
  button: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  buttonText: { ...theme.font.meta, color: theme.color.text },
});
