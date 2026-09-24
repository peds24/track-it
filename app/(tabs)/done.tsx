import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  advanceEntry,
  deleteTrack,
  renameTrack,
  resumeTrack,
  returnTrackToBacklog,
  type TrackSummary,
} from '@/data/trackRepo';
import { syncUnitForEntry } from '@/data/syncSeriesUnit';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FEEDBACK_EMAIL, feedbackMailto } from '@/ui/feedback';
import { FilterBar } from '@/ui/FilterBar';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import { useTracks } from '@/ui/useTracks';
import appConfig from '../../app.json';

export default function DoneScreen() {
  const db = useDatabase();
  const router = useRouter();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
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
      // A25: a catalogued comic moves its cover and issue number along.
      if (await syncUnitForEntry(db, entryId).catch(() => false)) await reloadSafely();
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

  // A25: hand the message to the user's mail app, pre-addressed — there is
  // no server to post it to. Kept open with the text intact if that fails.
  function handleSendFeedback(): void {
    const url = feedbackMailto(feedback, { version: appConfig.expo.version, platform: Platform.OS });
    void (async () => {
      try {
        await Linking.openURL(url);
        setFeedback('');
        setFeedbackOpen(false);
      } catch {
        Alert.alert('No mail app found', `You can email your feedback to ${FEEDBACK_EMAIL}.`);
      }
    })();
  }

  // A22: a row's text opens the track's own screen.
  function handleOpen(track: TrackSummary): void {
    router.push(`/track/${track.kind}/${track.id}`);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Done</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setFeedbackOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            style={styles.feedbackButton}
            android_ripple={{ color: palette.surfaceContainerHighest, borderless: true }}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.onSurface} />
            <Text style={styles.feedbackButtonText}>Feedback</Text>
          </Pressable>
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
            onOpen={handleOpen}
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
        visible={feedbackOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send feedback</Text>
            <Text style={styles.modalBody}>
              Something broken, missing, or great? It opens in your mail app, addressed to the developer.
            </Text>
            <TextInput
              style={styles.feedbackInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Your feedback"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="Your feedback"
              multiline
              textAlignVertical="top"
              autoFocus
              cursorColor={palette.primary}
              selectionColor={palette.primaryContainer}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setFeedbackOpen(false)}
                accessibilityRole="button"
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSendFeedback}
                disabled={feedback.trim().length === 0}
                accessibilityRole="button"
                accessibilityState={{ disabled: feedback.trim().length === 0 }}
                style={[styles.modalClose, feedback.trim().length === 0 && styles.disabled]}
              >
                <Text style={styles.modalCloseText}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    feedbackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      backgroundColor: c.surfaceContainerHigh,
    },
    feedbackButtonText: { ...font.labelLarge, color: c.onSurface, fontWeight: '600' },
    feedbackInput: {
      ...font.bodyLarge,
      color: c.onSurface,
      minHeight: 120,
      maxHeight: 240,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.outline,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceContainerLowest,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
    modalCancel: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 16 },
    modalCancelText: { ...font.labelLarge, color: c.primary, fontWeight: '600' },
    disabled: { opacity: 0.4 },
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

