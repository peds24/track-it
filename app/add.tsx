import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf } from '@/data/trackRepo';
import { parseSeriesTitle } from '@/domain/seriesTitle';
import type { Category } from '@/domain/types';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { MetronProvider } from '@/providers/metron';
import { generateEntries, unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { SearchResult, SeriesDraft } from '@/providers/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

const BARCODE_TYPES: Partial<Record<Category, BarcodeType[]>> = {
  book: ['ean13', 'ean8'],
  manga: ['ean13', 'ean8'],
  comic: ['upc_a'],
};

const SEARCH_DEBOUNCE_MS = 300;

const CATEGORIES: readonly {
  value: Category;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'show', label: 'Show', iconName: 'tv-outline' },
  { value: 'movie', label: 'Movie', iconName: 'film-outline' },
  { value: 'book', label: 'Book', iconName: 'book-outline' },
  { value: 'comic', label: 'Comic', iconName: 'sparkles-outline' },
  { value: 'manga', label: 'Manga', iconName: 'library-outline' },
];


export default function AddTrackScreen() {
  const db = useDatabase();
  const router = useRouter();
  const navigation = useNavigation();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  const [ongoing, setOngoing] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [confirmedDraft, setConfirmedDraft] = useState<SeriesDraft | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const [editingCount, setEditingCount] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pendingUpc, setPendingUpc] = useState<string | null>(null);
  const [ean5, setEan5] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const scanHandled = useRef(false);
  const allowLeave = useRef(false);

  const isSeries = category !== null && unitLabelFor(category) !== null;
  const showManualFields = isSeries && (!picked || editingCount || hydrateFailed);
  const needsCount = showManualFields && !ongoing;
  const unit = category ? unitLabelFor(category) : null;
  const barcodeTypes = category ? BARCODE_TYPES[category] : undefined;

  useEffect(() => {
    if (!category || picked) {
      setResults([]);
      return;
    }
    const query = title.trim();
    if (query.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const hits = await providerFor(category).search(query);
          if (!cancelled) setResults(hits);
        } catch {
          if (!cancelled) setResults([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [title, category, picked]);

  useEffect(() => {
    if (!category || !picked || !isSeries) {
      setConfirmedDraft(null);
      setHydrating(false);
      setHydrateFailed(false);
      return;
    }
    let cancelled = false;
    setHydrating(true);
    setConfirmedDraft(null);
    setHydrateFailed(false);
    void (async () => {
      try {
        const draft = await providerFor(category).hydrate(picked);
        if (!cancelled) setConfirmedDraft(draft);
      } catch {
        if (!cancelled) setHydrateFailed(true);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, picked, isSeries]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (category === null || allowLeave.current) return;
      e.preventDefault();
      setCategory(null);
      setTitle('');
      setCount('');
      setOngoing(false);
      setPicked(null);
      setResults([]);
      setScanning(false);
      setPendingUpc(null);
      setEan5('');
      setConfirmedDraft(null);
      setHydrating(false);
      setHydrateFailed(false);
      setEditingCount(false);
    });
    return unsubscribe;
  }, [navigation, category]);

  function pick(result: SearchResult): void {
    setTitle(result.title);
    setPicked(result);
    setEditingCount(false);
    setHydrateFailed(false);
    setResults([]);
  }

  async function handleScanPress(): Promise<void> {
    if (!category) return;
    let perm = permission;
    if (!perm || !perm.granted) {
      perm = await requestPermission();
    }
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Camera access is needed to scan a barcode.');
      return;
    }
    scanHandled.current = false;
    setScanning(true);
  }

  function handleBarcodeScanned({ data }: { data: string }): void {
    if (scanHandled.current || !category) return;
    scanHandled.current = true;
    setScanning(false);

    if (category === 'comic') {
      setEan5('');
      setPendingUpc(data);
      return;
    }

    void (async () => {
      try {
        if (category === 'manga') {
          const isbnHits = await new GoogleBooksProvider('manga').search(data);
          const resolvedTitle = isbnHits[0]?.title;
          setResults(resolvedTitle ? await providerFor('manga').search(resolvedTitle) : []);
        } else {
          setResults(await providerFor(category).search(data));
        }
        setPicked(null);
      } catch {
        setResults([]);
      }
    })();
  }

  async function submitEan5(code: string | undefined): Promise<void> {
    const upc = pendingUpc;
    setPendingUpc(null);
    if (!upc) return;
    const provider = providerFor('comic');
    if (!(provider instanceof MetronProvider)) return;
    try {
      setResults(await provider.searchByUpc(upc, code));
      setPicked(null);
    } catch {
      setResults([]);
    }
  }

  async function handleSave(startNow: boolean) {
    if (!category) return;
    if (saving) return;

    const parsedCount = /^\d+$/.test(count.trim()) ? Number.parseInt(count.trim(), 10) : Number.NaN;
    if (needsCount && !Number.isInteger(parsedCount)) {
      Alert.alert('Could not add track', `Enter how many ${unit}s as a whole number`);
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { title: finalTitle, ordinal } =
        category === 'comic' || category === 'manga'
          ? parseSeriesTitle(title)
          : { title: title.trim(), ordinal: null };

      const draft: SeriesDraft | undefined =
        isSeries && confirmedDraft
          ? editingCount
            ? {
                ...generateEntries({
                  id: picked!.id,
                  title: finalTitle,
                  category,
                  count: parsedCount,
                  ongoing,
                }),
                externalSource: confirmedDraft.externalSource,
                externalId: confirmedDraft.externalId,
              }
            : confirmedDraft
          : undefined;

      const created = await addTrack(
        db,
        {
          title: finalTitle,
          category,
          count: parsedCount,
          ongoing: isSeries && ongoing,
          match: picked ?? undefined,
          startAtOrdinal: ordinal ?? undefined,
          draft,
        },
        now,
      );
      if (startNow) {
        const first = await firstEntryOf(db, created);
        if (first.status !== 'in_progress') {
          await advanceEntry(db, first.id, now);
        }
      }
      allowLeave.current = true;
      router.back();
    } catch (error) {
      Alert.alert('Could not add track', error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  if (category === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.prompt}>What are you adding?</Text>
        </View>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.value}
              style={styles.optionCard}
              onPress={() => setCategory(c.value)}
              android_ripple={{ color: palette.surfaceContainerHighest }}
            >
              <View style={styles.optionIconContainer}>
                <Ionicons name={c.iconName} size={22} color={palette.primary} />
              </View>
              <Text style={styles.optionText}>{c.label}</Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={palette.outline}
                style={styles.optionChevron}
              />
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>
          The category decides which catalogue to query and how progress is counted.
        </Text>
      </View>
    );
  }

  if (scanning && barcodeTypes) {
    return (
      <View style={styles.screen}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <Pressable
          style={styles.scanCancel}
          onPress={() => setScanning(false)}
          accessibilityRole="button"
        >
          <Text style={styles.scanCancelText}>Cancel</Text>
        </Pressable>
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
        placeholderTextColor={palette.onSurfaceVariant}
        accessibilityLabel="Title"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setPicked(null);
          setEditingCount(false);
          setHydrateFailed(false);
        }}
        autoFocus
        cursorColor={palette.primary}
        selectionColor={palette.primaryContainer}
        underlineColorAndroid="transparent"
      />

      {results.length > 0 && (
        <View style={styles.results}>
          {results.slice(0, 8).map((r) => (
            <Pressable key={r.id} style={styles.resultRow} onPress={() => pick(r)}>
              <Text style={styles.resultText} numberOfLines={1}>
                {r.title}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {barcodeTypes && (
        <Pressable
          style={styles.scanButton}
          onPress={() => void handleScanPress()}
          accessibilityRole="button"
          android_ripple={{ color: palette.surfaceContainerHighest }}
        >
          <Ionicons
            name="barcode-outline"
            size={18}
            color={palette.onSurface}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.scanButtonText}>Scan barcode</Text>
        </Pressable>
      )}

      {isSeries && picked && hydrating && <Text style={styles.hint}>Checking metadata…</Text>}

      {isSeries && picked && confirmedDraft && !editingCount && (
        <Pressable
          onPress={() => {
            setEditingCount(true);
            setCount(String(confirmedDraft.entries.length));
            setOngoing(confirmedDraft.ongoing === true);
          }}
          style={styles.summary}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${unit} count`}
        >
          <Text style={styles.summaryText}>
            {confirmedDraft.ongoing
              ? 'Ongoing'
              : `${confirmedDraft.entries.length} ${unit}s · Completed`}
          </Text>
        </Pressable>
      )}

      {showManualFields && needsCount && (
        <TextInput
          style={styles.input}
          placeholder={`How many ${unit}s?`}
          placeholderTextColor={palette.onSurfaceVariant}
          accessibilityLabel="Count"
          value={count}
          onChangeText={setCount}
          keyboardType="number-pad"
          cursorColor={palette.primary}
          selectionColor={palette.primaryContainer}
          underlineColorAndroid="transparent"
        />
      )}

      {showManualFields && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ongoing }}
          accessibilityLabel="Ongoing series"
          onPress={() => setOngoing((v) => !v)}
          style={[styles.toggle, ongoing && styles.toggleOn]}
        >
          <Ionicons
            name={ongoing ? 'checkmark-circle' : 'add-circle-outline'}
            size={18}
            color={ongoing ? palette.onSecondaryContainer : palette.onSurfaceVariant}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.toggleText, ongoing && styles.toggleTextOn]}>
            Ongoing series
          </Text>
        </Pressable>
      )}

      <View style={styles.buttonGroup}>
        <Pressable
          style={styles.save}
          onPress={() => handleSave(true)}
          accessibilityRole="button"
          android_ripple={{ color: palette.onPrimary + '33' }}
        >
          <Text style={styles.saveText}>{category === 'movie' ? 'Watched' : 'Start'}</Text>
        </Pressable>
        <Pressable
          style={styles.saveSecondary}
          onPress={() => handleSave(false)}
          accessibilityRole="button"
          android_ripple={{ color: palette.surfaceContainerHighest }}
        >
          <Text style={styles.saveSecondaryText}>Add to backlog</Text>
        </Pressable>
      </View>

      <Modal
        visible={pendingUpc !== null}
        transparent
        animationType="fade"
        onRequestClose={() => void submitEan5(undefined)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>5-digit issue code?</Text>
            <Text style={styles.modalBody}>
              The small 5-digit barcode next to the main one identifies the exact issue. Skip to see
              all matching issues.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="12345"
              placeholderTextColor={palette.onSurfaceVariant}
              accessibilityLabel="5-digit code"
              value={ean5}
              onChangeText={setEan5}
              keyboardType="number-pad"
              maxLength={5}
              cursorColor={palette.primary}
              selectionColor={palette.primaryContainer}
              underlineColorAndroid="transparent"
            />
            <Pressable
              style={styles.save}
              onPress={() => void submitEan5(ean5.trim().length === 5 ? ean5.trim() : undefined)}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>Search</Text>
            </Pressable>
            <Pressable
              onPress={() => void submitEan5(undefined)}
              accessibilityRole="button"
              style={styles.modalSkip}
            >
              <Text style={styles.modalSkipText}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    header: {
      paddingTop: layout.headerTop,
      paddingBottom: layout.headerBottom,
      paddingHorizontal: layout.inset,
    },
    prompt: {
      ...font.headlineMedium,
      color: c.onSurface,
      fontWeight: '700',
    },
    categoryGrid: {
      paddingHorizontal: layout.inset,
      gap: 10,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: c.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.outlineVariant,
    },
    optionIconContainer: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    optionText: {
      ...font.titleMedium,
      color: c.onSurface,
      fontWeight: '600',
      flex: 1,
    },
    optionChevron: {
      marginLeft: 8,
    },
    input: {
      ...font.bodyLarge,
      color: c.onSurface,
      marginHorizontal: layout.inset,
      marginBottom: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      height: 52,
      backgroundColor: c.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: c.outline,
      borderRadius: radius.sm,
    },
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginHorizontal: layout.inset,
      marginBottom: 16,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceContainerLow,
      borderWidth: 1,
      borderColor: c.outlineVariant,
    },
    toggleOn: {
      backgroundColor: c.secondaryContainer,
      borderColor: c.secondaryContainer,
    },
    toggleText: {
      ...font.labelLarge,
      color: c.onSurfaceVariant,
    },
    toggleTextOn: {
      color: c.onSecondaryContainer,
      fontWeight: '600',
    },
    hint: {
      ...font.bodyMedium,
      color: c.primary,
      marginHorizontal: layout.inset,
      marginBottom: 10,
    },
    summary: {
      marginHorizontal: layout.inset,
      marginBottom: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: c.surfaceContainerLow,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      borderRadius: radius.md,
    },
    summaryText: {
      ...font.titleSmall,
      color: c.onSurface,
      fontWeight: '500',
    },
    buttonGroup: {
      marginTop: 8,
      gap: 10,
    },
    save: {
      marginHorizontal: layout.inset,
      height: 48,
      borderRadius: radius.full,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      ...elevation.level1,
    },
    saveText: {
      ...font.labelLarge,
      color: c.onPrimary,
      fontWeight: '700',
    },
    saveSecondary: {
      marginHorizontal: layout.inset,
      height: 48,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.outline,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveSecondaryText: {
      ...font.labelLarge,
      color: c.primary,
      fontWeight: '700',
    },
    note: {
      ...font.bodySmall,
      color: c.onSurfaceVariant,
      paddingTop: 16,
      paddingHorizontal: layout.inset,
    },
    results: {
      marginHorizontal: layout.inset,
      marginBottom: 12,
      backgroundColor: c.surfaceContainerLow,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...elevation.level1,
    },
    resultRow: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.outlineVariant,
    },
    resultText: {
      ...font.bodyMedium,
      color: c.onSurface,
    },
    scanButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginHorizontal: layout.inset,
      marginBottom: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      backgroundColor: c.surfaceContainerHigh,
    },
    scanButtonText: {
      ...font.labelLarge,
      color: c.onSurface,
    },
    scanCancel: {
      position: 'absolute',
      bottom: layout.inset,
      left: layout.inset,
      right: layout.inset,
      height: 48,
      borderRadius: radius.full,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scanCancelText: {
      ...font.labelLarge,
      color: c.onPrimary,
      fontWeight: '700',
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
      marginBottom: 8,
      fontWeight: '600',
    },
    modalBody: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      marginBottom: 16,
      lineHeight: 20,
    },
    modalSkip: {
      alignSelf: 'center',
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    modalSkipText: {
      ...font.labelLarge,
      color: c.primary,
      fontWeight: '600',
    },
  });
}

