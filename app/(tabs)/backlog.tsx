import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  renameTrack,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary, } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { font, layout, useTheme, type Palette } from '@/ui/theme';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function BacklogScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const { tracks, reload } = useTracks('backlog', category ?? undefined);

  /** A failed read has to reach the user; an unhandled rejection would not. */
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

  /**
   * Mirrors the Currently screen: `onAdvance` is fire-and-forget, so a stale tap
   * can hit an entry that is already done and throw — surface it, and reload
   * either way so the list resynchronises with what is actually stored. The
   * reload sits after the try rather than inside a `finally`, where its own
   * rejection would escape the catch above it and go unhandled.
   */
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
        <Text style={styles.title}>Backlog</Text>
      </View>

      <FilterBar category={category} onCategoryChange={setCategory} />

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => <SwipeableTrackRow
            track={item}
            onAdvance={handleAdvance}
            onResume={handleResume}
            onRename={handleRename}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
          />}
        ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
      />
    </SafeAreaView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
    },
    title: { ...font.screenTitle, color: c.ink },
    empty: {
      fontSize: 14,
      color: c.muted,
      paddingTop: 18,
      paddingBottom: 26,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
  });
}
