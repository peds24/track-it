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
}: {
  category: Category | null;
  onCategoryChange: (next: Category | null) => void;
}) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.bar}
    >
      {CATEGORIES.map((c) => {
        const active = category === c.value;
        return (
          <Pressable
            key={c.value}
            style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
            onPress={() => onCategoryChange(active ? null : c.value)}
            android_ripple={{ color: palette.surfaceContainerHighest, borderless: false }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    scroller: { flexGrow: 0, flexShrink: 0 },
    bar: {
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: space.sm,
      paddingHorizontal: layout.inset,
      gap: 8,
    },
    chip: {
      flexShrink: 0,
      height: 32,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      justifyContent: 'center',
      alignItems: 'center',
    },
    chipInactive: {
      backgroundColor: c.surfaceContainerLow,
      borderWidth: 1,
      borderColor: c.outlineVariant,
    },
    chipActive: {
      backgroundColor: c.secondaryContainer,
      borderWidth: 1,
      borderColor: c.secondaryContainer,
    },
    chipText: {
      ...font.labelLarge,
    },
    chipTextInactive: {
      color: c.onSurfaceVariant,
    },
    chipTextActive: {
      color: c.onSecondaryContainer,
      fontWeight: '600',
    },
  });
}

