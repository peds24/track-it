import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Category } from '@/domain/types';
import { font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

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
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

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

function createStyles(c: Palette) {
  return StyleSheet.create({
    bar: {
      paddingTop: 2,
      paddingBottom: space.md,
      paddingHorizontal: layout.inset,
      gap: 7,
    },
    chip: {
      flexShrink: 0,
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: c.rule,
      backgroundColor: 'transparent',
    },
    // Active is filled with ink and reversed — one signal, not colour plus weight.
    chipActive: { backgroundColor: c.ink, borderColor: c.ink },
    chipText: { ...font.meta, color: c.muted },
    chipTextActive: { color: c.bg },
  });
}
