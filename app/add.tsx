import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf } from '@/data/trackRepo';
import { cleanDescription, creatorLine } from '@/domain/formatters';
import { parseSeriesTitle, stripBareTrailingNumber } from '@/domain/seriesTitle';
import type { Category } from '@/domain/types';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { MetronProvider } from '@/providers/metron';
import { unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { MatchPreview, SearchResult, SeriesDraft } from '@/providers/types';
import { CoverImage } from '@/ui/CoverImage';
import { useDatabase } from '@/ui/DatabaseProvider';
import { SearchResultRow } from '@/ui/SearchResultRow';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

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
  const [saving, setSaving] = useState(false);

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
  // carried with the pick (`pickedOrdinal`, A24) and appended as a "#N"
  // suffix `parseSeriesTitle` reads back out at save time (A10), the same
  // mechanism a typed "Saga #12" already uses to start partway through a
  // series.
  const [scannedOrdinal, setScannedOrdinal] = useState<number | null>(null);
  // A24: the ordinal a manga scan stripped off (A11), carried with the pick
  // rather than written into the search box — the box keeps what was typed,
  // so backing out of the confirm screen lands exactly where the search was.
  const [pickedOrdinal, setPickedOrdinal] = useState<number | null>(null);
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
  // A17: the confirm screen's data, however it was fetched — `hydrate()`'s
  // own metaLine/blurb for a series match, `preview()`'s for a standalone
  // one. `null` means either there's no picked match, or its lookup hasn't
  // resolved yet (see `hydrating`/`previewing`) or failed outright.
  const matchSummary: MatchPreview | null = isSeries
    ? confirmedDraft
      ? {
          title: confirmedDraft.title,
          metaLine: confirmedDraft.metaLine ?? [],
          blurb: confirmedDraft.blurb ?? null,
          metadata: confirmedDraft.metadata,
        }
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
    if (!category) {
      setResults([]);
      return;
    }
    const query = title.trim();
    if (query.length === 0) return; // A24: keeps scan results; typing clears via onChangeText
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
  }, [title, category, comicMode]);

  useEffect(() => {
    // Not resetting `hydrateFailed` here: the failure path below drops the
    // pick itself, which re-runs this effect — clearing the flag then would
    // erase the note before it ever renders. pick(), typing and unwinding
    // back to the category picker are what clear it.
    if (!category || !picked || !isSeries) {
      setConfirmedDraft(null);
      setHydrating(false);
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
        // The match couldn't be confirmed — continue as a hand-typed title so
        // it is tracked as you go (A25), instead of re-trying a dead match at save.
        if (!cancelled) {
          setTitle(pickedOrdinal !== null ? `${picked.title} #${pickedOrdinal}` : picked.title);
          setPicked(null);
          setPickedOrdinal(null);
          setHydrateFailed(true);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `pickedOrdinal` only ever changes in the same batch as `picked` (pick(),
    // back-from-confirm, this catch, the unwind), so it adds no extra runs.
  }, [category, picked, pickedOrdinal, isSeries, comicMode]);

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
      // A24: the confirm screen is state inside this one route, so the header,
      // hardware and gesture back all arrive here. From confirm, back returns
      // to the search with the typed query and its results intact — this is
      // what replaced "Nope, search again".
      if (picked !== null && !allowLeave.current) {
        e.preventDefault();
        setPicked(null);
        setPickedOrdinal(null);
        setConfirmedDraft(null);
        setHydrating(false);
        setPreviewData(null);
        setPreviewing(false);
        return;
      }
      if (category === null || allowLeave.current) return;
      e.preventDefault();
      if (category === 'comic' && comicMode !== null) {
        setComicMode(null);
      } else {
        setCategory(null);
      }
      setTitle('');
      setPicked(null);
      setResults([]);
      setScanning(false);
      setPendingUpc(null);
      setEan5('');
      setScannedOrdinal(null);
      setPickedOrdinal(null);
      setConfirmedDraft(null);
      setHydrating(false);
      setHydrateFailed(false);
      setPreviewData(null);
      setPreviewing(false);
    });
    return unsubscribe;
  }, [navigation, category, comicMode, picked]);

  function pick(result: SearchResult): void {
    setPicked(result);
    setPickedOrdinal(scannedOrdinal);
    setHydrateFailed(false);
  }

  /** What gets saved: the picked match's own title (plus A10's "#N" when a
   * scan carried one), or whatever was typed when nothing was picked. A10's
   * own "#N" pattern reads the ordinal back out at save time — reusing it
   * means startAtOrdinal needs no separate plumbing through
   * addTrack/createSeriesTrack for the scan case. */
  const saveTitle = picked
    ? pickedOrdinal !== null
      ? `${picked.title} #${pickedOrdinal}`
      : picked.title
    : title;

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
        setHydrateFailed(false); // a stale "Couldn't load that match" note shouldn't sit above new scan results
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
      setHydrateFailed(false);
    } catch {
      setResults([]);
    }
  }

  async function handleSave(startNow: boolean) {
    if (!category) return;
    if (saving) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      // A10: a comic/manga title may embed its own volume/issue number
      // ("Absolute Batman #1", "Berserk Volume 5") — strip it so the series
      // title doesn't carry the number twice, and start tracking at that
      // entry instead of always at 1. Applies to whatever the final title
      // string is, regardless of whether it was typed, picked from a search
      // result, or filled in by a barcode scan — all three converge on
      // `saveTitle` by this point. A16: a comic collection has no series to
      // start partway through — its title (e.g. "Saga, Volume 1") keeps
      // its number, the same as a book's title always has.
      const { title: finalTitle, ordinal } =
        (category === 'comic' && !isCollectionComic) || category === 'manga'
          ? parseSeriesTitle(saveTitle)
          : { title: saveTitle.trim(), ordinal: null };

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
          // A25: no count to type any more. A hand-typed series (or one whose
          // match failed to load) is tracked as ongoing (A4) — it grows a unit
          // at a time as you go, and Complete (A23) finishes it. A confirmed
          // match brings its real count on `draft` and ignores both.
          count: 1,
          ongoing: isSeries,
          match: picked ?? undefined,
          startAtOrdinal: ordinal ?? undefined,
          draft,
          // A16: a comic collection tracks as a standalone item — the
          // registry's `comic` entry stays Metron (the single-issue
          // default), so a Google Books match needs its real source
          // recorded explicitly rather than picking up Metron's id.
          standalone: isCollectionComic || undefined,
          externalSource: isCollectionComic ? googleBooksComic.id : undefined,
          // A22: a standalone match's metadata was already fetched by the
          // confirm screen's preview() — stored now, no second request. A
          // series carries its own on `draft.metadata`.
          metadata: !isSeries ? (previewData?.metadata ?? undefined) : undefined,
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
  // through to the manual title field below instead, same as a
  // hand-typed title with no match at all.
  if (picked && (matchSummary || checkingMatch)) {
    const credit = matchSummary ? creatorLine(category, matchSummary.metadata?.creator ?? picked.creator ?? null) : null;
    const blurb = cleanDescription(matchSummary?.blurb);
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.confirmScroll}>
        <View style={styles.confirmCover}>
          <CoverImage
            uri={matchSummary?.metadata?.coverUrl ?? picked.thumbnailUrl}
            title={picked.title}
            category={category}
            width={120}
            height={180}
          />
        </View>
        <View style={styles.header}>
          <Text style={styles.confirmTitle}>{matchSummary ? matchSummary.title : 'Checking…'}</Text>
          {credit && <Text style={styles.confirmCredit}>{credit}</Text>}
        </View>
        {matchSummary && matchSummary.metaLine.length > 0 && (
          <Text style={styles.metaLine}>{matchSummary.metaLine.join(' · ')}</Text>
        )}
        {blurb && (
          <Text style={styles.blurb} numberOfLines={6}>
            {blurb}
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
          </View>
        )}
      </ScrollView>
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
          if (t.trim().length === 0) setResults([]);
          setPicked(null);
          setScannedOrdinal(null);
          setHydrateFailed(false);
        }}
        autoFocus
        cursorColor={palette.primary}
        selectionColor={palette.primaryContainer}
        underlineColorAndroid="transparent"
      />
      {hydrateFailed && <Text style={styles.note}>Couldn’t load that match — it’ll be tracked as you go.</Text>}

      {results.length > 0 && (
        <ScrollView style={styles.results} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {results.slice(0, 20).map((r) => (
            <SearchResultRow key={r.id} result={r} onPress={pick} />
          ))}
        </ScrollView>
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
    confirmScroll: { paddingBottom: space.xl },
    confirmCover: { alignItems: 'center', paddingTop: space.lg },
    confirmCredit: { ...font.titleMedium, color: c.onSurfaceVariant, marginTop: 4 },
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
      maxHeight: 360,
      flexGrow: 0,
      ...elevation.level1,
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
