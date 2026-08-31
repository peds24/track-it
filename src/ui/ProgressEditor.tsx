import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { ordinalFor, positionIn } from '@/domain/seasons';
import type { UnitLabel } from '@/domain/types';
import { unitLabelFor } from '@/providers/manual';
import { elevation, font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';

const UNIT_WORD: Record<UnitLabel, string> = {
  episode: 'Episode',
  issue: 'Issue',
  volume: 'Volume',
};

function typed(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

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

  const trackId = track?.id ?? null;
  useEffect(() => {
    setSeason('');
    setUnitValue('');
  }, [trackId]);

  if (track === null || track.progress === null) return null;

  const total = track.progress.total;
  const unit = unitLabelFor(track.category) ?? 'episode';
  const unitWord = UNIT_WORD[unit];

  const currentOrdinal = track.progress.done + 1;

  const seasons = track.seasons && track.seasons.length > 0 ? track.seasons : null;
  const at = seasons ? positionIn(seasons, currentOrdinal) : null;
  const seasoned = seasons !== null && at !== null;

  const seasonNumber = seasoned ? (typed(season) ?? at.season) : null;
  const seasonTotal =
    seasoned && seasonNumber !== null
      ? (seasons.find((s) => s.number === seasonNumber)?.episodeCount ?? null)
      : null;

  const unitTotal = seasoned ? seasonTotal : total;
  const unitPlaceholder = seasoned ? at.episode : currentOrdinal;

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
                placeholderTextColor={c.onSurfaceVariant}
                value={season}
                onChangeText={setSeason}
                keyboardType="number-pad"
                maxLength={3}
                cursorColor={c.primary}
                selectionColor={c.primaryContainer}
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
              placeholderTextColor={c.onSurfaceVariant}
              value={unitValue}
              onChangeText={setUnitValue}
              keyboardType="number-pad"
              maxLength={5}
              autoFocus
              cursorColor={c.primary}
              selectionColor={c.primaryContainer}
              underlineColorAndroid="transparent"
            />
            <Text style={styles.total}>{unitTotal === null ? '—' : `of ${unitTotal}`}</Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={onCancel}
              style={styles.cancel}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save position"
              accessibilityState={{ disabled: target === null }}
              onPress={() => target !== null && onSubmit(track, target)}
              style={[styles.save, target === null && styles.saveDisabled]}
            >
              <Text style={[styles.saveText, target === null && styles.saveTextDisabled]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.scrim + '66',
      alignItems: 'center',
      justifyContent: 'center',
      padding: layout.inset,
    },
    card: {
      width: '100%',
      backgroundColor: c.surfaceContainerHigh,
      borderRadius: radius.xl,
      padding: space.lg,
      ...elevation.level3,
    },
    title: {
      ...font.headlineSmall,
      color: c.onSurface,
      fontWeight: '600',
    },
    subtitle: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      marginTop: 4,
      marginBottom: 20,
    },
    field: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: layout.metaGap,
      marginBottom: 14,
    },
    label: {
      ...font.labelLarge,
      color: c.onSurfaceVariant,
      width: 72,
    },
    input: {
      ...font.bodyLarge,
      color: c.onSurface,
      flex: 1,
      height: 48,
      paddingHorizontal: 14,
      backgroundColor: c.surfaceContainer,
      borderWidth: 1,
      borderColor: c.outline,
      borderRadius: radius.sm,
      fontVariant: ['tabular-nums'],
    },
    total: {
      ...font.bodyMedium,
      color: c.onSurfaceVariant,
      width: 60,
      fontVariant: ['tabular-nums'],
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
    },
    cancel: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: radius.full,
    },
    cancelText: {
      ...font.labelLarge,
      color: c.primary,
      fontWeight: '600',
    },
    save: {
      paddingVertical: 10,
      paddingHorizontal: 24,
      borderRadius: radius.full,
      backgroundColor: c.primary,
    },
    saveDisabled: {
      backgroundColor: c.surfaceContainerHighest,
    },
    saveText: {
      ...font.labelLarge,
      color: c.onPrimary,
      fontWeight: '600',
    },
    saveTextDisabled: {
      color: c.outline,
    },
  });
}

