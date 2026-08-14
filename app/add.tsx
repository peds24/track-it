import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf } from '@/data/trackRepo';
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
  // A4: still being published, so there is no count to ask for.
  const [ongoing, setOngoing] = useState(false);

  const isSeries = category !== null && unitLabelFor(category) !== null;
  const needsCount = isSeries && !ongoing;
  const unit = category ? unitLabelFor(category) : null;

  // `startNow` skips the trip to the Backlog tab and the Start tap that would
  // otherwise follow — the same reason a "Start" swipe or button exists once a
  // track is there, just offered at the moment it is most likely wanted.
  async function handleSave(startNow: boolean) {
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
      const now = new Date().toISOString();
      const created = await addTrack(
        db,
        { title, category, count: parsedCount, ongoing: isSeries && ongoing },
        now,
      );
      if (startNow) {
        const entryId = await firstEntryOf(db, created);
        await advanceEntry(db, entryId, now);
      }
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
        cursorColor={palette.ink}
        selectionColor={palette.ink}
        underlineColorAndroid="transparent"
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
          cursorColor={palette.ink}
          selectionColor={palette.ink}
          underlineColorAndroid="transparent"
        />
      )}

      {/* A4: a series still being published has no count to give. Reusing the
          filter-chip shape rather than a switch keeps the screen to one idiom. */}
      {isSeries && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ongoing }}
          accessibilityLabel="Ongoing series"
          onPress={() => setOngoing((v) => !v)}
          style={[styles.toggle, ongoing && styles.toggleOn]}
        >
          <Text style={[styles.toggleText, ongoing && styles.toggleTextOn]}>
            Ongoing series
          </Text>
        </Pressable>
      )}

      <Pressable
        style={styles.save}
        onPress={() => handleSave(true)}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>Start</Text>
      </Pressable>
      <Pressable
        style={styles.saveSecondary}
        onPress={() => handleSave(false)}
        accessibilityRole="button"
      >
        <Text style={styles.saveSecondaryText}>Add to backlog</Text>
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
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
    },
    toggle: {
      alignSelf: 'flex-start',
      marginHorizontal: layout.inset,
      marginBottom: 10,
      paddingVertical: 6,
      paddingHorizontal: 13,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.chip,
    },
    toggleOn: { backgroundColor: c.ink, borderColor: c.ink },
    toggleText: { ...font.control, color: c.muted },
    toggleTextOn: { color: c.bg },
    // The one filled control on the screen, so it carries ink rather than
    // accent. Start is primary: adding something is usually the first step
    // toward starting it, not toward filing it away.
    save: {
      marginTop: 6,
      marginHorizontal: layout.inset,
      marginBottom: 10,
      padding: 14,
      borderRadius: radius.md,
      backgroundColor: c.ink,
    },
    saveText: { ...font.body, fontWeight: '700', color: c.bg, textAlign: 'center' },
    saveSecondary: {
      marginHorizontal: layout.inset,
      marginBottom: 24,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
    },
    saveSecondaryText: { ...font.body, fontWeight: '700', color: c.ink, textAlign: 'center' },
    note: {
      ...font.meta,
      color: c.muted,
      paddingTop: 10,
      paddingBottom: 24,
      paddingHorizontal: layout.inset,
    },
  });
}
