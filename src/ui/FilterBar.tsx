import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Category } from '@/domain/types';
import { theme } from '@/ui/theme';

const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'show', label: 'Shows' },
  { value: 'movie', label: 'Movies' },
  { value: 'book', label: 'Books' },
  { value: 'comic', label: 'Comics' },
  { value: 'manga', label: 'Manga' },
];

export function FilterBar({
  category,
  onCategoryChange,
  showDone,
  onShowDoneChange,
}: {
  category: Category | null;
  onCategoryChange: (next: Category | null) => void;
  showDone: boolean;
  onShowDoneChange: (next: boolean) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar}>
      {CATEGORIES.map((c) => {
        const active = category === c.value;
        return (
          <Pressable
            key={c.value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onCategoryChange(active ? null : c.value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
          </Pressable>
        );
      })}

      {/* Done is reachable without being a destination (D11). */}
      <Pressable
        style={[styles.chip, showDone && styles.chipActive]}
        onPress={() => onShowDoneChange(!showDone)}
      >
        <Text style={[styles.chipText, showDone && styles.chipTextActive]}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: theme.space.lg, paddingBottom: theme.space.md, gap: theme.space.sm },
  chip: {
    paddingVertical: theme.space.xs + 2,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  chipActive: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  chipText: { ...theme.font.meta, color: theme.color.muted },
  chipTextActive: { color: theme.color.bg },
});
