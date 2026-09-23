import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  advanceEntry,
  completeTrack,
  deleteTrack,
  getTrackDetail,
  resumeTrack,
  returnTrackToBacklog,
  setTrackPosition,
  type TrackDetail,
  type TrackSummary,
} from '@/data/trackRepo';
import { activityLine, cleanDescription, creatorLine, formatDate, formatRelative } from '@/domain/formatters';
import { completionMessage } from '@/ui/completionMessage';
import { CoverImage } from '@/ui/CoverImage';
import { useDatabase } from '@/ui/DatabaseProvider';
import { ProgressEditor } from '@/ui/ProgressEditor';
import { canEditPosition, KIND_LABEL, positionLabel, seasonPositionLabel } from '@/ui/TrackRow';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

const READ = new Set(['book', 'comic', 'manga']);
const LONG_DESCRIPTION = 280;

/**
 * A22: one track, in full — modelled on Longbox's comic detail screen: cover,
 * who made it, where you are, how long it has taken, what it's about, and
 * every action a row offers. Everything shown is either stored display
 * metadata (A22) or derived at read time (D3).
 */
export default function TrackDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const db = useDatabase();
  const router = useRouter();
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<TrackSummary | null>(null);
  const trackKind = kind === 'series' ? 'series' : 'entry';

  const load = useCallback(async () => {
    try {
      setDetail(await getTrackDetail(db, trackKind, id));
    } catch {
      // A failed read shows the same "couldn't be found" state rather than
      // surfacing as an unhandled rejection from the focus effect.
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [db, trackKind, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const run = useCallback(
    (label: string, action: () => Promise<void>) => {
      void (async () => {
        try {
          await action();
        } catch (e: unknown) {
          Alert.alert(label, e instanceof Error ? e.message : String(e));
        }
        await load();
      })();
    },
    [load],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.muted}>This track couldn’t be found — it may have been deleted.</Text>
      </View>
    );
  }

  const { summary: track, metadata, timeline, unitLabel } = detail;
  const now = new Date().toISOString();
  const description = cleanDescription(metadata.description);
  const credit = creatorLine(track.category, metadata.creator);
  const meta = [KIND_LABEL[track.category], metadata.releaseYear, track.ongoing ? 'Ongoing' : null]
    .filter((s): s is string => !!s)
    .join(' · ');
  const position = seasonPositionLabel(track) ?? positionLabel(track);
  const fraction = track.progress && track.progress.total > 0 ? track.progress.done / track.progress.total : null;
  const activity = activityLine(track.category, timeline, now);

  const resuming = track.shelf === 'backlog' && track.paused;
  const starting = track.shelf === 'backlog' && !track.paused;
  const primaryLabel = resuming
    ? 'Resume'
    : starting
      ? track.category === 'movie'
        ? 'Watched'
        : 'Start'
      : `Mark ${track.nextEntryTitle} ${READ.has(track.category) ? 'read' : 'watched'}`;

  function confirmComplete() {
    Alert.alert(`Mark ${track.title} complete?`, completionMessage(track), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => run('Could not complete', () => completeTrack(db, track, new Date().toISOString())) },
    ]);
  }

  function confirmBacklog() {
    if (track.shelf === 'currently') {
      run('Could not pause', () => returnTrackToBacklog(db, track));
      return;
    }
    Alert.alert(`Move ${track.title} to the backlog?`, 'Its progress will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Move', style: 'destructive', onPress: () => run('Could not move', () => returnTrackToBacklog(db, track)) },
    ]);
  }

  function confirmDelete() {
    const body =
      track.kind === 'series'
        ? 'This removes the track and every episode, issue or volume under it. It cannot be undone.'
        : 'This removes the track. It cannot be undone.';
    Alert.alert(`Delete ${track.title}?`, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              await deleteTrack(db, track);
              router.back();
            } catch (e: unknown) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : String(e));
            }
          })(),
      },
    ]);
  }

  const stats: [string, string][] = [['Added', `${formatDate(timeline.addedAt)} · ${formatRelative(timeline.addedAt, now)}`]];
  if (timeline.startedAt) stats.push(['Started', `${formatDate(timeline.startedAt)} · ${formatRelative(timeline.startedAt, now)}`]);
  if (timeline.finishedAt) stats.push(['Finished', formatDate(timeline.finishedAt)]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: track.title }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.coverWrap}>
          <CoverImage uri={metadata.coverUrl} title={track.title} category={track.category} width={160} height={240} />
        </View>

        <Text style={styles.title}>{track.title}</Text>
        {credit && <Text style={styles.credit}>{credit}</Text>}
        <Text style={styles.meta}>{meta}</Text>

        <View style={styles.card}>
          <Text style={styles.position}>{position}</Text>
          {track.progress && unitLabel && (
            <Text style={styles.muted}>{`${track.progress.done} of ${track.progress.total} ${unitLabel}${track.progress.total === 1 ? '' : 's'}`}</Text>
          )}
          {fraction !== null && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(1, fraction) * 100}%` }]} />
            </View>
          )}
        </View>

        <View style={styles.card}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.statRow}>
              <Text style={styles.statLabel}>{label}</Text>
              <Text style={styles.statValue}>{value}</Text>
            </View>
          ))}
          {activity && <Text style={styles.activity}>{activity}</Text>}
        </View>

        {description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.description} numberOfLines={expanded ? undefined : 6}>
              {description}
            </Text>
            {description.length > LONG_DESCRIPTION && (
              <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" style={styles.moreButton}>
                <Text style={styles.moreText}>{expanded ? 'Show less' : 'Show more'}</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.actions}>
          {track.nextEntryId && (
            <Pressable
              style={styles.primary}
              accessibilityRole="button"
              onPress={() =>
                resuming
                  ? run('Could not resume', () => resumeTrack(db, track))
                  : run('Could not update', () => advanceEntry(db, track.nextEntryId!, new Date().toISOString()))
              }
            >
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          )}
          <View style={styles.secondaryRow}>
            {canEditPosition(track) && (
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={() => setEditing(track)}>
                <Text style={styles.secondaryText}>Edit position</Text>
              </Pressable>
            )}
            {track.shelf !== 'done' && (
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={confirmComplete}>
                <Text style={styles.secondaryText}>Complete</Text>
              </Pressable>
            )}
            {track.shelf !== 'backlog' && (
              <Pressable style={styles.secondary} accessibilityRole="button" onPress={confirmBacklog}>
                <Text style={styles.secondaryText}>{track.shelf === 'done' ? 'Move to backlog' : 'Pause'}</Text>
              </Pressable>
            )}
          </View>
          <Pressable style={styles.delete} accessibilityRole="button" onPress={confirmDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ProgressEditor
        track={editing}
        onCancel={() => setEditing(null)}
        onSubmit={(t, ordinal) => {
          setEditing(null);
          run('Could not update', () => setTrackPosition(db, t.id, ordinal, new Date().toISOString()));
        }}
      />
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.surface },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg, backgroundColor: c.surface },
    scroll: { padding: layout.inset, paddingBottom: space.xxl, gap: 12 },
    coverWrap: { alignItems: 'center', marginBottom: 8, ...elevation.level1 },
    title: { ...font.headlineSmall, color: c.onSurface, fontWeight: '700', textAlign: 'center' },
    credit: { ...font.titleMedium, color: c.onSurfaceVariant, textAlign: 'center' },
    meta: { ...font.labelLarge, color: c.primary, textAlign: 'center', letterSpacing: 0.5 },
    card: {
      backgroundColor: c.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.outlineVariant,
      padding: space.md,
      gap: 8,
    },
    position: { ...font.titleMedium, color: c.onSurface, fontWeight: '600' },
    muted: { ...font.bodyMedium, color: c.onSurfaceVariant },
    progressTrack: { height: layout.progressHeight, borderRadius: radius.full, backgroundColor: c.surfaceContainerHighest, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: c.primary },
    statRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    statLabel: { ...font.bodyMedium, color: c.onSurfaceVariant },
    statValue: { ...font.bodyMedium, color: c.onSurface, flexShrink: 1, textAlign: 'right' },
    activity: { ...font.bodyMedium, color: c.primary, fontWeight: '600', marginTop: 4 },
    section: { gap: 6 },
    sectionTitle: { ...font.titleMedium, color: c.onSurface, fontWeight: '700' },
    description: { ...font.bodyLarge, color: c.onSurface, lineHeight: 24 },
    moreButton: { alignSelf: 'flex-start', paddingVertical: 4 },
    moreText: { ...font.labelLarge, color: c.primary, fontWeight: '700' },
    actions: { gap: 10, marginTop: 8 },
    primary: { height: 48, borderRadius: radius.full, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...elevation.level1 },
    primaryText: { ...font.labelLarge, color: c.onPrimary, fontWeight: '700' },
    secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    secondary: {
      flexGrow: 1,
      height: 44,
      paddingHorizontal: 16,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: c.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { ...font.labelLarge, color: c.primary, fontWeight: '700' },
    delete: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
    deleteText: { ...font.labelLarge, color: c.error, fontWeight: '700' },
  });
}
