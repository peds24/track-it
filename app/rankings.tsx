import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { listRanking, type RankedTrack } from '@/data/ratingRepo';
import { formatScore } from '@/domain/rating';
import type { Category } from '@/domain/types';
import { CoverImage } from '@/ui/CoverImage';
import { useDatabase } from '@/ui/DatabaseProvider';
import { CATEGORY_PLURAL, sentimentColors } from '@/ui/rating';
import { font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

const CATEGORIES: readonly { value: Category; label: string; iconName: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'movie', label: 'Movies', iconName: 'film-outline' },
  { value: 'show', label: 'Shows', iconName: 'tv-outline' },
  { value: 'book', label: 'Books', iconName: 'book-outline' },
  { value: 'comic', label: 'Comics', iconName: 'sparkles-outline' },
  { value: 'manga', label: 'Manga', iconName: 'library-outline' },
];

function isCategory(value: unknown): value is Category {
  return CATEGORIES.some((c) => c.value === value);
}

/**
 * A26: your ranked list, one category at a time — there is deliberately no
 * "All", since a movie's 8.4 and a book's 8.4 were never compared.
 */
export default function RankingsScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const db = useDatabase();
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [category, setCategory] = useState<Category>(isCategory(params.category) ? params.category : 'movie');
  const [ranking, setRanking] = useState<RankedTrack[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void listRanking(db, category)
        .then((rows) => {
          if (!cancelled) setRanking(rows);
        })
        .catch(() => {
          if (!cancelled) setRanking([]);
        });
      return () => {
        cancelled = true;
      };
    }, [db, category]),
  );

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Rankings' }} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((option) => {
            const selected = option.value === category;
            return (
              <Pressable
                key={option.value}
                onPress={() => setCategory(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Ionicons name={option.iconName} size={16} color={selected ? c.onSecondaryContainer : c.onSurfaceVariant} />
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={ranking}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => {
          const colors = sentimentColors(c, item.sentiment);
          return (
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Number ${item.rank}, ${item.title}, ${formatScore(item.score)} out of 10`}
              onPress={() => router.push(`/track/${item.kind}/${item.id}`)}
              android_ripple={{ color: c.surfaceContainerHighest }}
            >
              <Text style={styles.rank}>{item.rank}</Text>
              <CoverImage uri={item.coverUrl} title={item.title} category={category} width={40} height={60} />
              <View style={styles.text}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {(item.creator || item.releaseYear) && (
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.creator, item.releaseYear].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <View style={[styles.score, { backgroundColor: colors.bg }]}>
                <Text style={[styles.scoreText, { color: colors.fg }]}>{formatScore(item.score)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{`No ${CATEGORY_PLURAL[category]} ranked yet`}</Text>
            <Text style={styles.emptyBody}>
              Finish something and tap Rate — you’ll compare it with the others you’ve rated, and its score comes from where it lands.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    chips: { paddingHorizontal: layout.inset, paddingVertical: space.sm, gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.outlineVariant,
    },
    chipSelected: { backgroundColor: c.secondaryContainer, borderColor: c.secondaryContainer },
    chipText: { ...font.labelLarge, color: c.onSurfaceVariant },
    chipTextSelected: { color: c.onSecondaryContainer, fontWeight: '700' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.outlineVariant,
    },
    rank: { ...font.titleMedium, color: c.onSurfaceVariant, width: 28, textAlign: 'right', fontVariant: ['tabular-nums'] },
    text: { flex: 1, minWidth: 0 },
    title: { ...font.titleMedium, color: c.onSurface },
    meta: { ...font.bodySmall, color: c.onSurfaceVariant, marginTop: 2 },
    score: { minWidth: 48, height: 32, paddingHorizontal: 8, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
    scoreText: { ...font.titleSmall, fontWeight: '700', fontVariant: ['tabular-nums'] },
    empty: {
      margin: layout.inset,
      padding: space.lg,
      backgroundColor: c.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: { ...font.titleMedium, color: c.onSurface, fontWeight: '600' },
    emptyBody: { ...font.bodyMedium, color: c.onSurfaceVariant, textAlign: 'center' },
  });
}
