import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SearchResult } from '@/providers/types';
import { CoverImage } from '@/ui/CoverImage';
import { font, useTheme, type Palette } from '@/ui/theme';

/** A24: enough to tell two same-named hits apart — cover, who, and when. */
export function SearchResultRow({ result, onPress }: { result: SearchResult; onPress: (r: SearchResult) => void }) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const subtitle = [result.creator, result.year].filter((s): s is string => !!s).join(' · ');

  return (
    <Pressable
      style={styles.row}
      onPress={() => onPress(result)}
      accessibilityRole="button"
      android_ripple={{ color: c.surfaceContainerHighest }}
    >
      <CoverImage uri={result.thumbnailUrl} title={result.title} category={result.category} width={40} height={60} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {result.title}
        </Text>
        {subtitle.length > 0 && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.outlineVariant,
    },
    text: { flex: 1, minWidth: 0 },
    title: { ...font.bodyLarge, color: c.onSurface },
    subtitle: { ...font.bodySmall, color: c.onSurfaceVariant, marginTop: 2 },
  });
}
