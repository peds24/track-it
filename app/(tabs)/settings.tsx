import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exportLibrary, importLibrary } from '@/data/backup';
import { useDatabase } from '@/ui/DatabaseProvider';
import { font, layout, useTheme, type Palette } from '@/ui/theme';

/** Named so the success alert can tell the user where the safety net landed. */
const PRE_IMPORT_BACKUP = 'track-it-pre-import-backup.json';

function confirmReplace(fileName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Replace your library?',
      `Importing "${fileName}" replaces everything currently in the app. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false), isPreferred: true },
        { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export default function SettingsScreen() {
  const db = useDatabase();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

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
      // copyToCacheDirectory is explicit: `new File(uri)` throws on the
      // content:// URI Android hands back when the picker does not copy.
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      const asset = picked.canceled ? undefined : picked.assets[0];
      if (!asset) return;

      if (!(await confirmReplace(asset.name || 'this file'))) return;

      const json = await new File(asset.uri).text();

      // Write the current library out before destroying it. If this fails the
      // import must not proceed: an unrecoverable replace with no safety net is
      // exactly the case this whole flow exists to protect against.
      try {
        const safety = new File(Paths.cache, PRE_IMPORT_BACKUP);
        safety.create({ overwrite: true });
        safety.write(await exportLibrary(db));
      } catch (error) {
        Alert.alert(
          'Import cancelled',
          `Could not save a backup of your current library, so nothing was changed. ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }

      await importLibrary(db, json);
      Alert.alert(
        'Import complete',
        `Your library has been replaced. Your previous library was saved as ${PRE_IMPORT_BACKUP} in this app's cache.`,
      );
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View>
        <Pressable style={styles.action} onPress={handleExport} accessibilityRole="button">
          <Text style={styles.actionText}>Export library</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={handleImport} accessibilityRole="button">
          <Text style={styles.actionText}>Import library</Text>
        </Pressable>
        <Text style={styles.note}>
          Importing replaces everything currently in the app. Your library is saved to a backup file
          first, and this cannot be undone.
        </Text>
      </View>
    </SafeAreaView>
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
    title: { ...font.screenTitle, color: c.ink },
    action: {
      paddingVertical: 15,
      paddingHorizontal: layout.inset,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    actionText: { ...font.option, color: c.ink },
    // A warning is carried by ink, not by a red badge — one signal only.
    note: {
      ...font.meta,
      color: c.ink,
      paddingTop: 10,
      paddingBottom: 24,
      paddingHorizontal: layout.inset,
    },
  });
}
