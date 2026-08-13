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
 * A row with its two destructive actions behind a swipe: drag right to reveal
 * "To backlog", drag left to reveal "Delete". Both confirm before acting —
 * neither can be undone and the app keeps no history to restore from.
 *
 * Built on PanResponder rather than a gesture library on purpose. The
 * gesture-handler package's native API is not present in the Expo Go binary,
 * so a Swipeable there fails at runtime with "undefined is not a function".
 * PanResponder ships inside React Native itself and behaves the same in Expo
 * Go and in a standalone build.
 */
export function SwipeableTrackRow({
  track,
  onAdvance,
  onDelete,
  onReturnToBacklog,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onDelete: (track: TrackSummary) => void;
  onReturnToBacklog: (track: TrackSummary) => void;
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

  // A backlog track has nowhere to go back to, so it reveals no left action.
  const canReturn = track.shelf !== 'backlog';

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Claim only clearly horizontal drags, so the list still scrolls.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          const next = offset.current + g.dx;
          const clamped = Math.max(-ACTION_WIDTH, Math.min(canReturn ? ACTION_WIDTH : 0, next));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          if (canReturn && next > LATCH) settle(ACTION_WIDTH);
          else if (next < -LATCH) settle(-ACTION_WIDTH);
          else settle(0);
        },
        onPanResponderTerminate: () => settle(offset.current),
      }),
    [canReturn, settle, translateX],
  );

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

  const confirmReturn = useCallback(() => {
    // Backlog is *defined* as nothing started (D4), so there is nowhere to keep
    // the progress. Say so before it happens rather than after.
    const started = track.progress ? track.progress.done > 0 : true;
    Alert.alert(
      `Move ${track.title} to the backlog?`,
      started
        ? 'Its progress will be cleared — the backlog only holds things you have not started.'
        : 'It moves back to the backlog.',
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
  }, [track, onReturnToBacklog, close]);

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="box-none">
        {canReturn && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Move ${track.title} to the backlog`}
            onPress={confirmReturn}
            style={[styles.action, styles.backlogAction]}
          >
            <Text style={styles.actionText}>To backlog</Text>
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

      {/* Opaque: it slides over the actions, and a transparent row would show
          both layers at once. */}
      <Animated.View
        style={[styles.surface, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <TrackRow track={track} onAdvance={onAdvance} />
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
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    action: {
      width: ACTION_WIDTH,
      justifyContent: 'center',
      paddingHorizontal: layout.inset,
      marginVertical: space.xs,
      borderRadius: radius.control,
    },
    backlogAction: { backgroundColor: c.chip, marginLeft: space.sm },
    deleteAction: { backgroundColor: c.danger, marginRight: space.sm, alignItems: 'flex-end' },
    actionText: { ...font.control, color: c.ink },
    deleteText: { color: '#FFFFFF' },
    surface: { backgroundColor: c.bg },
  });
}
