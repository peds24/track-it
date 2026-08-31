import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  renameTrack,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary,
} from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function DoneScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const { tracks, reload } = useTracks('done', category ?? undefined);

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
        <Text style={styles.title}>Done</Text>
        <Pressable
          onPress={() => setAttributionOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="About the data on this screen"
          style={styles.attributionButton}
          android_ripple={{ color: palette.surfaceContainerHighest, borderless: true }}
        >
          <Text style={styles.attributionButtonText}>?</Text>
        </Pressable>
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
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Nothing finished yet</Text>
            <Text style={styles.empty}>Completed tracks will be listed here.</Text>
          </View>
        }
        ListFooterComponent={
          tracks.length > 0 ? (
            <Text style={styles.note}>Nothing here can be advanced, so no control is drawn.</Text>
          ) : null
        }
      />

      <Modal
        visible={attributionOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttributionOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Data sources</Text>
            <Text style={styles.modalBody}>
              This product uses the TMDB API but is not endorsed or certified by TMDB.
            </Text>
            <Text style={styles.modalBody}>
              Book and manga data from Google Books. Comic data from Metron.
            </Text>
            <Pressable
              onPress={() => setAttributionOpen(false)}
              accessibilityRole="button"
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    attributionButton: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: c.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attributionButtonText: {
      ...font.titleMedium,
      color: c.onSurface,
      fontWeight: '600',
    },
    note: {
      ...font.bodySmall,
      color: c.onSurfaceVariant,
      paddingTop: 12,
      paddingBottom: 24,
      paddingHorizontal: layout.inset,
      textAlign: 'center',
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
    modalBackdrop: {
      flex: 1,
      backgroundColor: c.scrim + '66',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.lg,
    },
    modalCard: {
      width: '100%',
      backgroundColor: c.surfaceContainerHigh,
      borderRadius: radius.xl,
      padding: space.lg,
      ...elevation.level3,
    },
    modalTitle: {
      ...font.headlineSmall,
      color: c.onSurface,
      marginBottom: 12,
      fontWeight: '600',
    },
    modalBody: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      marginBottom: 12,
      lineHeight: 20,
    },
    modalClose: {
      alignSelf: 'flex-end',
      marginTop: 8,
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: c.primary,
      borderRadius: radius.full,
    },
    modalCloseText: {
      ...font.labelLarge,
      color: c.onPrimary,
      fontWeight: '600',
    },
  });
}

