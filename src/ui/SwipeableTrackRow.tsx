import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TrackSummary } from '@/data/trackRepo';
import { font, useTheme, type Palette } from '@/ui/theme';
import { canEditPosition, TrackRow } from '@/ui/TrackRow';

/** Threshold for quick swipe activation. */
const LATCH = 28;
/** Below this horizontal distance, the gesture is treated as a list scroll, not a swipe. */
const SLOP = 12;
/** Deep swipe threshold on right swipe that transitions from Backlog/Pause to Delete. */
const DELETE_THRESHOLD = 150;
/** Maximum swipe distances. */
const MAX_SWIPE_RIGHT = 240;
const MAX_SWIPE_LEFT = 140;

export function SwipeableTrackRow({
  track,
  onAdvance,
  onResume,
  onRename,
  onDelete,
  onReturnToBacklog,
  onEditProgress,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onRename: (track: TrackSummary, title: string) => void;
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
  // Single-sourced from TrackRow's own gate (A18/A19) so the swipe action and
  // the row's long-press gesture never disagree about what's editable.
  const canEdit = onEditProgress !== undefined && canEditPosition(track);

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

  // Isolate container visibility by swipe direction so background colors never bleed over each other
  const leftActionOpacity = translateX.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  const rightActionOpacity = translateX.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [1, 0, 0],
    extrapolate: 'clamp',
  });

  // Smooth background color & text transitions between Backlog/Pause and Delete.
  // Every breakpoint here is anchored relative to DELETE_THRESHOLD (150dp).
  const containerBg = canReturn
    ? translateX.interpolate({
        inputRange: [0, 80, 130, DELETE_THRESHOLD + 5],
        outputRange: [c.secondaryContainer, c.secondaryContainer, c.errorContainer, c.errorContainer],
        extrapolate: 'clamp',
      })
    : c.errorContainer;

  const pauseOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 20, 110, 135],
        outputRange: [1, 1, 0.2, 0],
        extrapolate: 'clamp',
      })
    : 0;

  const deleteOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 95, 135, DELETE_THRESHOLD + 5],
        outputRange: [0, 0, 0.85, 1],
        extrapolate: 'clamp',
      })
    : 1;

  const deleteScale = canReturn
    ? translateX.interpolate({
        inputRange: [95, DELETE_THRESHOLD, DELETE_THRESHOLD + 40],
        outputRange: [0.75, 1, 1.1],
        extrapolate: 'clamp',
      })
    : 1;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > SLOP && Math.abs(g.dx) > Math.abs(g.dy) * 2.0,
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const next = offset.current + g.dx;
          const minX = canEdit ? -MAX_SWIPE_LEFT : 0;
          const maxX = MAX_SWIPE_RIGHT;
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

          if (canReturn && (next >= DELETE_THRESHOLD || (next >= 120 && g.vx > 0.5))) {
            // Longer/deep swipe to the right triggers delete
            settle(0);
            confirmDelete();
          } else if (!canReturn && (next >= LATCH || g.vx > 0.35)) {
            // Backlog shelf swipe right deletes
            settle(0);
            confirmDelete();
          } else if (canReturn && (next >= LATCH || g.vx > 0.35)) {
            // Quick swipe to the right immediately activates pause / backlog
            settle(0);
            triggerReturn();
          } else if (canEdit && (next <= -LATCH || g.vx < -0.35)) {
            // Quick swipe to the left immediately activates edit
            settle(0);
            handleEdit();
          } else {
            settle(0);
          }
        },
        onPanResponderTerminate: (_e, g) => {
          const next = offset.current + (g?.dx ?? 0);
          setIsDeepSwipe(false);

          if (canReturn && next >= DELETE_THRESHOLD) {
            settle(0);
            confirmDelete();
          } else if (!canReturn && next >= LATCH) {
            settle(0);
            confirmDelete();
          } else {
            settle(0);
          }
        },
      }),
    [canReturn, canEdit, settle, translateX, triggerReturn, confirmDelete, handleEdit],
  );

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="box-none">
        {/* Left Action (revealed on Right Swipe: full length colored background with animated transition) */}
        {canReturn ? (
          <Animated.View
            style={[
              styles.leftActionContainer,
              { backgroundColor: containerBg, opacity: leftActionOpacity },
            ]}
          >
            {/* Pause / Backlog layer */}
            <Animated.View
              style={[StyleSheet.absoluteFill, styles.leftActionContent, { opacity: pauseOpacity }]}
              pointerEvents={isDeepSwipe ? 'none' : 'auto'}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  resetting ? `Move ${track.title} to the backlog` : `Pause ${track.title}`
                }
                onPress={triggerReturn}
                style={styles.actionPressableLeft}
              >
                <Ionicons
                  name={resetting ? 'bookmark' : 'pause-circle'}
                  size={24}
                  color={c.onSecondaryContainer}
                />
                <Text style={[styles.actionText, styles.pauseText]}>
                  {resetting ? 'Backlog' : 'Pause'}
                </Text>
              </Pressable>
            </Animated.View>

            {/* Delete layer */}
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                styles.leftActionContent,
                { opacity: deleteOpacity, transform: [{ scale: deleteScale }] },
              ]}
              pointerEvents={isDeepSwipe ? 'auto' : 'none'}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${track.title}`}
                onPress={confirmDelete}
                style={styles.actionPressableLeft}
              >
                <Ionicons name="trash" size={24} color={c.onErrorContainer} />
                <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
              </Pressable>
            </Animated.View>
          </Animated.View>
        ) : (
          <Animated.View
            style={[
              styles.leftActionContainer,
              { backgroundColor: c.errorContainer, opacity: leftActionOpacity },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${track.title}`}
              onPress={confirmDelete}
              style={styles.actionPressableLeft}
            >
              <Ionicons name="trash" size={24} color={c.onErrorContainer} />
              <Text style={[styles.actionText, styles.deleteText]}>Delete</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Right Action (revealed on Left Swipe: full length colored background for Edit) */}
        {canEdit && (
          <Animated.View
            style={[
              styles.rightActionContainer,
              { opacity: rightActionOpacity },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${track.title} progress`}
              onPress={handleEdit}
              style={styles.actionPressableRight}
            >
              {/* Icon first, label last: this pill is pinned to the right
                  edge (rightActionContainer's alignItems: 'flex-end'), and a
                  left swipe uncovers it right edge first — so whichever
                  child is last in this row is what actually reads earliest,
                  with the smallest swipe. */}
              <Ionicons name="create" size={24} color={c.onPrimaryContainer} />
              <Text style={[styles.actionText, styles.editText]}>Edit</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>

      <Animated.View
        testID="swipeable-surface"
        style={[styles.surface, { transform: [{ translateX }] }]}
        {...pan.panHandlers}
      >
        <TrackRow
          track={track}
          onAdvance={onAdvance}
          onResume={onResume}
          onRename={onRename}
          onEditProgress={onEditProgress}
        />
      </Animated.View>
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    container: {
      position: 'relative',
      overflow: 'hidden',
    },
    actions: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      justifyContent: 'center',
    },
    leftActionContainer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    leftActionContent: {
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    actionPressableLeft: {
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingLeft: 24,
      minWidth: 120,
    },
    rightActionContainer: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.primaryContainer,
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    actionPressableRight: {
      height: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingRight: 24,
      minWidth: 120,
    },
    actionText: {
      ...font.labelLarge,
      fontWeight: '700',
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
      ...(Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as any) : {}),
    },
  });
}







