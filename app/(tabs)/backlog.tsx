import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
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
import { showAlert } from '@/ui/alert';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { ProgressEditor } from '@/ui/ProgressEditor';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function BacklogScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [editing, setEditing] = useState<TrackSummary | null>(null);
  const { tracks, reload } = useTracks('backlog', category ?? undefined);

  const reloadSafely = useCallback(async () => {
    try {
      await reload();
    } catch (e: unknown) {
      showAlert('Could not load your tracks', e instanceof Error ? e.message : String(e));
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
        showAlert('Could not update', e instanceof Error ? e.message : String(e));
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
        showAlert('Could not rename track', e instanceof Error ? e.message : String(e));
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
        showAlert('Could not delete', e instanceof Error ? e.message : String(e));
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
        showAlert('Could not move track', e instanceof Error ? e.message : String(e));
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
        showAlert('Could not resume track', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  // A19: setTrackPosition already clears `paused` (A12/A6) — correcting a
  // paused row's position picks it back up, same as tapping Resume would.
  function handleSetPosition(track: TrackSummary, ordinal: number): void {
    setEditing(null);
    void (async () => {
      try {
        await setTrackPosition(db, track.id, ordinal, new Date().toISOString());
      } catch (e: unknown) {
        showAlert('Could not update', e instanceof Error ? e.message : String(e));
      }
      await reloadSafely();
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
            onRename={handleRename}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
            onEditProgress={setEditing}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.empty}>Tracks in your backlog will appear here.</Text>
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

