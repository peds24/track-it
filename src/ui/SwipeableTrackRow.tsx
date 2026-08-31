import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { font, radius, useTheme, type Palette } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

const ACTION_WIDTH = 84;
/** How far you must drag before the row latches open rather than snapping back. */
const LATCH = 52;
/** Below this the gesture is treated as a list scroll, not a swipe. */
const SLOP = 10;
/** Deep swipe threshold on right swipe that transitions from Backlog/Pause to Delete. */
const DELETE_THRESHOLD = 140;
/** Maximum swipe distances. */
const MAX_SWIPE_RIGHT = 200;
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
  const [isDeepSwipe, setIsDeepSwipe] = useState(false);

  const settle = useCallback(
    (to: number) => {
      offset.current = to;
      Animated.spring(translateX, {
        toValue: to,
        useNativeDriver: false,
        bounciness: 0,
        speed: 20,
      }).start();
    },
    [translateX],
  );

  const close = useCallback(() => {
    setIsDeepSwipe(false);
    settle(0);
  }, [settle]);

  const canReturn = track.shelf !== 'backlog';
  const resetting = track.shelf === 'done';
  const canEdit =
    onEditProgress !== undefined &&
    track.progress !== null &&
    track.progress.total > 0;

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

  const handleEdit = useCallback(() => {
    close();
    onEditProgress?.(track);
  }, [close, onEditProgress, track]);

  // Smooth transitions between Backlog/Pause and Delete
  const containerBg = canReturn
    ? translateX.interpolate({
        inputRange: [0, 80, 130, 160],
        outputRange: [c.secondaryContainer, c.secondaryContainer, c.errorContainer, c.errorContainer],
        extrapolate: 'clamp',
      })
    : c.errorContainer;

  const pauseOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 80, 120, 140],
        outputRange: [1, 1, 0.2, 0],
        extrapolate: 'clamp',
      })
    : 0;

  const deleteOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 85, 130, 160],
        outputRange: [0, 0, 0.85, 1],
        extrapolate: 'clamp',
      })
    : 1;

  const deleteScale = canReturn
    ? translateX.interpolate({
        inputRange: [85, 140, 180],
        outputRange: [0.8, 1, 1.06],
        extrapolate: 'clamp',
      })
    : 1;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          const next = offset.current + g.dx;
          const minX = canEdit ? -ACTION_WIDTH * 1.5 : 0;
          const maxX = canReturn ? MAX_SWIPE_RIGHT : ACTION_WIDTH * 1.5;
          const clamped = Math.max(minX, Math.min(maxX, next));
          translateX.setValue(clamped);

          if (canReturn) {
            if (clamped >= DELETE_THRESHOLD) {
              setIsDeepSwipe(true);
            } else {
              setIsDeepSwipe(false);
            }
          }
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          setIsDeepSwipe(false);

          if (next >= DELETE_THRESHOLD) {
            // Deep swipe to the right becomes delete
            settle(0);
            confirmDelete();
          } else if (!canReturn && next >= FULL_SWIPE) {
            // Full swipe on backlog shelf deletes
            settle(0);
            confirmDelete();
          } else if (canReturn && next >= FULL_SWIPE) {
            // Full swipe on returnable shelf moves to backlog/pauses
            settle(0);
            triggerReturn();
          } else if (next >= LATCH) {
            // Small right swipe latches open (Pause/Backlog or Delete)
            settle(ACTION_WIDTH);
          } else if (canEdit && next <= -FULL_SWIPE) {
            // Full left swipe opens edit screen
            settle(0);
            handleEdit();
          } else if (canEdit && next <= -LATCH) {
            // Left swipe latches open edit button
            settle(-ACTION_WIDTH);
          } else {
            settle(0);
          }
        },
        onPanResponderTerminate: () => {
          setIsDeepSwipe(false);
          settle(offset.current);
        },
      }),
    [canReturn, canEdit, settle, translateX, triggerReturn, confirmDelete, handleEdit],
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="box-none">
        {/* Left Action (revealed on Right Swipe: animated transition from Pause/Backlog to Delete) */}
        {canReturn ? (
          <Animated.View
            style={[
              styles.action,
              styles.leftAction,
              { backgroundColor: containerBg },
            ]}
          >
            {/* Pause / Backlog layer */}
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.actionInner, { opacity: pauseOpacity }]}
              pointerEvents={isDeepSwipe ? 'none' : 'auto'}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  resetting ? `Move ${track.title} to the backlog` : `Pause ${track.title}`
                }
                onPress={triggerReturn}
                style={styles.pressableFill}
              >
                <Text style={[styles.actionText, styles.pauseText]}>
                  {resetting ? 'Backlog' : 'Pause'}
                </Text>
              </Pressable>
            </Animated.View>

            {/* Delete layer */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.actionInner,
                { opacity: deleteOpacity, transform: [{ scale: deleteScale }] },
              ]}
              pointerEvents={isDeepSwipe ? 'auto' : 'none'}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${track.title}`}
                onPress={confirmDelete}
                style={styles.pressableFill}
              >
                <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.action,
              styles.leftAction,
              { backgroundColor: c.errorContainer },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${track.title}`}
              onPress={confirmDelete}
              style={styles.pressableFill}
            >
              <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Right Action (revealed on Left Swipe: Edit progress) */}
        {canEdit && (
          <View style={[styles.action, styles.rightAction]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${track.title} progress`}
              onPress={handleEdit}
              style={styles.pressableFill}
            >
              <Text style={[styles.actionText, styles.editText]}>Edit</Text>
            </Pressable>
          </View>
        )}
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
      justifyContent: 'center',
    },
    action: {
      position: 'absolute',
      top: 8,
      bottom: 8,
      width: 72,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    leftAction: {
      left: 10,
    },
    rightAction: {
      right: 10,
      backgroundColor: c.primaryContainer,
    },
    actionInner: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    pressableFill: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    actionText: {
      ...font.labelMedium,
      fontWeight: '700',
      textAlign: 'center',
    },
    pauseText: {
      color: c.onSecondaryContainer,
    },
    deleteText: {
      color: c.onErrorContainer,
    },
    editText: {
      color: c.onPrimaryContainer,
    },
    surface: {
      backgroundColor: c.surface,
    },
  });
}




