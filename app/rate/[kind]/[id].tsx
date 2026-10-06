import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getRating, listRanking, ratingProfileOf, saveRating, type RankedTrack } from '@/data/ratingRepo';
import { getTrackDetail, type TrackDetail } from '@/data/trackRepo';
import {
  answer,
  formatScore,
  isPlaced,
  matchupReason,
  SENTIMENTS,
  startRanking,
  type Answer,
  type RankingSession,
  type RatingProfile,
  type RatingSummary,
  type Sentiment,
} from '@/domain/rating';
import { CoverImage } from '@/ui/CoverImage';
import { useDatabase } from '@/ui/DatabaseProvider';
import { CATEGORY_PLURAL, SENTIMENT_GROUP, SENTIMENT_LABEL, sentimentColors } from '@/ui/rating';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

type Loaded = {
  detail: TrackDetail;
  profile: RatingProfile;
  ranking: RankedTrack[];
  existing: RatingSummary | null;
};

/**
 * A26: rate a finished track the Beli way — how did you feel, then a run of
 * "which did you prefer?" against your other tracks in the same category,
 * until it has a place. Nothing is saved until it does; backing out at any
 * point leaves any earlier rating exactly as it was.
 */
export default function RateScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const db = useDatabase();
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const trackKind = kind === 'series' ? 'series' : 'entry';

  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [session, setSession] = useState<RankingSession | null>(null);
  const [history, setHistory] = useState<RankingSession[]>([]);
  const [result, setResult] = useState<RatingSummary | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const detail = await getTrackDetail(db, trackKind, id);
        const profile = await ratingProfileOf(db, { kind: trackKind, id });
        if (!detail || !profile) {
          setLoaded(null);
          return;
        }
        const ranking = await listRanking(db, detail.summary.category);
        const existing = await getRating(db, { kind: trackKind, id });
        setLoaded({ detail, profile, ranking, existing });
      } catch {
        setLoaded(null);
      }
    })();
  }, [db, trackKind, id]);

  const finish = useCallback(
    async (placed: RankingSession) => {
      if (!loaded) return;
      setSaving(true);
      try {
        const track = { kind: trackKind, id, category: loaded.detail.summary.category } as const;
        await saveRating(db, track, placed.sentiment, placed.lo, new Date().toISOString());
        setResult(await getRating(db, track));
      } catch (e: unknown) {
        Alert.alert('Could not save rating', e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [db, loaded, trackKind, id],
  );

  function choose(sentiment: Sentiment): void {
    if (!loaded) return;
    const started = startRanking(loaded.profile, sentiment, loaded.ranking);
    setHistory([]);
    if (isPlaced(started)) {
      void finish(started);
    } else {
      setSession(started);
    }
  }

  function respond(choice: Answer): void {
    if (!session) return;
    const next = answer(session, choice);
    setHistory((h) => [...h, session]);
    setSession(next);
    if (isPlaced(next)) void finish(next);
  }

  function undo(): void {
    if (history.length === 0) {
      setSession(null);
      return;
    }
    setSession(history[history.length - 1]!);
    setHistory((h) => h.slice(0, -1));
  }

  if (loaded === undefined) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (loaded === null) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Rate' }} />
        <Text style={styles.muted}>This track couldn’t be found — it may have been deleted.</Text>
      </View>
    );
  }

  const { detail, existing } = loaded;
  const track = detail.summary;
  const plural = CATEGORY_PLURAL[track.category];

  if (result) {
    const colors = sentimentColors(c, result.sentiment);
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Rated' }} />
        <ScrollView contentContainerStyle={styles.resultScroll}>
          <CoverImage uri={detail.metadata.coverUrl} title={track.title} category={track.category} width={120} height={180} />
          <Text style={styles.title}>{track.title}</Text>
          <View style={[styles.bigScore, { backgroundColor: colors.bg }]} accessibilityLabel={`Scored ${formatScore(result.score)} out of 10`}>
            <Text style={[styles.bigScoreText, { color: colors.fg }]}>{formatScore(result.score)}</Text>
          </View>
          <Text style={styles.rankLine}>{`#${result.rank} of ${result.outOf} ${plural}`}</Text>
          <View style={styles.resultActions}>
            <Pressable style={styles.primary} accessibilityRole="button" onPress={() => router.back()}>
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              accessibilityRole="button"
              onPress={() => router.replace(`/rankings?category=${track.category}`)}
            >
              <Text style={styles.secondaryText}>{`See your ${plural}`}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (session && session.opponent !== null) {
    const opponent = session.bucket[session.opponent] as RankedTrack;
    const reason = matchupReason(loaded.profile, opponent);
    const candidateCard = { title: track.title, coverUrl: detail.metadata.coverUrl, creator: detail.metadata.creator, year: detail.metadata.releaseYear };
    const opponentCard = { title: opponent.title, coverUrl: opponent.coverUrl, creator: opponent.creator, year: opponent.releaseYear };
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Which did you prefer?' }} />
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.prompt}>Which did you prefer?</Text>
          {reason && <Text style={styles.reason}>{reason}</Text>}
          <View style={styles.cards}>
            {[
              { card: candidateCard, choice: 'candidate' as const },
              { card: opponentCard, choice: 'opponent' as const },
            ].map(({ card, choice }) => (
              <Pressable
                key={choice}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel={`I preferred ${card.title}`}
                disabled={saving}
                onPress={() => respond(choice)}
              >
                <CoverImage uri={card.coverUrl} title={card.title} category={track.category} width={110} height={165} />
                <Text style={styles.cardTitle} numberOfLines={3}>
                  {card.title}
                </Text>
                {(card.creator || card.year) && (
                  <Text style={styles.cardMeta} numberOfLines={2}>
                    {[card.creator, card.year].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.secondary} accessibilityRole="button" disabled={saving} onPress={() => respond('tie')}>
            <Text style={styles.secondaryText}>Too tough to call</Text>
          </Pressable>
          <Pressable style={styles.link} accessibilityRole="button" disabled={saving} onPress={undo}>
            <Text style={styles.linkText}>{history.length === 0 ? 'Change how I felt' : 'Undo last answer'}</Text>
          </Pressable>
          <Text style={styles.footnote}>{`Question ${session.comparisons + 1} · among the ${plural} ${SENTIMENT_GROUP[session.sentiment]}`}</Text>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Rate' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.coverWrap}>
          <CoverImage uri={detail.metadata.coverUrl} title={track.title} category={track.category} width={120} height={180} />
        </View>
        <Text style={styles.title}>{track.title}</Text>
        <Text style={styles.prompt}>How was it?</Text>
        {existing && (
          <Text style={styles.muted}>
            {`Currently ${formatScore(existing.score)} · #${existing.rank} of ${existing.outOf} ${plural}. Rating it again replaces that.`}
          </Text>
        )}
        <View style={styles.sentiments}>
          {SENTIMENTS.map((sentiment) => {
            const colors = sentimentColors(c, sentiment);
            return (
              <Pressable
                key={sentiment}
                style={({ pressed }) => [styles.sentiment, { backgroundColor: colors.bg }, pressed && styles.cardPressed]}
                accessibilityRole="button"
                disabled={saving}
                onPress={() => choose(sentiment)}
              >
                <Text style={[styles.sentimentText, { color: colors.fg }]}>{SENTIMENT_LABEL[sentiment]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.footnote}>
          {`You’ll compare it with other ${plural} you’ve rated — by the same creator or in the same genre where possible — and its 1–10 score comes from where it lands.`}
        </Text>
      </ScrollView>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: c.surface },
    scroll: { padding: layout.inset, paddingBottom: space.xxl, gap: 14 },
    resultScroll: { padding: layout.inset, paddingTop: space.lg, paddingBottom: space.xxl, gap: 14, alignItems: 'center' },
    coverWrap: { alignItems: 'center', ...elevation.level1 },
    title: { ...font.headlineSmall, color: c.onSurface, fontWeight: '700', textAlign: 'center' },
    prompt: { ...font.titleLarge, color: c.onSurface, fontWeight: '700', textAlign: 'center' },
    reason: { ...font.labelLarge, color: c.primary, textAlign: 'center', marginTop: -6 },
    muted: { ...font.bodyMedium, color: c.onSurfaceVariant, textAlign: 'center' },
    sentiments: { gap: 10, marginTop: 4 },
    sentiment: { height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
    sentimentText: { ...font.titleMedium, fontWeight: '700' },
    cards: { flexDirection: 'row', gap: 12 },
    card: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
      padding: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      backgroundColor: c.surfaceContainerLow,
    },
    cardPressed: { opacity: 0.7 },
    cardTitle: { ...font.titleSmall, color: c.onSurface, fontWeight: '700', textAlign: 'center' },
    cardMeta: { ...font.bodySmall, color: c.onSurfaceVariant, textAlign: 'center' },
    bigScore: { width: 112, height: 112, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    bigScoreText: { ...font.displaySmall, fontWeight: '700', fontVariant: ['tabular-nums'] },
    rankLine: { ...font.titleMedium, color: c.onSurfaceVariant },
    resultActions: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
    primary: { height: 48, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...elevation.level1 },
    primaryText: { ...font.labelLarge, color: c.onPrimary, fontWeight: '700' },
    secondary: {
      height: 44,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { ...font.labelLarge, color: c.primary, fontWeight: '700' },
    link: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
    linkText: { ...font.labelLarge, color: c.onSurfaceVariant, fontWeight: '600', textDecorationLine: 'underline' },
    footnote: { ...font.bodySmall, color: c.onSurfaceVariant, textAlign: 'center' },
  });
}
