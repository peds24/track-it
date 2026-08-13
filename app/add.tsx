import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import type { Category } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { useDatabase } from '@/ui/DatabaseProvider';
import { font, layout, radius, useTheme, type Palette } from '@/ui/theme';

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
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  // Empty, not '1' — a pre-filled value hides the "How many volumes?" prompt
  // and has to be cleared before it can be typed over.
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);

  const needsCount = category !== null && unitLabelFor(category) !== null;
  const unit = category ? unitLabelFor(category) : null;

  async function handleSave() {
    if (!category) return;
    // A second tap before the insert resolves would create a second track, and
    // there is no delete UI to undo it.
    if (saving) return;

    // Parsed strictly: "2.5" or "abc" must be an error, not a silent 1.
    const parsedCount = /^\d+$/.test(count.trim()) ? Number.parseInt(count.trim(), 10) : Number.NaN;
    if (needsCount && !Number.isInteger(parsedCount)) {
      Alert.alert('Could not add track', `Enter how many ${unit}s as a whole number`);
      return;
    }

    setSaving(true);
    try {
      await addTrack(db, { title, category, count: parsedCount }, new Date().toISOString());
      router.back();
    } catch (error) {
      Alert.alert('Could not add track', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  // Category first, always — it decides which catalogue answers later (D10).
  if (category === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.prompt}>What are you adding?</Text>
        </View>
        {CATEGORIES.map((c) => (
          <Pressable key={c.value} style={styles.option} onPress={() => setCategory(c.value)}>
            <Text style={styles.optionText}>{c.label}</Text>
          </Pressable>
        ))}
        <Text style={styles.note}>
          The category is always chosen first. It decides which catalogue answers later.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.prompt}>{CATEGORIES.find((c) => c.value === category)?.label}</Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Title"
        placeholderTextColor={palette.faint}
        accessibilityLabel="Title"
        value={title}
        onChangeText={setTitle}
        autoFocus
      />

      {needsCount && (
        <TextInput
          style={styles.input}
          placeholder={`How many ${unit}s?`}
          placeholderTextColor={palette.faint}
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

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    header: {
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
    },
    prompt: { ...font.screenTitle, color: c.ink },
    option: {
      paddingVertical: 15,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    optionText: { ...font.option, color: c.ink },
    input: {
      ...font.body,
      color: c.ink,
      marginHorizontal: layout.inset,
      marginBottom: 10,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: c.rule,
      borderRadius: radius.md,
    },
    // The one filled control on the screen, so it carries ink rather than accent.
    save: {
      marginTop: 6,
      marginHorizontal: layout.inset,
      marginBottom: 24,
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: c.ink,
    },
    saveText: { ...font.body, color: c.bg, textAlign: 'center' },
    note: {
      ...font.meta,
      color: c.muted,
      paddingTop: 10,
      paddingBottom: 24,
      paddingHorizontal: layout.inset,
    },
  });
}
