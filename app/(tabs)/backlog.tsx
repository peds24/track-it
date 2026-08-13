import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { advanceEntry } from '@/data/trackRepo';
import type { Category } from '@/domain/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { FilterBar } from '@/ui/FilterBar';
import { theme } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';
import { useTracks } from '@/ui/useTracks';

export default function BacklogScreen() {
  const db = useDatabase();
  const [category, setCategory] = useState<Category | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { tracks, reload } = useTracks(showDone ? 'done' : 'backlog', category ?? undefined);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /**
   * Mirrors the Currently screen: `onAdvance` is fire-and-forget, so a stale tap
   * can hit an entry that is already done and throw — surface it, and reload
   * either way so the list resynchronises with what is actually stored.
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
        <Text style={styles.title}>{showDone ? 'Done' : 'Backlog'}</Text>
      </View>

      <FilterBar
        category={category}
        onCategoryChange={setCategory}
        showDone={showDone}
        onShowDoneChange={setShowDone}
      />

      <FlatList
        data={tracks}
        keyExtractor={(t) => `${t.kind}:${t.id}`}
        renderItem={({ item }) => <TrackRow track={item} onAdvance={handleAdvance} />}
        ListEmptyComponent={<Text style={styles.empty}>Nothing here yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  header: { paddingHorizontal: theme.space.lg, paddingVertical: theme.space.md },
  title: { ...theme.font.title, color: theme.color.text },
  empty: { ...theme.font.meta, color: theme.color.muted, padding: theme.space.lg },
});
