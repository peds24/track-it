import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TrackSummary } from '@/data/trackRepo';
import { completionMessage } from '@/ui/completionMessage';
import { font, useTheme, type Palette } from '@/ui/theme';
import { TrackRow } from '@/ui/TrackRow';

/** Threshold for quick swipe activation. */
const LATCH = 28;
/** Below this the gesture is treated as a list scroll, not a swipe. */
const SLOP = 10;
/** Deep swipe threshold on right swipe that transitions from Backlog/Pause to Delete. */
const DELETE_THRESHOLD = 175;
/** Maximum swipe distances. */
const MAX_SWIPE_RIGHT = 260;
const MAX_SWIPE_LEFT_SHALLOW = 160;
/** A23: deep left swipe that moves from Edit to Complete — mirrors DELETE_THRESHOLD. */
const COMPLETE_THRESHOLD = 175;
const MAX_SWIPE_LEFT_DEEP = 260;

export function SwipeableTrackRow({
  track,
  onAdvance,
  onResume,
  onRename,
  onDelete,
  onReturnToBacklog,
  onEditProgress,
  onComplete,
  onOpen,
}: {
  track: TrackSummary;
  onAdvance: (entryId: string) => void;
  onResume: (track: TrackSummary) => void;
  onRename: (track: TrackSummary, title: string) => void;
  onDelete: (track: TrackSummary) => void;
  onReturnToBacklog: (track: TrackSummary) => void;
  onEditProgress?: (track: TrackSummary) => void;
  onComplete?: (track: TrackSummary) => void;
  onOpen?: (track: TrackSummary) => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const translateX = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const [isDeepSwipe, setIsDeepSwipe] = useState(false);
  const [isDeepLeft, setIsDeepLeft] = useState(false);

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
    setIsDeepLeft(false);
    settle(0);
  }, [settle]);

  const canReturn = track.shelf !== 'backlog';
  const resetting = track.shelf === 'done';
  const canEdit =
    onEditProgress !== undefined &&
    track.progress !== null &&
    track.progress.total > 0;
  const canComplete = onComplete !== undefined && track.shelf !== 'done';
  const leftTwoStep = canEdit && canComplete;

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

  // A23: completing touches every unit (and, for an ongoing series, ends it),
  // so it is confirmed like Delete, never fired by the swipe alone.
  const confirmComplete = useCallback(() => {
    Alert.alert(
      `Mark ${track.title} complete?`,
      completionMessage(track),
      [
        { text: 'Cancel', style: 'cancel', onPress: close },
        {
          text: 'Complete',
          onPress: () => {
            close();
            onComplete?.(track);
          },
        },
      ],
      { onDismiss: close },
    );
  }, [track, onComplete, close]);

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

  const rightContainerBg = leftTwoStep
    ? translateX.interpolate({
        inputRange: [-180, -150, -100, 0],
        outputRange: [c.tertiaryContainer, c.tertiaryContainer, c.primaryContainer, c.primaryContainer],
        extrapolate: 'clamp',
      })
    : canComplete
      ? c.tertiaryContainer
      : c.primaryContainer;

  const editOpacity = leftTwoStep
    ? translateX.interpolate({ inputRange: [-160, -130, -30, 0], outputRange: [0, 0.2, 1, 1], extrapolate: 'clamp' })
    : 1;

  const completeOpacity = leftTwoStep
    ? translateX.interpolate({ inputRange: [-180, -155, -120, 0], outputRange: [1, 0.85, 0, 0], extrapolate: 'clamp' })
    : 1;

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

  // Smooth background color & text transitions between Backlog/Pause and Delete
  const containerBg = canReturn
    ? translateX.interpolate({
        inputRange: [0, 100, 150, 180],
        outputRange: [c.secondaryContainer, c.secondaryContainer, c.errorContainer, c.errorContainer],
        extrapolate: 'clamp',
      })
    : c.errorContainer;

  const pauseOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 30, 130, 160],
        outputRange: [1, 1, 0.2, 0],
        extrapolate: 'clamp',
      })
    : 0;

  const deleteOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 120, 155, 180],
        outputRange: [0, 0, 0.85, 1],
        extrapolate: 'clamp',
      })
    : 1;

  const deleteScale = canReturn
    ? translateX.interpolate({
        inputRange: [120, 175, 220],
        outputRange: [0.75, 1, 1.1],
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
          const minX = canComplete ? (leftTwoStep ? -MAX_SWIPE_LEFT_DEEP : -MAX_SWIPE_LEFT_SHALLOW) : canEdit ? -MAX_SWIPE_LEFT_SHALLOW : 0;
          const maxX = canReturn ? MAX_SWIPE_RIGHT : MAX_SWIPE_LEFT_SHALLOW;
          const clamped = Math.max(minX, Math.min(maxX, next));
          translateX.setValue(clamped);

          if (canReturn) {
            if (clamped >= DELETE_THRESHOLD) {
              setIsDeepSwipe(true);
            } else {
              setIsDeepSwipe(false);
            }
          }

          if (leftTwoStep) setIsDeepLeft(clamped <= -COMPLETE_THRESHOLD);
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          setIsDeepSwipe(false);
          setIsDeepLeft(false);

          if (next >= DELETE_THRESHOLD) {
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
          } else if (leftTwoStep && next <= -COMPLETE_THRESHOLD) {
            // Deep swipe to the left, when Edit is also available, moves past
            // Edit to Complete.
            settle(0);
            confirmComplete();
          } else if (!canEdit && canComplete && (next <= -LATCH || g.vx < -0.35)) {
            // Nothing to edit: Complete is the single left-swipe step, the
            // same way Delete is Backlog's single right-swipe step.
            settle(0);
            confirmComplete();
          } else if (canEdit && (next <= -LATCH || g.vx < -0.35)) {
            // Quick swipe to the left immediately activates edit
            settle(0);
            handleEdit();
          } else {
            settle(0);
          }
        },
        onPanResponderTerminate: () => {
          setIsDeepSwipe(false);
          setIsDeepLeft(false);
          settle(offset.current);
        },
      }),
    [
      canReturn,
      canEdit,
      canComplete,
      leftTwoStep,
      settle,
      translateX,
      triggerReturn,
      confirmDelete,
      confirmComplete,
      handleEdit,
    ],
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

        {/* Right Action (revealed on Left Swipe: full length colored background for Edit / Complete) */}
        {(canEdit || canComplete) && (
          <Animated.View
            style={[styles.rightActionContainer, { backgroundColor: rightContainerBg, opacity: rightActionOpacity }]}
          >
            {canEdit && (
              <Animated.View
                style={[StyleSheet.absoluteFill, styles.rightActionContent, { opacity: editOpacity }]}
                pointerEvents={isDeepLeft ? 'none' : 'auto'}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${track.title} progress`}
                  onPress={handleEdit}
                  style={styles.actionPressableRight}
                >
                  <Text style={[styles.actionText, styles.editText]}>Edit</Text>
                  <Ionicons name="create" size={24} color={c.onPrimaryContainer} />
                </Pressable>
              </Animated.View>
            )}
            {canComplete && (
              <Animated.View
                style={[StyleSheet.absoluteFill, styles.rightActionContent, { opacity: completeOpacity }]}
                pointerEvents={leftTwoStep && !isDeepLeft ? 'none' : 'auto'}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Complete ${track.title}`}
                  onPress={confirmComplete}
                  style={styles.actionPressableRight}
                >
                  <Text style={[styles.actionText, styles.completeText]}>Complete</Text>
                  <Ionicons name="checkmark-done" size={24} color={c.onTertiaryContainer} />
                </Pressable>
              </Animated.View>
            )}
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
          onOpen={onOpen}
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
      justifyContent: 'center',
      alignItems: 'flex-end',
    },
    rightActionContent: {
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
    completeText: {
      color: c.onTertiaryContainer,
    },
    surface: {
      backgroundColor: c.surface,
    },
  });
}






