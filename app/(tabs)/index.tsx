import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  renameTrack,
  resumeTrack,
  returnTrackToBacklog,
  setTrackPosition,
  type TrackSummary,
} from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { elevation, font, googleSans, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { ProgressEditor } from '@/ui/ProgressEditor';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

const CATEGORY_SECTIONS: readonly {
  category: Category;
  title: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { category: 'show', title: 'Shows', iconName: 'tv-outline' },
  { category: 'movie', title: 'Movies', iconName: 'film-outline' },
  { category: 'book', title: 'Books', iconName: 'book-outline' },
  { category: 'comic', title: 'Comics', iconName: 'sparkles-outline' },
  { category: 'manga', title: 'Manga', iconName: 'library-outline' },
];

export default function CurrentlyScreen() {
  const db = useDatabase();
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { tracks, reload } = useTracks('currently');
  const [editing, setEditing] = useState<TrackSummary | null>(null);

  const sections = useMemo(() => {
    return CATEGORY_SECTIONS.map((sec) => {
      // tracks is already ordered by most recently advanced from trackRepo.
      // Filtering maintains recency ordering within each category group.
      const data = tracks.filter((t) => t.category === sec.category);
      return {
        ...sec,
        data,
      };
    }).filter((s) => s.data.length > 0);
  }, [tracks]);

  const reloadSafely = useCallback(async () => {
    try {
      await reload();
    } catch (e: unknown) {
      Alert.alert('Could not load your tracks', e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reloadSafely();
    }, [reloadSafely]),
  );

  function handleAdvance(entryId: string): void {
    void (async () => {
      try {
        await advanceEntry(db, entryId, new Date().toISOString());
      } catch (e: unknown) {
        Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
      }
      await reloadSafely();
    })();
  }

  // A15: purely cosmetic — no confirmation, matching the reversible-action
  // convention Pause already set (D4/A6) — a rename is trivially undone by
  // renaming again, so it needs no dialog in the way.
  function handleRename(track: TrackSummary, title: string): void {
    void (async () => {
      try {
        await renameTrack(db, track, title);
      } catch (e: unknown) {
        Alert.alert('Could not rename track', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  function handleDelete(track: TrackSummary): void {
    void (async () => {
      try {
        await deleteTrack(db, track);
      } catch (e: unknown) {
        Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  function handleReturnToBacklog(track: TrackSummary): void {
    void (async () => {
      try {
        await returnTrackToBacklog(db, track);
      } catch (e: unknown) {
        Alert.alert('Could not move track', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  function handleSetPosition(track: TrackSummary, ordinal: number): void {
    setEditing(null);
    void (async () => {
      try {
        await setTrackPosition(db, track.id, ordinal, new Date().toISOString());
      } catch (e: unknown) {
        Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
      }
      await reloadSafely();
    })();
  }

  function handleResume(track: TrackSummary): void {
    void (async () => {
      try {
        await resumeTrack(db, track);
      } catch (e: unknown) {
        Alert.alert('Could not resume track', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Currently</Text>
        <Pressable
          onPress={() => router.push('/add')}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Add a track"
        >
          <Text style={styles.addText}>+ Add</Text>
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBadge}>
              <Ionicons name={section.iconName} size={15} color={palette.primary} />
            </View>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <SwipeableTrackRow
            track={item}
            onAdvance={handleAdvance}
            onResume={handleResume}
            onRename={handleRename}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
            onEditProgress={setEditing}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nothing on the go</Text>
            <Text style={styles.empty}>
              Add something new, or start a track from your backlog.
            </Text>
          </View>
        }
      />

      <ProgressEditor
        track={editing}
        onCancel={() => setEditing(null)}
        onSubmit={handleSetPosition}
      />
    </SafeAreaView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
      backgroundColor: c.surface,
    },
    title: {
      ...font.headlineMedium,
      color: c.onSurface,
      fontWeight: '700',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 36,
      paddingHorizontal: 16,
      backgroundColor: c.primary,
      borderRadius: radius.full,
      ...elevation.level1,
    },
    addButtonPressed: {
      opacity: 0.85,
    },
    addText: {
      ...font.labelLarge,
      fontWeight: '700',
      color: c.onPrimary,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 22,
      paddingBottom: 10,
      paddingHorizontal: layout.inset,
      backgroundColor: c.surface,
      gap: 10,
    },
    sectionIconBadge: {
      width: 28,
      height: 28,
      borderRadius: radius.xs,
      backgroundColor: c.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontFamily: googleSans,
      fontSize: 19,
      lineHeight: 26,
      color: c.onSurface,
      fontWeight: '700',
      letterSpacing: -0.15,
    },
    sectionCount: {
      ...font.labelMedium,
      color: c.onSurfaceVariant,
      backgroundColor: c.surfaceContainerHigh,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      fontVariant: ['tabular-nums'],
    },
    emptyContainer: {
      margin: layout.inset,
      padding: space.lg,
      backgroundColor: c.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      alignItems: 'center',
    },
    emptyTitle: {
      ...font.titleMedium,
      color: c.onSurface,
      fontWeight: '600',
      marginBottom: 6,
    },
    empty: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      textAlign: 'center',
    },
  });
}


