import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { initialsOf } from '@/domain/formatters';
import type { Category } from '@/domain/types';
import { font, radius, useTheme, type Palette } from '@/ui/theme';

export const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  show: 'tv-outline',
  movie: 'film-outline',
  book: 'book-outline',
  comic: 'sparkles-outline',
  manga: 'library-outline',
};

/**
 * A22: a track's cover or poster, or — for a hand-typed track, a catalogue
 * with no art, or an image that fails to load — a placeholder tile, so the
 * layout never collapses around a missing picture. Built on RN's own
 * `Image`: no new native module, so no new build (see toolchain notes), and
 * it renders on web as-is.
 */
export function CoverImage({
  uri,
  title,
  category,
  width,
  height,
}: {
  uri: string | null | undefined;
  title: string;
  category: Category;
  width: number;
  height: number;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  // Remember *which* uri failed rather than a bare flag, so a later uri (a
  // failed thumbnail replaced by the full cover) gets its own chance to load.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = !!uri && failedUri === uri;
  const size = { width, height };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.frame, size]}
        resizeMode="cover"
        accessibilityLabel={`${title} cover`}
        onError={() => setFailedUri(uri)}
      />
    );
  }

  const compact = width < 80;
  return (
    <View testID="cover-placeholder" style={[styles.frame, styles.placeholder, size]}>
      <Ionicons name={CATEGORY_ICON[category]} size={compact ? 18 : 32} color={c.onSurfaceVariant} />
      {!compact && <Text style={styles.initials}>{initialsOf(title)}</Text>}
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    frame: {
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.outlineVariant,
      backgroundColor: c.surfaceContainerHigh,
    },
    placeholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
    initials: { ...font.titleLarge, color: c.onSurfaceVariant, fontWeight: '700' },
  });
}
