import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, firstEntryOf } from '@/data/trackRepo';
import { parseSeriesTitle, stripBareTrailingNumber } from '@/domain/seriesTitle';
import type { Category } from '@/domain/types';
import { GoogleBooksProvider } from '@/providers/googleBooks';
import { MetronProvider } from '@/providers/metron';
import { generateEntries, unitLabelFor } from '@/providers/manual';
import { providerFor } from '@/providers/registry';
import type { SearchResult, SeriesDraft } from '@/providers/types';
import { useDatabase } from '@/ui/DatabaseProvider';
import { font, layout, radius, underline, useTheme, type Palette } from '@/ui/theme';

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

/** Debounce for search-as-you-type — long enough that a typing burst issues
 * one request, short enough that a result still feels immediate. */
const SEARCH_DEBOUNCE_MS = 300;

const CATEGORIES: readonly { value: Category; label: string }[] = [
  { value: 'show', label: 'Show' },
  { value: 'movie', label: 'Movie' },
  { value: 'book', label: 'Book' },
  { value: 'comic', label: 'Comic' },
  { value: 'manga', label: 'Manga' },
];

type ComicMode = 'single' | 'collection';

/** The registry (D10) is a strict one-provider-per-category map, which
 * can't express "comic, but the collection sub-path" — this resolves the
 * one exception directly rather than growing the registry's interface for
 * a single category's internal split. */
