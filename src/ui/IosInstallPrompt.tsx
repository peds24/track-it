import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, googleSans } from './theme';

const DISMISS_STORAGE_KEY = 'trackit_ios_prompt_dismissed';

export function IosInstallPrompt() {
  const p = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    try {
      const isIos = /iPhone|iPad|iPod/.test(window.navigator.userAgent);
      const isStandalone =
        (window.navigator as any).standalone === true ||
        window.matchMedia?.('(display-mode: standalone)').matches;
      const isDismissed = window.localStorage.getItem(DISMISS_STORAGE_KEY) === 'true';

      if (isIos && !isStandalone && !isDismissed) {
        setVisible(true);
      }
    } catch {
      // Ignore if window / localStorage is not accessible
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    } catch {
      // Ignore storage errors
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: p.surfaceContainerHigh, borderColor: p.outlineVariant }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Ionicons name="phone-portrait-outline" size={20} color={p.primary} style={styles.icon} />
          <Text style={[styles.title, { color: p.onSurface }]}>Install Track It on iOS</Text>
        </View>
        <Pressable onPress={handleDismiss} hitSlop={12} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text style={[styles.dismissText, { color: p.primary }]}>Dismiss</Text>
        </Pressable>
      </View>

      <Text style={[styles.body, { color: p.onSurfaceVariant }]}>
        Tap the <Ionicons name="share-outline" size={14} color={p.primary} /> <Text style={styles.bold}>Share</Text> button in Safari, then select <Text style={styles.bold}>Add to Home Screen</Text> (➕) for full-screen offline access.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 8,
  },
  title: {
    fontFamily: googleSans,
    fontSize: 15,
    fontWeight: '600',
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  bold: {
    fontWeight: '700',
  },
});
