import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary, } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { font, layout, radius, underline, useTheme, type Palette } from '@/ui/theme';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';

export default function DoneScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const { tracks, reload } = useTracks('done', category ?? undefined);

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
        {/* A9: TMDB's terms require this attribution to be reachable, not
            necessarily visible by default (see the modal below) — the "?"
            sits beside the title rather than in the list, since it is about
            the screen's data sources, not any one row. */}
        <Pressable
          onPress={() => setAttributionOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="About the data on this screen"
          style={styles.attributionButton}
        >
          <Text style={styles.attributionButtonText}>?</Text>
        </Pressable>
      </View>

      <FilterBar category={category} onCategoryChange={setCategory} />

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => <SwipeableTrackRow
            track={item}
            onAdvance={handleAdvance}
            onResume={handleResume}
            onDelete={handleDelete}
            onReturnToBacklog={handleReturnToBacklog}
          />}
        ListEmptyComponent={<Text style={styles.empty}>Nothing finished yet.</Text>}
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
            {/* Verbatim, per TMDB's attribution requirement — not paraphrased. */}
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
              <Text style={[styles.modalCloseText, underline]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
    },
    title: { ...font.screenTitle, color: c.ink },
    attributionButton: {
      width: 30,
      height: 30,
      borderRadius: radius.control,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attributionButtonText: { ...font.option, color: c.ink },
    note: {
      ...font.meta,
      color: c.muted,
      paddingTop: 10,
      paddingBottom: 24,
      paddingHorizontal: layout.inset,
    },
    empty: {
      fontSize: 14,
      color: c.muted,
      paddingTop: 18,
      paddingBottom: 26,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: layout.inset,
    },
    modalCard: {
      width: '100%',
      backgroundColor: c.bg,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
      padding: layout.inset,
    },
    modalTitle: { ...font.rowTitle, color: c.ink, marginBottom: 10 },
    modalBody: { ...font.meta, color: c.muted, marginBottom: 10 },
    modalClose: { alignSelf: 'center', marginTop: 4, paddingVertical: 6 },
    modalCloseText: { ...font.control, color: c.muted },
  });
}