function providerForAdd(category: Category, comicMode: ComicMode | null) {
  return category === 'comic' && comicMode === 'collection' ? googleBooksComic : providerFor(category);
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
  // Empty, not '1' — a pre-filled value hides the "How many volumes?" prompt
  // and has to be cleared before it can be typed over.
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  // A4: still being published, so there is no count to ask for.
  const [ongoing, setOngoing] = useState(false);

  // A9: search-as-you-type and barcode scanning both just fill in the title
  // field — a faster way to reach the same manual entry-generation flow, not
  // a different feature. `picked` remembers which result that was, so submit
  // time can hydrate from real matched data instead of the typed string; it
  // is cleared the moment the user types past what they picked.
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  // A11: a real series match is confirmed before it's saved, not silently
  // applied. `confirmedDraft` is the fetched summary shown in place of the
  // manual count/ongoing fields; `editingCount` reopens those same fields
  // as an override for the rare wrong-edition match.
  const [confirmedDraft, setConfirmedDraft] = useState<SeriesDraft | null>(null);
  const [hydrating, setHydrating] = useState(false);
  // A rejected hydrate() (AniList/Metron do not catch a network failure
  // internally, unlike TMDB's graceful degrade) must still land somewhere
  // visible — this folds into showManualFields below so it degrades to
  // exactly the same UI as a hand-typed title with no match, rather than
  // stranding the screen with no field and no error.
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const [editingCount, setEditingCount] = useState(false);
  const [scanning, setScanning] = useState(false);
  // A comic scan resolves to a UPC-A only — expo-camera cannot read the
  // 5-digit EAN-5 supplemental that actually pins the issue number, so this
  // holds the scanned code while a small, skippable prompt asks for it.
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
  // router.back() after a successful save is itself a `beforeRemove` trigger —
  // without this, the guard below would catch its own exit and reset the form
  // back to the category picker instead of actually leaving. Set right before
  // that call; a ref rather than state so the very next event sees it, with no
  // render/effect round trip to race against.
  const allowLeave = useRef(false);

  const isSeries = category !== null && unitLabelFor(category) !== null;
  // A14: Google Books can never return a real per-result count (D5/A9) —
  // for a comic collection specifically, the A11 confirm step has nothing
  // trustworthy to confirm. Every other category/mode combination keeps
  // A11's behaviour unchanged.
  const autoConfirms = !(category === 'comic' && comicMode === 'collection');
  // A11: manual fields render only when there's no confirmed match to trust
  // instead — a hand-typed title, an explicit override of a wrong one, or
  // (A14) a category/mode this confirm step can't support at all.
  const showManualFields = isSeries && (!picked || editingCount || hydrateFailed || !autoConfirms);
  const needsCount = showManualFields && !ongoing;
  const unit = category ? unitLabelFor(category) : null;
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

  // A search hit only ever confirms a title (D5) — once one is picked there
  // is nothing left to search for until the user types past it again.
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
          // Search is progressive enhancement, never a blocking requirement
          // (D5) — offline, misconfigured, or a failed request all just mean
          // no suggestions, and typing a title still works exactly as today.
          if (!cancelled) setResults([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [title, category, picked, comicMode]);

  // A11: the confirm step's data source — runs once per pick, not once per
  // keystroke like search does. Cancelled the same way search cancels a
  // stale request if the user picks something else, or types past the pick,
  // before this resolves.
  useEffect(() => {
    if (!category || !picked || !isSeries || !autoConfirms) {
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
        // Search — and the confirm step it feeds — is progressive
        // enhancement, never a blocking requirement: a failed lookup just
        // means no confirmed match, and the manual title/count fields still
        // work exactly as they do for a hand-typed title.
        if (!cancelled) setHydrateFailed(true);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, picked, isSeries, autoConfirms, comicMode]);

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
      setEditingCount(false);
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
      // A10: a comic/manga title may embed its own volume/issue number
      // ("Absolute Batman #1", "Berserk Volume 5") — strip it so the series
      // title doesn't carry the number twice, and start tracking at that
      // entry instead of always at 1. Applies to whatever the final title
      // string is, regardless of whether it was typed, picked from a search
      // result, or filled in by a barcode scan — all three converge on
      // `title` by this point.
      const { title: finalTitle, ordinal } =
        category === 'comic' || category === 'manga'
          ? parseSeriesTitle(title)
          : { title: title.trim(), ordinal: null };

      // A11: an un-edited confirmed match is passed straight through as a
      // ready draft — no second hydrate, no manual count to validate. An
      // edited override rebuilds the draft locally the same way a
      // hand-typed title always has, keeping the confirmed match's own
      // external id/source rather than discarding where it came from.
      const draft: SeriesDraft | undefined = isSeries
        ? confirmedDraft
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
          : // A14: a comic collection's confirm step never runs (Google
            // Books can't give a real count to confirm, so autoConfirms is
            // false and confirmedDraft stays null) — hydrate it here
            // instead, at save time, so addTrack's own registry-based
            // fallback — which would resolve `comic` to Metron, the wrong
            // provider for a Google Books pick — never runs against it.
            !autoConfirms && picked
            ? await googleBooksComic.hydrate({
                ...picked,
                title: finalTitle,
                count: parsedCount,
                ongoing: isSeries && ongoing,
              })
            : undefined
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
        // A10 may have already started the parsed entry at creation — Start's
        // job is then already done, and advancing further would finish it
        // instead of merely starting it.
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

  // A14: comic's own extra step — which catalogue answers later depends on
  // whether this is a single issue (Metron, precise down to the printing)
  // or a collection (Google Books, which Metron doesn't catalogue at all).
  if (category === 'comic' && comicMode === null) {
    return (
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.prompt}>Comic</Text>
        </View>
        <Pressable style={styles.option} onPress={() => setComicMode('single')}>
          <Text style={styles.optionText}>Single issue</Text>
        </Pressable>
        <Pressable style={styles.option} onPress={() => setComicMode('collection')}>
          <Text style={styles.optionText}>Collection</Text>
        </Pressable>
        <Text style={styles.note}>
          A single issue is matched exactly by barcode or issue number. A collection — a trade
          paperback, hardcover, or omnibus — is matched by title, the same way a book is.
        </Text>
      </View>
    );
  }

  // Full-screen while scanning — an inline conditional view rather than a
  // separate route, so no state has to round-trip through router params.
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
        placeholderTextColor={palette.faint}
        accessibilityLabel="Title"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          setPicked(null);
          setScannedOrdinal(null);
          setEditingCount(false);
          setHydrateFailed(false);
        }}
        autoFocus
        cursorColor={palette.ink}
        selectionColor={palette.ink}
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
        >
          <Text style={styles.scanButtonText}>Scan barcode</Text>
        </Pressable>
      )}

      {isSeries && picked && hydrating && <Text style={styles.hint}>Checking…</Text>}

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
      {showManualFields && (
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
        {/* A10: a movie still completes in one tap (D2) — "Start" implies a
            middle state it never has, so the primary button says what it
            actually does for a movie specifically. */}
        <Text style={styles.saveText}>{category === 'movie' ? 'Watched' : 'Start'}</Text>
      </Pressable>
      <Pressable
        style={styles.saveSecondary}
        onPress={() => handleSave(false)}
        accessibilityRole="button"
      >
        <Text style={styles.saveSecondaryText}>Add to backlog</Text>
      </Pressable>

      {/* A9: expo-camera cannot read the EAN-5 supplemental that pins a
          comic's issue number — this is the one extra step a comic scan
          needs, kept skippable so it never blocks adding the track. */}
      <Modal
        visible={pendingUpc !== null}
        transparent
        animationType="fade"
        onRequestClose={() => void submitEan5(undefined)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>5-digit code?</Text>
            <Text style={styles.modalBody}>
              The small 5-digit barcode next to the main one pins the exact issue. Skip to see
              every matching issue instead.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="12345"
              placeholderTextColor={palette.faint}
              accessibilityLabel="5-digit code"
              value={ean5}
              onChangeText={setEan5}
              keyboardType="number-pad"
              maxLength={5}
              cursorColor={palette.ink}
              selectionColor={palette.ink}
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
              <Text style={[styles.modalSkipText, underline]}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    hint: { ...font.meta, color: c.muted, marginHorizontal: layout.inset, marginBottom: 10 },
    summary: {
      marginHorizontal: layout.inset,
      marginBottom: 10,
      paddingVertical: 13,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
    },
    summaryText: { ...font.body, color: c.ink },
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
    // Reuses the row/list visual language rather than a new component system:
    // sharp corners, a hairline between rows, ink for the title.
    results: {
      marginHorizontal: layout.inset,
      marginBottom: 10,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    resultRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.rule,
    },
    resultText: { ...font.body, color: c.ink },
    scanButton: {
      alignSelf: 'flex-start',
      marginHorizontal: layout.inset,
      marginBottom: 10,
      paddingVertical: 6,
      paddingHorizontal: 13,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.chip,
    },
    scanButtonText: { ...font.control, color: c.ink },
    scanCancel: {
      position: 'absolute',
      bottom: layout.inset,
      left: layout.inset,
      right: layout.inset,
      padding: 14,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.bg,
      backgroundColor: c.ink,
    },
    scanCancelText: { ...font.body, fontWeight: '700', color: c.bg, textAlign: 'center' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: layout.inset,
    },
    modalCard: {
      width: '100%',
      backgroundColor: c.bg,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
      padding: layout.inset,
    },
    modalTitle: { ...font.rowTitle, color: c.ink, marginBottom: 8 },
    modalBody: { ...font.meta, color: c.muted, marginBottom: 14 },
    modalSkip: { alignSelf: 'center', paddingVertical: 6 },
    modalSkipText: { ...font.control, color: c.muted },
  });
}
