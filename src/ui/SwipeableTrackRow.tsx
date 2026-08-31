import { useCallback, useMemo, useRef } from 'react';
import { Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { font, layout, radius, space, useTheme, type Palette } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const ACTION_WIDTH = 96;
/** How far you must drag before the row latches open rather than snapping back. */
const LATCH = 64;
/** Below this the gesture is treated as a list scroll, not a swipe. */
const SLOP = 10;
/**
 * Drag past this and release fires the action immediately — the row snaps
 * shut and the action runs.
 */
const FULL_SWIPE = ACTION_WIDTH * 1.8;

export function SwipeableTrackRow({
  track,
  onAdvance,
  onResume,
  onDelete,
  onReturnToBacklog,
  onEditProgress,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onDelete: (track: TrackSummary) => void;
  onReturnToBacklog: (track: TrackSummary) => void;
  onEditProgress?: (track: TrackSummary) => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const translateX = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);

  const settle = useCallback(
    (to: number) => {
      offset.current = to;
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    },
    [translateX],
  );

  const close = useCallback(() => settle(0), [settle]);

  const canReturn = track.shelf !== 'backlog';
  const resetting = track.shelf === 'done';

  const confirmDelete = useCallback(() => {
    Alert.alert(
      `Delete ${track.title}?`,
      track.kind === 'series'
        ? 'This removes the track and every episode, issue or volume under it. It cannot be undone.'
        : 'This removes the track. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel', onPress: close },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            close();
            onDelete(track);
          },
        },
      ],
      { onDismiss: close },
    );
  }, [track, onDelete, close]);

  const triggerReturn = useCallback(() => {
    if (!resetting) {
      close();
      onReturnToBacklog(track);
      return;
    }
    Alert.alert(
      `Move ${track.title} to the backlog?`,
      'Its progress will be cleared — the backlog only holds things you have not started.',
      [
        { text: 'Cancel', style: 'cancel', onPress: close },
        {
          text: 'Move',
          style: 'destructive',
          onPress: () => {
            close();
            onReturnToBacklog(track);
          },
        },
      ],
      { onDismiss: close },
    );
  }, [track, resetting, onReturnToBacklog, close]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          const next = offset.current + g.dx;
          const clamped = Math.max(-FULL_SWIPE, Math.min(canReturn ? FULL_SWIPE : 0, next));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          if (canReturn && next > FULL_SWIPE) {
            settle(0);
            triggerReturn();
          } else if (next < -FULL_SWIPE) {
            settle(0);
            confirmDelete();
          } else if (canReturn && next > LATCH) {
            settle(ACTION_WIDTH);
          } else if (next < -LATCH) {
            settle(-ACTION_WIDTH);
          } else {
            settle(0);
          }
        },
        onPanResponderTerminate: () => settle(offset.current),
      }),
    [canReturn, settle, translateX, triggerReturn, confirmDelete],
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="box-none">
        {canReturn && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              resetting ? `Move ${track.title} to the backlog` : `Pause ${track.title}`
            }
            onPress={triggerReturn}
            style={[styles.action, styles.pauseAction]}
          >
            <Text style={[styles.actionText, styles.pauseText]}>
              {resetting ? 'To backlog' : 'Pause'}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${track.title}`}
          onPress={confirmDelete}
          style={[styles.action, styles.deleteAction]}
        >
          <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
        </Pressable>
      </View>

      <Animated.View
        style={[styles.surface, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <TrackRow
          track={track}
          onAdvance={onAdvance}
          onResume={onResume}
          onEditProgress={onEditProgress}
        />
      </Animated.View>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    container: { position: 'relative' },
    actions: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    action: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      width: ACTION_WIDTH,
      justifyContent: 'center',
      paddingHorizontal: layout.inset,
      marginVertical: space.xs,
      borderRadius: radius.md,
    },
    pauseAction: {
      left: 0,
      backgroundColor: c.secondaryContainer,
      marginLeft: space.xs,
    },
    deleteAction: {
      right: 0,
      backgroundColor: c.errorContainer,
      marginRight: space.xs,
      alignItems: 'flex-end',
    },
    actionText: {
      ...font.labelLarge,
      fontWeight: '600',
    },
    pauseText: {
      color: c.onSecondaryContainer,
    },
    deleteText: {
      color: c.onErrorContainer,
    },
    surface: {
      backgroundColor: c.surface,
    },
  });
}

