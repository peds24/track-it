import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf } from '@/data/trackRepo';
import { parseSeriesTitle, stripBareTrailingNumber } from '@/domain/seriesTitle';
import type { Category } from '@/domain/types';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { MetronProvider } from '@/providers/metron';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { MatchPreview, SearchResult, SeriesDraft } from '@/providers/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { elevation, font, layout, radius, space, underline, useTheme, type Palette } from '@/ui/theme';

/** book/manga are ISBN barcodes (EAN-13). A single-issue comic is UPC-A
 * (A9); a comic collection (A14) is ISBN-barcoded like a book — Metron
 * only catalogues single issues, so collections are Google Books' job.
 * Show/movie have no retail barcode at all — TMDB is search-by-title
 * only (D5/A9). */
const ISBN_BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8'];
const BARCODE_TYPES: Partial<Record<Category, BarcodeType[]>> = {
  book: ISBN_BARCODE_TYPES,
  manga: ISBN_BARCODE_TYPES,
};
const COMIC_SINGLE_ISSUE_BARCODE: BarcodeType[] = ['upc_a'];

/**
 * A14: comic collections (TPB, hardcover, omnibus) are matched by title
 * like a book, not by single-issue UPC — Metron doesn't catalogue them at
 * all. Never registered globally (the registry's `comic` entry stays
 * Metron, for the single-issue default, A9) — instantiated directly here
 * for the one path that needs it.
 */
const googleBooksComic = new GoogleBooksProvider('comic');

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

type ComicMode = 'single' | 'collection';

/** The registry (D10) is a strict one-provider-per-category map, which
 * can't express "comic, but the collection sub-path" — this resolves the
 * one exception directly rather than growing the registry's interface for
 * a single category's internal split. */
function providerForAdd(category: Category, comicMode: ComicMode | null) {
  return category === 'comic' && comicMode === 'collection' ? googleBooksComic : providerFor(category);
}

/** A11's confirm screen: what the primary button says once a real match is
 * matched, per medium (D2's own "Watched"-not-"Start" case for a movie
 * carries over unchanged; A17 gives reading media a name of their own
 * rather than the generic "Start"). */
function primaryLabel(category: Category): string {
  if (category === 'movie') return 'Watched';
  if (category === 'show') return 'Start watching';
  return 'Start reading';
}

