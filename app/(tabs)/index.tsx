import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  resumeTrack,
  returnTrackToBacklog,
  setTrackPosition,
  type TrackSummary, } from '@/data/trackRepo';
import { useDatabase } from '@/ui/DatabaseProvider';
import { font, layout, underline, useTheme, type Palette } from '@/ui/theme';
import { ProgressEditor } from '@/ui/ProgressEditor';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function CurrentlyScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { tracks, reload } = useTracks('currently');
  /** A12: the track whose position is being edited, or null when closed. */
  const [editing, setEditing] = useState<TrackSummary | null>(null);

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
   * `onAdvance` is fire-and-forget, so nothing downstream can await this. A
   * double tap before the first reload lands means the second advance hits an
   * entry that is already done and throws — surface it, and reload either way so
   * the list resynchronises with what is actually stored. The reload sits after
   * the try rather than inside a `finally`, where its own rejection would escape
   * the catch above it and go unhandled.
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

  /**
   * A12: the editor is dismissed before the write, not after it. The write is
   * fire-and-forget like handleAdvance, and leaving the dialog up until the
   * reload lands would make a one-tap save look like it had hung.
   */
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
        <Text style={styles.title}>Track It</Text>
        <Link href="/add" style={styles.add} accessibilityLabel="Add a track">
          Add
        </Link>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => <SwipeableTrackRow
            track={item}
            onAdvance={handleAdvance}
            onResume={handleResume}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
            onEditProgress={setEditing}
          />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing on the go. Add something, or start something from your backlog.
          </Text>
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
    screen: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: layout.rowGap,
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
    },
    title: { ...font.screenTitle, color: c.ink },
    add: { ...font.body, ...underline, fontWeight: '600', color: c.ink },
    empty: {
      // 14pt: the empty state sits between meta and body, per the mockup.
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
