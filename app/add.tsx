import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { useDatabase } from '@/ui/DatabaseProvider';
import { theme } from '@/ui/theme';

const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'movie', label: 'Movie' },
  { value: 'book', label: 'Book' },
  { value: 'comic', label: 'Comic' },
  { value: 'manga', label: 'Manga' },
];

export default function AddTrackScreen() {
  const db = useDatabase();
  const router = useRouter();
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('1');

  const needsCount = category !== null && unitLabelFor(category) !== null;
  const unit = category ? unitLabelFor(category) : null;

  async function handleSave() {
    if (!category) return;
    try {
      await addTrack(db, { title, category, count: Number(count) || 1 }, new Date().toISOString());
      router.back();
    } catch (error) {
      Alert.alert('Could not add track', error instanceof Error ? error.message : String(error));
    }
  }

  // Category first, always — it decides which catalogue answers later (D10).
  if (category === null) {
    return (
      <View style={styles.screen}>
        <Text style={styles.prompt}>What are you adding?</Text>
        {CATEGORIES.map((c) => (
          <Pressable key={c.value} style={styles.option} onPress={() => setCategory(c.value)}>
            <Text style={styles.optionText}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.prompt}>{CATEGORIES.find((c) => c.value === category)?.label}</Text>

      <TextInput
        style={styles.input}
        placeholder="Title"
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        autoFocus
      />

      {needsCount && (
        <TextInput
          style={styles.input}
          placeholder={`How many ${unit}s?`}
          accessibilityLabel="Count"
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
        />
      )}

      <Pressable style={styles.save} onPress={handleSave} accessibilityRole="button">
        <Text style={styles.saveText}>Add to backlog</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg, padding: theme.space.lg, gap: theme.space.sm },
  prompt: { ...theme.font.title, color: theme.color.text, marginBottom: theme.space.md },
  option: {
    paddingVertical: theme.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  optionText: { ...theme.font.row, color: theme.color.text },
  input: {
    ...theme.font.row,
    color: theme.color.text,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.sm,
    padding: theme.space.md,
  },
  save: {
    marginTop: theme.space.md,
    padding: theme.space.md,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.accent,
  },
  saveText: { ...theme.font.row, color: theme.color.bg, textAlign: 'center' },
});
