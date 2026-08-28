import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { ordinalFor, positionIn } from '@/domain/seasons';
import type { UnitLabel } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { font, layout, radius, underline, useTheme, type Palette } from '@/ui/theme';

const UNIT_WORD: Record<UnitLabel, string> = {
  episode: 'Episode',
  issue: 'Issue',
  volume: 'Volume',
};

/** A blank field is not an answer; anything else must be a whole number. */
function typed(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * A12: jump a series to a position instead of tapping Done up to it. Opened by
 * holding the row's advance control (see `canEditPosition`), and `null` when
 * closed — one editor is rendered per screen rather than one per row.
 *
 * The number is the unit you are *on*, matching what the row already says
 * ("Watching Episode 61", "S3 Ep 15 of 24"), so it is one past the count the
 * meta line shows. The total is never editable: it is the number of `Entry`
 * rows the series actually has, and changing it would mean adding or deleting
 * units, which is a different operation from saying where you are.
 *
 * Nothing is clamped or corrected. A number the series does not have simply
 * leaves Save inert, so a typo never quietly moves a track somewhere else.
 */
export function ProgressEditor({
  track,
  onCancel,
  onSubmit,
}: {
  track: TrackSummary | null;
  onCancel: () => void;
  onSubmit: (track: TrackSummary, ordinal: number) => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [season, setSeason] = useState('');
  const [unitValue, setUnitValue] = useState('');

  // Opening the editor on a different row must not inherit the last row's
  // half-typed number.
  const trackId = track?.id ?? null;
  useEffect(() => {
    setSeason('');
    setUnitValue('');
  }, [trackId]);

  if (track === null || track.progress === null) return null;

  const total = track.progress.total;
  const unit = unitLabelFor(track.category) ?? 'episode';
  const unitWord = UNIT_WORD[unit];

  // Where the track is now: the unit after the last one finished.
  const currentOrdinal = track.progress.done + 1;

  // Season data is TMDB-only (A11) and is display metadata, not the source of
  // truth for how many entries exist — so a show whose seasons do not line up
  // with its entries falls back to the flat field rather than offering two
  // fields that cannot address every unit.
  const seasons = track.seasons && track.seasons.length > 0 ? track.seasons : null;
  const at = seasons ? positionIn(seasons, currentOrdinal) : null;
  const seasoned = seasons !== null && at !== null;

  // An untouched season field means "the season it already showed", so
  // changing only the episode number stays inside the current season.
  const seasonNumber = seasoned ? (typed(season) ?? at.season) : null;
  const seasonTotal =
    seasoned && seasonNumber !== null
      ? (seasons.find((s) => s.number === seasonNumber)?.episodeCount ?? null)
      : null;

  const unitTotal = seasoned ? seasonTotal : total;
  const unitPlaceholder = seasoned ? at.episode : currentOrdinal;

  // The one number this all resolves to, or null if what is typed does not
  // name a unit of this series. The `<= total` guard is the backstop for
  // season data that claims more episodes than there are entries.
  const typedUnit = typed(unitValue);
  const target = (() => {
    if (typedUnit === null) return null;
    if (seasoned) {
      if (seasonNumber === null) return null;
      const flat = ordinalFor(seasons, seasonNumber, typedUnit);
      return flat !== null && flat <= total ? flat : null;
    }
    return typedUnit >= 1 && typedUnit <= total ? typedUnit : null;
  })();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit track number</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {track.title}
          </Text>

          {seasoned && (
            <View style={styles.field}>
              <Text style={styles.label}>Season</Text>
              <TextInput
                style={styles.input}
                accessibilityLabel="Season number"
                placeholder={String(at.season)}
                placeholderTextColor={c.faint}
                value={season}
                onChangeText={setSeason}
                keyboardType="number-pad"
                maxLength={3}
                cursorColor={c.ink}
                selectionColor={c.ink}
                underlineColorAndroid="transparent"
              />
              <Text style={styles.total}>{`of ${seasons.length}`}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>{unitWord}</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel={`${unitWord} number`}
              placeholder={String(unitPlaceholder)}
              placeholderTextColor={c.faint}
              value={unitValue}
              onChangeText={setUnitValue}
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
              cursorColor={c.ink}
              selectionColor={c.ink}
              underlineColorAndroid="transparent"
            />
            {/* Not editable: the denominator is how many units exist, not a
                number you are reporting. */}
            <Text style={styles.total}>{unitTotal === null ? '—' : `of ${unitTotal}`}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save position"
            accessibilityState={{ disabled: target === null }}
            onPress={() => target !== null && onSubmit(track, target)}
            style={[styles.save, target === null && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>Save</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            onPress={onCancel}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: layout.inset,
    },
    card: {
      width: '100%',
      backgroundColor: c.bg,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
      padding: layout.inset,
    },
    title: { ...font.rowTitle, color: c.ink },
    subtitle: { ...font.meta, color: c.muted, marginTop: 3, marginBottom: 16 },
    field: { flexDirection: 'row', alignItems: 'center', gap: layout.metaGap, marginBottom: 12 },
    // Fixed width so Season and Episode line their boxes up rather than
    // stepping in and out with the length of the word.
    label: { ...font.meta, color: c.muted, width: 62 },
    input: {
      ...font.body,
      color: c.ink,
      flex: 1,
      paddingVertical: 11,
      paddingHorizontal: 13,
      borderWidth: 1.5,
      borderColor: c.ruleStrong,
      borderRadius: radius.md,
      fontVariant: ['tabular-nums'],
    },
    total: { ...font.count, color: c.ink, width: 62, fontVariant: ['tabular-nums'] },
    save: { marginTop: 6, padding: 14, borderRadius: radius.md, backgroundColor: c.ink },
    // No accent to grey out — an unusable control drops to the rule weight,
    // the same way a hairline reads as quieter than ink.
    saveDisabled: { backgroundColor: c.rule },
    saveText: { ...font.body, fontWeight: '700', color: c.bg, textAlign: 'center' },
    cancel: { alignSelf: 'center', paddingVertical: 10 },
    cancelText: { ...font.control, ...underline, color: c.muted },
  });
}
