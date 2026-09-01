import { Alert, Animated, Platform } from 'react-native';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import type { TrackSummary } from '@/data/trackRepo';

const show: TrackSummary = {
  kind: 'series',
  id: 's1',
  title: 'Severance',
  category: 'show',
  shelf: 'currently',
  createdAt: '2026-08-12T10:00:00.000Z',
  progress: { done: 1, total: 4 },
  nextEntryId: 'e2',
  nextEntryOrdinal: 2,
  entryCount: 4,
  ongoing: false,
  paused: false,
  seasons: null,
  nextEntryStatus: 'unstarted',
  nextEntryTitle: 'Episode 2',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
};

const noop = { onAdvance: () => {}, onResume: () => {}, onRename: () => {}, onDelete: () => {} };

let touchTime = 1000;
function makeTouchEvent(dx: number, dy: number) {
  touchTime += 50;
  return {
    nativeEvent: { touches: [{ pageX: 100 + dx, pageY: 100 + dy }] },
    touchHistory: {
      touchBank: [
        {
          touchActive: true,
          startPageX: 100,
          startPageY: 100,
          startTimeStamp: 1000,
          currentPageX: 100 + dx,
          currentPageY: 100 + dy,
          currentTimeStamp: touchTime,
          previousPageX: 100,
          previousPageY: 100,
          previousTimeStamp: touchTime - 50,
        },
      ],
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: touchTime,
    },
  };
}

/**
 * A6: pausing a track that is still going is reversible — Resume undoes it —
 * so it must act immediately on tap, with no confirmation in the way.
 */
test('a currently-shelf row pauses immediately with no confirmation', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onReturnToBacklog = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={onReturnToBacklog} />,
  );

  await fireEvent.press(screen.getByLabelText('Pause Severance'));

  expect(onReturnToBacklog).toHaveBeenCalledWith(show);
  expect(alertSpy).not.toHaveBeenCalled();
});

/**
 * A finished track has nothing left to resume, so returning it to the backlog
 * is still the old D4 reset — irreversible, and still worth a confirmation.
 */
test('a done-shelf row still confirms before resetting', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onReturnToBacklog = jest.fn();
  const finished: TrackSummary = { ...show, shelf: 'done', nextEntryId: null, nextEntryTitle: null };
  await render(
    <SwipeableTrackRow track={finished} {...noop} onReturnToBacklog={onReturnToBacklog} />,
  );

  await fireEvent.press(screen.getByLabelText('Move Severance to the backlog'));

  expect(alertSpy).toHaveBeenCalled();
  expect(onReturnToBacklog).not.toHaveBeenCalled();
});

test('a backlog row reveals no return action at all', async () => {
  const backlogged: TrackSummary = { ...show, shelf: 'backlog' };
  await render(
    <SwipeableTrackRow track={backlogged} {...noop} onReturnToBacklog={() => {}} />,
  );

  expect(screen.queryByLabelText(/Pause /)).toBeNull();
  expect(screen.queryByLabelText(/Move .* to the backlog/)).toBeNull();
});

test('delete always confirms, regardless of shelf', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onDelete = jest.fn();
  const backlogged: TrackSummary = { ...show, shelf: 'backlog' };
  await render(
    <SwipeableTrackRow track={backlogged} {...noop} onDelete={onDelete} onReturnToBacklog={() => {}} />,
  );

  await fireEvent.press(screen.getByLabelText('Delete Severance'));

  expect(alertSpy).toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();
});

