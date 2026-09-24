import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TrackSummary } from '@/data/trackRepo';
import { showAlert } from '@/ui/alert';
import { completionMessage } from '@/ui/completionMessage';
import { font, useTheme, type Palette } from '@/ui/theme';
import { canEditPosition, TrackRow } from '@/ui/TrackRow';

/** Threshold for quick swipe activation (requires deliberate thumb drag). */
const LATCH = 50;
/** Below this horizontal distance, the gesture is treated as a list scroll, not a swipe. */
const SLOP = 12;
/** Deep swipe threshold on right swipe that transitions from Backlog/Pause to Delete. */
const DELETE_THRESHOLD = 280;
/** Maximum swipe distances. */
const MAX_SWIPE_RIGHT = 360;
const MAX_SWIPE_LEFT = 140;
/** A23: deep left swipe that moves from Edit to Complete — mirrors
 * DELETE_THRESHOLD, scaled to web's larger pointer gestures. */
const COMPLETE_THRESHOLD = 200;
const MAX_SWIPE_LEFT_DEEP = 280;
/** Web: how long after a swipe ends a click on the row is treated as the tail
 * of that swipe rather than a tap of its own. */
const CLICK_AFTER_SWIPE_MS = 350;

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
  // Web: the row moves with the pointer, so a mouse drag that starts and ends
  // on the row's text or advance button puts mouseup on the same element and
  // the browser fires a click — opening the detail screen or marking a unit
  // done right after the swipe did its own thing. Stamp every swipe's end and
  // drop a row tap that arrives immediately after it.
  const swipeEndedAt = useRef<number | null>(null);
  const markSwipeEnded = useCallback(() => {
    swipeEndedAt.current = Date.now();
  }, []);
  const unlessJustSwiped = useCallback(
    <A extends unknown[]>(fn: ((...args: A) => void) | undefined) =>
      fn &&
      ((...args: A) => {
        const ended = swipeEndedAt.current;
        if (ended !== null && Date.now() - ended < CLICK_AFTER_SWIPE_MS) return;
        fn(...args);
      }),
    [],
  );

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
  // Single-sourced from TrackRow's own gate (A18/A19) so the swipe action and
  // the row's long-press gesture never disagree about what's editable.
  const canEdit = onEditProgress !== undefined && canEditPosition(track);
  // A23: Complete is offered on every shelf but Done.
  const canComplete = onComplete !== undefined && track.shelf !== 'done';
  const leftTwoStep = canEdit && canComplete;

  const confirmDelete = useCallback(() => {
    showAlert(
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
    showAlert(
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
    showAlert(
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

  // A23: the left-swipe background shifts from Edit's primary to Complete's
  // tertiary as the row passes COMPLETE_THRESHOLD, the same way the right
  // swipe shifts from Pause to Delete.
  const rightContainerBg = leftTwoStep
    ? translateX.interpolate({
        inputRange: [-(COMPLETE_THRESHOLD + 10), -(COMPLETE_THRESHOLD - 25), -120, 0],
        outputRange: [c.tertiaryContainer, c.tertiaryContainer, c.primaryContainer, c.primaryContainer],
        extrapolate: 'clamp',
      })
    : canComplete
      ? c.tertiaryContainer
      : c.primaryContainer;

  const editOpacity = leftTwoStep
    ? translateX.interpolate({ inputRange: [-185, -150, -40, 0], outputRange: [0, 0.2, 1, 1], extrapolate: 'clamp' })
    : 1;

  const completeOpacity = leftTwoStep
    ? translateX.interpolate({
        inputRange: [-(COMPLETE_THRESHOLD + 5), -180, -140, 0],
        outputRange: [1, 0.85, 0, 0],
        extrapolate: 'clamp',
      })
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

  // Smooth background color & text transitions between Backlog/Pause and Delete.
  // Pause remains cleanly visible across 50-210dp before transitioning to Delete at 280dp.
  const containerBg = canReturn
    ? translateX.interpolate({
        inputRange: [0, 180, 255, DELETE_THRESHOLD + 5],
        outputRange: [c.secondaryContainer, c.secondaryContainer, c.errorContainer, c.errorContainer],
        extrapolate: 'clamp',
      })
    : c.errorContainer;

  const pauseOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 40, 210, 245],
        outputRange: [1, 1, 0.2, 0],
        extrapolate: 'clamp',
      })
    : 0;

  const deleteOpacity = canReturn
    ? translateX.interpolate({
        inputRange: [0, 190, 245, DELETE_THRESHOLD + 5],
        outputRange: [0, 0, 0.85, 1],
        extrapolate: 'clamp',
      })
    : 1;

  const deleteScale = canReturn
    ? translateX.interpolate({
        inputRange: [190, DELETE_THRESHOLD, DELETE_THRESHOLD + 40],
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
          const minX = leftTwoStep ? -MAX_SWIPE_LEFT_DEEP : canEdit || canComplete ? -MAX_SWIPE_LEFT : 0;
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

          if (leftTwoStep) setIsDeepLeft(clamped <= -COMPLETE_THRESHOLD);
        },
        onPanResponderRelease: (_e, g) => {
          const next = offset.current + g.dx;
          markSwipeEnded();
          setIsDeepSwipe(false);
          setIsDeepLeft(false);

          if (canReturn && (next >= DELETE_THRESHOLD || (next >= 230 && g.vx > 0.8))) {
            // Longer/deep swipe to the right triggers delete
            settle(0);
            confirmDelete();
          } else if (!canReturn && (next >= LATCH || (next >= 30 && g.vx > 0.4))) {
            // Backlog shelf swipe right deletes
            settle(0);
            confirmDelete();
          } else if (canReturn && (next >= LATCH || (next >= 30 && g.vx > 0.4))) {
            // Quick swipe to the right immediately activates pause / backlog
            settle(0);
            triggerReturn();
          } else if (leftTwoStep && (next <= -COMPLETE_THRESHOLD || (next <= -165 && g.vx < -0.8))) {
            // Deep swipe to the left, when Edit is also available, moves past
            // Edit to Complete (velocity rule mirrors the deep-right Delete).
            settle(0);
            confirmComplete();
          } else if (!canEdit && canComplete && (next <= -LATCH || (next <= -25 && g.vx < -0.4))) {
            // Nothing to edit: Complete is the single left-swipe step, the
            // same way Delete is Backlog's single right-swipe step.
            settle(0);
            confirmComplete();
          } else if (canEdit && (next <= -LATCH || (next <= -25 && g.vx < -0.4))) {
            // Quick swipe to the left immediately activates edit
            settle(0);
            handleEdit();
          } else {
            settle(0);
          }
        },
        onPanResponderTerminate: (_e, g) => {
          const next = offset.current + (g?.dx ?? 0);
          markSwipeEnded();
          setIsDeepSwipe(false);
          setIsDeepLeft(false);

          if (canReturn && next >= DELETE_THRESHOLD) {
            settle(0);
            confirmDelete();
          } else if (!canReturn && next >= LATCH) {
            settle(0);
            confirmDelete();
          } else if (leftTwoStep && next <= -COMPLETE_THRESHOLD) {
            settle(0);
            confirmComplete();
          } else if (!canEdit && canComplete && next <= -LATCH) {
            settle(0);
            confirmComplete();
          } else {
            settle(0);
          }
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
      markSwipeEnded,
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
                <View style={[styles.badge, styles.pauseBadge]}>
                  <Ionicons
                    name={resetting ? 'bookmark' : 'pause'}
                    size={18}
                    color={c.onSecondary}
                  />
                </View>
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
                <View style={[styles.badge, styles.deleteBadge]}>
                  <Ionicons name="trash" size={18} color={c.onError} />
                </View>
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
              <View style={[styles.badge, styles.deleteBadge]}>
                <Ionicons name="trash" size={18} color={c.onError} />
              </View>
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
                  {/* Icon first, label last: this pill is pinned to the right
                      edge (rightActionContent's alignItems: 'flex-end'), and a
                      left swipe uncovers it right edge first — so whichever
                      child is last in this row is what actually reads earliest,
                      with the smallest swipe. */}
                  <View style={[styles.badge, styles.editBadge]}>
                    <Ionicons name="create" size={18} color={c.onPrimary} />
                  </View>
                  <Text style={[styles.actionText, styles.editText]}>Edit</Text>
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
                  <View style={[styles.badge, styles.completeBadge]}>
                    <Ionicons name="checkmark-done" size={18} color={c.onTertiary} />
                  </View>
                  <Text style={[styles.actionText, styles.completeText]}>Complete</Text>
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
          onAdvance={unlessJustSwiped(onAdvance)!}
          onResume={unlessJustSwiped(onResume)!}
          onRename={onRename}
          onEditProgress={onEditProgress}
          onOpen={unlessJustSwiped(onOpen)}
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
      gap: 10,
      paddingLeft: 20,
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
      justifyContent: 'flex-end',
      gap: 8,
      paddingRight: 16,
    },
    badge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pauseBadge: {
      backgroundColor: c.secondary,
    },
    deleteBadge: {
      backgroundColor: c.error,
    },
    editBadge: {
      backgroundColor: c.primary,
    },
    completeBadge: {
      backgroundColor: c.tertiary,
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
      ...(Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as any) : {}),
    },
  });
}







