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
 * shut and the action runs, with no second tap on a revealed button. A drag
 * that stops short of it still just latches the button open, so a partial
 * swipe stays undo-able right up until something is actually pressed.
 */
const FULL_SWIPE = ACTION_WIDTH * 1.8;

/**
 * A row with two actions behind a swipe: drag right to pause (or, once a
 * track is already finished, to reset it back to the backlog), drag left to
 * delete. Both are one-gesture operations — drag far enough and releasing
 * fires the action, exactly like Mail's full-swipe-to-archive. A shorter drag
 * still latches the row open so the button can be tapped instead.
 *
 * Only delete confirms. Pausing used to mean "confirm, because the progress
 * cannot come back" (D4) — now it can (A6, Resume), so a paused track is not
 * destroying anything and needs no dialog in the way. Resetting an already
 * finished track still does, since that really does erase its history.
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
  onResume,
  onDelete,
  onReturnToBacklog,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
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
  // A6: only a track with nothing left to finish gets the old D4 reset —
  // everything still in progress is paused instead, and needs no confirmation.
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
      // Reversible — Resume undoes it — so there is nothing to confirm.
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
        // Claim only clearly horizontal drags, so the list still scrolls.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          // Let the drag travel all the way to FULL_SWIPE, not just
          // ACTION_WIDTH, so the row keeps sliding as you approach the
          // trigger point instead of stalling under your finger.
          const next = offset.current + g.dx;
          const clamped = Math.max(-FULL_SWIPE, Math.min(canReturn ? FULL_SWIPE : 0, next));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          // A full-length drag fires the action on release — one gesture, no
          // second tap on the revealed button. A shorter drag just latches
          // the button open.
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

      {/* Opaque: it slides over the actions, and a transparent row would show
          both layers at once. */}
      <Animated.View
        style={[styles.surface, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <TrackRow track={track} onAdvance={onAdvance} onResume={onResume} />
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
    pauseAction: { backgroundColor: c.pause, marginLeft: space.sm },
    deleteAction: { backgroundColor: c.danger, marginRight: space.sm, alignItems: 'flex-end' },
    actionText: { ...font.control, color: c.ink },
    pauseText: { color: '#FFFFFF' },
    deleteText: { color: '#FFFFFF' },
    surface: { backgroundColor: c.bg },
  });
}
