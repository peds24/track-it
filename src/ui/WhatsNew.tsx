import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { markAnnounced, pendingAnnouncement } from '@/data/whatsNew';
import type { ReleaseNote } from '@/domain/whatsNew';
import { useDatabase } from '@/ui/DatabaseProvider';
import { RELEASE_NOTES } from '@/ui/releaseNotes';
import { elevation, font, radius, space, useTheme, type Palette } from '@/ui/theme';

/**
 * A27: the first launch after an update shows what changed, once. Dismissing
 * it records the version; a failed check simply shows nothing.
 */
export function WhatsNew({ version, notes = RELEASE_NOTES }: { version: string; notes?: readonly ReleaseNote[] }) {
  const db = useDatabase();
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [note, setNote] = useState<ReleaseNote | null>(null);

  useEffect(() => {
    let cancelled = false;
    pendingAnnouncement(db, version, notes)
      .then((n) => {
        if (!cancelled) setNote(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [db, version, notes]);

  function dismiss(): void {
    setNote(null);
    void markAnnounced(db, version).catch(() => {});
  }

  return (
    <Modal visible={note !== null} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{note?.title}</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {note?.items.map((item) => (
              <View key={item.heading} style={styles.item}>
                <Text style={styles.heading}>{item.heading}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable style={styles.button} accessibilityRole="button" onPress={dismiss}>
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: c.scrim + '66', alignItems: 'center', justifyContent: 'center', padding: space.lg },
    card: { width: '100%', maxHeight: '85%', backgroundColor: c.surfaceContainerHigh, borderRadius: radius.xl, padding: space.lg, ...elevation.level3 },
    title: { ...font.headlineSmall, color: c.onSurface, fontWeight: '700', marginBottom: 12 },
    list: { flexGrow: 0 },
    listContent: { gap: 14 },
    item: { gap: 2 },
    heading: { ...font.titleMedium, color: c.onSurface, fontWeight: '700' },
    body: { ...font.bodyMedium, color: c.onSurfaceVariant, lineHeight: 20 },
    button: { alignSelf: 'flex-end', marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: c.primary, borderRadius: radius.full },
    buttonText: { ...font.labelLarge, color: c.onPrimary, fontWeight: '700' },
  });
}
