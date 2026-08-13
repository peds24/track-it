import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exportLibrary, importLibrary } from '@/data/backup';
import { useDatabase } from '@/ui/DatabaseProvider';
import { theme } from '@/ui/theme';

export default function SettingsScreen() {
  const db = useDatabase();

  async function handleExport() {
    try {
      const json = await exportLibrary(db);
      // SDK 57 replaced the string-path FileSystem helpers with File/Paths.
      const file = new File(Paths.cache, 'track-it-backup.json');
      file.create({ overwrite: true });
      file.write(json);
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : String(error));
    }
  }

  async function handleImport() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (picked.canceled || !picked.assets[0]) return;

      const json = await new File(picked.assets[0].uri).text();
      await importLibrary(db, json);
      Alert.alert('Import complete', 'Your library has been replaced.');
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.group}>
        <Pressable style={styles.action} onPress={handleExport} accessibilityRole="button">
          <Text style={styles.actionText}>Export library</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handleImport} accessibilityRole="button">
          <Text style={styles.actionText}>Import library</Text>
        </Pressable>
        <Text style={styles.note}>Importing replaces everything currently in the app.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg, paddingHorizontal: theme.space.lg },
  title: { ...theme.font.title, color: theme.color.text, paddingVertical: theme.space.md },
  group: { gap: theme.space.sm },
  action: { paddingVertical: theme.space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.color.line },
  actionText: { ...theme.font.row, color: theme.color.text },
  note: { ...theme.font.meta, color: theme.color.muted, paddingTop: theme.space.sm },
});
