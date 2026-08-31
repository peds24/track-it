import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary,
} from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function BacklogScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const { tracks, reload } = useTracks('backlog', category ?? undefined);

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
        <Text style={styles.title}>Backlog</Text>
      </View>

      <FilterBar category={category} onCategoryChange={setCategory} />

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => (
          <SwipeableTrackRow
            track={item}
            onAdvance={handleAdvance}
            onResume={handleResume}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.empty}>Tracks in your backlog will appear here.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    header: {
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