export default function AddTrackScreen() {
  const db = useDatabase();
  const router = useRouter();
  const navigation = useNavigation();
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [category, setCategory] = useState<Category | null>(null);
  // A14: comic's own extra step — which catalogue answers depends on
  // whether this is a single issue (Metron, A9) or a collection (Google
  // Books, since Metron doesn't catalogue TPBs/hardcovers/omnibuses).
  // Irrelevant, and left null, for every other category.
  const [comicMode, setComicMode] = useState<ComicMode | null>(null);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  const [ongoing, setOngoing] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  // A11: a real series match is confirmed before it's saved, not silently
  // applied. `confirmedDraft` is the fetched summary the confirm screen
  // (A17) reads its title/metaLine/blurb off of.
  const [confirmedDraft, setConfirmedDraft] = useState<SeriesDraft | null>(null);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  // A17: the confirm screen's data for a standalone match (book, movie, a
  // comic collection) — the same role `confirmedDraft` plays for a series,
  // just from `preview()` instead of `hydrate()` since there's no series
  // draft to carry it. Never fails to resolve (every standalone provider's
  // `preview` falls back rather than throwing), so there is no
  // `previewFailed` counterpart to `hydrateFailed`.
  const [previewData, setPreviewData] = useState<MatchPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pendingUpc, setPendingUpc] = useState<string | null>(null);
  const [ean5, setEan5] = useState('');
  // A11: a manga barcode resolves through Google Books first, whose title
  // carries the scanned volume's number bare ("Attack on Titan 30") — held
  // here between the scan resolving and the user picking a result, then
  // folded into `title` as a "#N" suffix `pick()` already knows how to
  // hand off to `parseSeriesTitle` at save time (A10), the same mechanism
  // a typed "Saga #12" already uses to start partway through a series.
  const [scannedOrdinal, setScannedOrdinal] = useState<number | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanHandled = useRef(false);
  const allowLeave = useRef(false);

  // A16: a comic collection is excluded here even though `comic`'s own
  // category has a series unit label — it tracks as one standalone item,
  // like a book, so it takes the exact same no-count, no-confirm-step path
  // book/movie already do. This is what let A14's `autoConfirms` workaround
  // (Google Books can never return a real count to confirm) go away
  // entirely: there is no confirm step to skip once this is false.
  const isCollectionComic = category === 'comic' && comicMode === 'collection';
  const isSeries = category !== null && unitLabelFor(category) !== null && !isCollectionComic;
  // A11: manual fields render only when there's no confirmed match to trust
  // instead — a hand-typed title, or a match whose hydrate() failed.
  const showManualFields = isSeries && (!picked || hydrateFailed);
  const needsCount = showManualFields && !ongoing;
  const unit = category ? unitLabelFor(category) : null;
  // A17: the confirm screen's data, however it was fetched — `hydrate()`'s
  // own metaLine/blurb for a series match, `preview()`'s for a standalone
  // one. `null` means either there's no picked match, or its lookup hasn't
  // resolved yet (see `hydrating`/`previewing`) or failed outright.
  const matchSummary: MatchPreview | null = isSeries
    ? confirmedDraft
      ? { title: confirmedDraft.title, metaLine: confirmedDraft.metaLine ?? [], blurb: confirmedDraft.blurb ?? null }
      : null
    : previewData;
  const checkingMatch = picked !== null && matchSummary === null && (isSeries ? hydrating : previewing);
  const barcodeTypes =
    category === 'comic'
      ? comicMode === 'single'
        ? COMIC_SINGLE_ISSUE_BARCODE
        : comicMode === 'collection'
          ? ISBN_BARCODE_TYPES
          : undefined
      : category
        ? BARCODE_TYPES[category]
        : undefined;

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
          const hits = await providerForAdd(category, comicMode).search(query);
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
  }, [title, category, picked, comicMode]);

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
        const draft = await providerForAdd(category, comicMode).hydrate(picked);
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
  }, [category, picked, isSeries, comicMode]);

  // A17: the confirm screen's data source for a standalone match (book,
  // movie, a comic collection) — `preview()`'s counterpart to the hydrate
  // effect above. Every standalone provider's `preview` falls back rather
  // than throwing, so this needs no failure state of its own.
  useEffect(() => {
    if (!category || !picked || isSeries) {
      setPreviewData(null);
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setPreviewData(null);
    void (async () => {
      const provider = providerForAdd(category, comicMode);
      const preview = (await provider.preview?.(picked)) ?? {
        title: picked.title,
        metaLine: [],
        blurb: null,
      };
      if (!cancelled) {
        setPreviewData(preview);
        setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, picked, isSeries, comicMode]);

  // Picking a category never navigates — it just re-renders this component
  // past the `category === null` branch — so leaving the modal for real and
  // backing out of an in-progress category pick both arrive as the same
  // navigation action (header back, hardware back, swipe-back gesture). This
  // is the one place that distinguishes them: while a category is chosen,
  // back resets to the category picker instead of leaving, clearing every bit
  // of state the abandoned attempt left behind so picking a different
  // category next starts clean. A14: comic's own extra step unwinds one
  // level at a time the same way — back from the search screen returns to
  // "Single issue or Collection?" first, not straight past it.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (category === null || allowLeave.current) return;
      e.preventDefault();
      if (category === 'comic' && comicMode !== null) {
        setComicMode(null);
      } else {
        setCategory(null);
      }
      setTitle('');
      setCount('');
      setOngoing(false);
      setPicked(null);
      setResults([]);
      setScanning(false);
      setPendingUpc(null);
      setEan5('');
      setScannedOrdinal(null);
      setConfirmedDraft(null);
      setHydrating(false);
      setHydrateFailed(false);
      setPreviewData(null);
      setPreviewing(false);
    });
    return unsubscribe;
  }, [navigation, category, comicMode]);

  function pick(result: SearchResult): void {
    // A10's own "#N" pattern reads this back out at save time — reusing it
    // here means startAtOrdinal needs no separate plumbing through
    // addTrack/createSeriesTrack for the scan case.
    setTitle(scannedOrdinal !== null ? `${result.title} #${scannedOrdinal}` : result.title);
    setPicked(result);
    setScannedOrdinal(null);
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

    // A UPC-A alone identifies a single-issue comic's series, not its issue
    // (A9) — the 5-digit supplemental prompt decides the query, so defer
    // the lookup. A comic collection (A14) never reaches this: it scans an
    // ISBN, not a UPC-A, and Google Books resolves that in one hop, same
    // as a book.
    if (category === 'comic' && comicMode === 'single') {
      setEan5('');
      setPendingUpc(data);
      return;
    }

    void (async () => {
      try {
        if (category === 'manga') {
          // AniList (which A11 swapped in for manga) has no ISBN index at
          // all — only Google Books' title/ISBN search can still resolve a
          // scanned barcode. Two hops: ISBN -> title (Google Books), then
          // title -> real matches (AniList) — but Google Books' own title
          // for a manga volume carries the number bare ("Attack on Titan
          // 30"), which AniList's title search will not match at all, so
          // it has to come off before the second hop. The stripped number
          // is remembered (`scannedOrdinal`) so `pick()` can hand it back
          // to A10's ordinal parsing once the user confirms which result
          // is the right series.
          const isbnHits = await new GoogleBooksProvider('manga').search(data);
          const rawTitle = isbnHits[0]?.title;
          if (rawTitle) {
            const { title: cleanTitle, ordinal } = stripBareTrailingNumber(rawTitle);
            setScannedOrdinal(ordinal);
            setResults(await providerFor('manga').search(cleanTitle));
          } else {
            setScannedOrdinal(null);
            setResults([]);
          }
        } else {
          setResults(await providerForAdd(category, comicMode).search(data));
        }
        setPicked(null);
      } catch {
        setScannedOrdinal(null);
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
      // A10: a comic/manga title may embed its own volume/issue number
      // ("Absolute Batman #1", "Berserk Volume 5") — strip it so the series
      // title doesn't carry the number twice, and start tracking at that
      // entry instead of always at 1. Applies to whatever the final title
      // string is, regardless of whether it was typed, picked from a search
      // result, or filled in by a barcode scan — all three converge on
      // `title` by this point. A16: a comic collection has no series to
      // start partway through — its title (e.g. "Saga, Volume 1") keeps
      // its number, the same as a book's title always has.
      const { title: finalTitle, ordinal } =
        (category === 'comic' && !isCollectionComic) || category === 'manga'
          ? parseSeriesTitle(title)
          : { title: title.trim(), ordinal: null };

      // A11: a confirmed match is passed straight through as a ready draft —
      // no second hydrate, no manual count to validate. Only reached once
      // the confirm screen's own primary/secondary button was tapped (A17),
      // so there is no override case left to rebuild locally here.
      const draft: SeriesDraft | undefined = isSeries && confirmedDraft ? confirmedDraft : undefined;

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
          // A16: a comic collection tracks as a standalone item — the
          // registry's `comic` entry stays Metron (the single-issue
          // default), so a Google Books match needs its real source
          // recorded explicitly rather than picking up Metron's id.
          standalone: isCollectionComic || undefined,
          externalSource: isCollectionComic ? googleBooksComic.id : undefined,
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

  // A14: comic's own extra step — which catalogue answers later depends on
  // whether this is a single issue (Metron, precise down to the printing)
  // or a collection (Google Books, which Metron doesn't catalogue at all).
  if (category === 'comic' && comicMode === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.prompt}>Comic</Text>
        </View>
        <View style={styles.categoryGrid}>
          <Pressable
            style={styles.plainOptionCard}
            onPress={() => setComicMode('single')}
            android_ripple={{ color: palette.surfaceContainerHighest }}
          >
            <Text style={styles.optionText}>Single issue</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette.outline}
              style={styles.optionChevron}
            />
          </Pressable>
          <Pressable
            style={styles.plainOptionCard}
            onPress={() => setComicMode('collection')}
            android_ripple={{ color: palette.surfaceContainerHighest }}
          >
            <Text style={styles.optionText}>Collection</Text>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={palette.outline}
              style={styles.optionChevron}
            />
          </Pressable>
        </View>
        <Text style={styles.note}>
          A single issue is tracked issue by issue, matched exactly by barcode or issue number. A
          collection — a trade paperback, hardcover, or omnibus — tracks as one item, the same way
          a book does.
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

  // A17: a real match — series or standalone — is confirmed here before
  // it's saved, rather than applied straight off the search result. A
  // failed match (hydrateFailed) never reaches this screen; it falls
  // through to the manual title/count fields below instead, same as a
  // hand-typed title with no match at all.
  if (picked && (matchSummary || checkingMatch)) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.confirmTitle}>{matchSummary ? matchSummary.title : 'Checking…'}</Text>
        </View>
        {matchSummary && matchSummary.metaLine.length > 0 && (
          <Text style={styles.metaLine}>{matchSummary.metaLine.join(' · ')}</Text>
        )}
        {matchSummary?.blurb && (
          <Text style={styles.blurb} numberOfLines={4}>
            {matchSummary.blurb}
          </Text>
        )}
        {matchSummary && (
          <View style={styles.buttonGroup}>
            <Pressable
              style={styles.save}
              onPress={() => void handleSave(true)}
              accessibilityRole="button"
              android_ripple={{ color: palette.onPrimary + '33' }}
            >
              <Text style={styles.saveText}>{primaryLabel(category)}</Text>
            </Pressable>
            <Pressable
              style={styles.saveSecondary}
              onPress={() => void handleSave(false)}
              accessibilityRole="button"
              android_ripple={{ color: palette.surfaceContainerHighest }}
            >
              <Text style={styles.saveSecondaryText}>Add to backlog</Text>
            </Pressable>
            <Pressable
              onPress={() => setPicked(null)}
              accessibilityRole="button"
              style={styles.reject}
            >
              <Text style={[styles.rejectText, underline]}>Nope, search again</Text>
            </Pressable>
          </View>
        )}
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
          setScannedOrdinal(null);
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
    // Same shape as optionCard for the comic single/collection step, minus
    // the leading icon box — neither option has a natural icon of its own.
    plainOptionCard: {
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
    // A17: the confirm screen's own title — smaller than `prompt`'s category
    // label (headlineMedium is sized for a short static word, not a real,
    // sometimes-long title) but still the biggest thing on the screen.
    confirmTitle: {
      ...font.headlineSmall,
      color: c.onSurface,
      fontWeight: '700',
    },
    metaLine: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      marginHorizontal: layout.inset,
      marginBottom: 14,
    },
    blurb: {
      ...font.bodyLarge,
      color: c.onSurface,
      marginHorizontal: layout.inset,
      marginBottom: 24,
      lineHeight: 22,
    },
    reject: { alignSelf: 'center', paddingVertical: 6 },
    rejectText: {
      ...font.labelLarge,
      color: c.onSurfaceVariant,
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