test('swiping left reveals the edit action and triggers onEditProgress', async () => {
  const onEditProgress = jest.fn();
  await render(
    <SwipeableTrackRow
      track={show}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  await fireEvent.press(screen.getByLabelText('Edit Severance progress'));

  expect(onEditProgress).toHaveBeenCalledWith(show);
});

// A18: the row's own gesture, forwarded rather than handled here — the editor
// is rendered once by the screen, not once per row.
test('holding the advance control forwards the track to the progress editor', async () => {
  const onEditProgress = jest.fn();
  await render(
    <SwipeableTrackRow
      track={show}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  await fireEvent(screen.getByLabelText('Mark Episode 2 watched'), 'longPress');

  expect(onEditProgress).toHaveBeenCalledWith(show);
});

// A19: a paused backlog track still has real progress worth correcting, the
// same as a Currently one — see TrackRow.test.tsx for the matching case.
test('swiping left on a paused backlog row also reveals the edit action', async () => {
  const onEditProgress = jest.fn();
  const pausedBacklog: TrackSummary = { ...show, shelf: 'backlog', paused: true };
  await render(
    <SwipeableTrackRow
      track={pausedBacklog}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  await fireEvent.press(screen.getByLabelText('Edit Severance progress'));

  expect(onEditProgress).toHaveBeenCalledWith(pausedBacklog);
});

test('a not-yet-started backlog row reveals no edit action — there is no position to correct yet', async () => {
  const onEditProgress = jest.fn();
  const backlogged: TrackSummary = { ...show, shelf: 'backlog' };
  await render(
    <SwipeableTrackRow
      track={backlogged}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  expect(screen.queryByLabelText(/Edit .* progress/)).toBeNull();
});

// A20: same rule as TrackRow.test.tsx — an ongoing series with real, already-
// existing progress is just as correctable as a finite one.
test('swiping left on an ongoing series with real progress also reveals the edit action', async () => {
  const onEditProgress = jest.fn();
  const ongoing: TrackSummary = {
    ...show,
    ongoing: true,
    progress: null,
    entryCount: 5,
    nextEntryOrdinal: 5,
  };
  await render(
    <SwipeableTrackRow
      track={ongoing}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  await fireEvent.press(screen.getByLabelText('Edit Severance progress'));

  expect(onEditProgress).toHaveBeenCalledWith(ongoing);
});

test('an ongoing series with only its first entry reveals no edit action', async () => {
  const onEditProgress = jest.fn();
  const freshOngoing: TrackSummary = {
    ...show,
    ongoing: true,
    progress: null,
    entryCount: 1,
    nextEntryOrdinal: 1,
  };
  await render(
    <SwipeableTrackRow
      track={freshOngoing}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );

  expect(screen.queryByLabelText(/Edit .* progress/)).toBeNull();
});

test('gesture handler ignores predominantly vertical scroll movements', async () => {
  await render(
    <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={() => {}} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  // Vertical scroll: dx=10, dy=30
  const vertEvent = makeTouchEvent(10, 30);
  panSurface.props.onMoveShouldSetResponderCapture(vertEvent);
  expect(panSurface.props.onMoveShouldSetResponder(vertEvent)).toBe(false);
  await act(async () => {
    panSurface.props.onResponderRelease({ nativeEvent: {} });
  });

  // Slight diagonal jitter during vertical scroll: dx=12, dy=10 (dx not > 2 * dy)
  const jitterEvent = makeTouchEvent(12, 10);
  panSurface.props.onMoveShouldSetResponderCapture(jitterEvent);
  expect(panSurface.props.onMoveShouldSetResponder(jitterEvent)).toBe(false);
  await act(async () => {
    panSurface.props.onResponderRelease({ nativeEvent: {} });
  });

  // Clear horizontal swipe: dx=25, dy=4
  const horizEvent = makeTouchEvent(25, 4);
  panSurface.props.onMoveShouldSetResponderCapture(horizEvent);
  expect(panSurface.props.onMoveShouldSetResponder(horizEvent)).toBe(true);
});

test('gesture handler rejects responder termination to prevent scroll hijack during swipe', async () => {
  await render(
    <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={() => {}} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  expect(panSurface.props.onResponderTerminationRequest()).toBe(false);
});

test('deep right swipe past delete threshold triggers delete confirmation on release', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onDelete = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onDelete={onDelete} onReturnToBacklog={() => {}} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const horizEvent = makeTouchEvent(295, 0);
  panSurface.props.onMoveShouldSetResponderCapture(horizEvent);
  await act(async () => {
    panSurface.props.onResponderRelease(horizEvent);
  });

  expect(alertSpy).toHaveBeenCalledWith(
    'Delete Severance?',
    expect.stringContaining('This removes the track'),
    expect.any(Array),
    expect.any(Object),
  );
});

test('deep right swipe past delete threshold triggers delete confirmation even if terminated by OS', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onDelete = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onDelete={onDelete} onReturnToBacklog={() => {}} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const horizEvent = makeTouchEvent(295, 0);
  panSurface.props.onMoveShouldSetResponderCapture(horizEvent);
  await act(async () => {
    panSurface.props.onResponderTerminate(horizEvent);
  });

  expect(alertSpy).toHaveBeenCalledWith(
    'Delete Severance?',
    expect.stringContaining('This removes the track'),
    expect.any(Array),
    expect.any(Object),
  );
});

test('on web platform, swiping to delete invokes window.confirm and calls onDelete when confirmed', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  if (typeof window === 'undefined') {
    (global as any).window = {};
  }
  const confirmSpy = jest.fn().mockReturnValue(true);
  (window as any).confirm = confirmSpy;

  const onDelete = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onDelete={onDelete} onReturnToBacklog={() => {}} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const horizEvent = makeTouchEvent(295, 0);
  panSurface.props.onMoveShouldSetResponderCapture(horizEvent);
  await act(async () => {
    panSurface.props.onResponderRelease(horizEvent);
  });

  expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Delete Severance?'));
  expect(onDelete).toHaveBeenCalledWith(show);

  Platform.OS = originalPlatform;
});

test('swiping left past latch triggers onEditProgress', async () => {
  const onEditProgress = jest.fn();
  await render(
    <SwipeableTrackRow
      track={show}
      {...noop}
      onReturnToBacklog={() => {}}
      onEditProgress={onEditProgress}
    />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const leftSwipeEvent = makeTouchEvent(-60, 0);
  panSurface.props.onMoveShouldSetResponderCapture(leftSwipeEvent);
  await act(async () => {
    panSurface.props.onResponderRelease(leftSwipeEvent);
  });

  expect(onEditProgress).toHaveBeenCalledWith(show);
});

test('sub-threshold right drag below 50dp springs back without triggering pause', async () => {
  const onReturnToBacklog = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={onReturnToBacklog} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const smallEvent = makeTouchEvent(25, 0);
  panSurface.props.onMoveShouldSetResponderCapture(smallEvent);
  await act(async () => {
    panSurface.props.onResponderRelease(smallEvent);
  });

  expect(onReturnToBacklog).not.toHaveBeenCalled();
});

test('deliberate right drag >= 50dp triggers pause / move to backlog', async () => {
  const onReturnToBacklog = jest.fn();
  await render(
    <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={onReturnToBacklog} />,
  );
  const panSurface = screen.getByTestId('swipeable-surface');

  const pauseEvent = makeTouchEvent(80, 0);
  panSurface.props.onMoveShouldSetResponderCapture(pauseEvent);
  await act(async () => {
    panSurface.props.onResponderRelease(pauseEvent);
  });

  expect(onReturnToBacklog).toHaveBeenCalledWith(show);
});


