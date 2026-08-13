import { Link, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { advanceEntry } from '@/data/trackRepo';
import { useDatabase } from '@/ui/DatabaseProvider';
import { theme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';
import { useTracks } from '@/ui/useTracks';

export default function CurrentlyScreen() {
  const db = useDatabase();
  const { tracks, reload } = useTracks('currently');

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /**
   * `onAdvance` is fire-and-forget, so nothing downstream can await this. A
   * double tap before the first reload lands means the second advance hits an
   * entry that is already done and throws — surface it, and reload either way so
   * the list resynchronises with what is actually stored.
   */
  function handleAdvance(entryId: string): void {
    void (async () => {
      try {
        await advanceEntry(db, entryId, new Date().toISOString());
      } catch (e: unknown) {
        Alert.alert('Could not update', e instanceof Error ? e.message : String(e));
      } finally {
        await reload();
      }
    })();
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Currently</Text>
        <Link href="/add" style={styles.add} accessibilityLabel="Add a track">
          Add
        </Link>
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => <TrackRow track={item} onAdvance={handleAdvance} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Nothing on the go. Add something, or start something from your backlog.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  title: { ...theme.font.title, color: theme.color.text },
  add: { ...theme.font.row, color: theme.color.accent },
  empty: { ...theme.font.meta, color: theme.color.muted, padding: theme.space.lg },
});
