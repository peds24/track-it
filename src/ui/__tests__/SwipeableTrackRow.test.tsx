import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { SwipeableTrackRow } from '@/ui/SwipeableTrackRow';
import type { TrackSummary } from '@/data/trackRepo';

afterEach(() => jest.restoreAllMocks());

const show: TrackSummary = {
  kind: 'series',
  id: 's1',
  title: 'Severance',
  category: 'show',
  shelf: 'currently',
  createdAt: '2026-08-12T10:00:00.000Z',
  progress: { done: 1, total: 4 },
  nextEntryId: 'e2',
  ongoing: false,
  paused: false,
  seasons: null,
  nextEntryStatus: 'unstarted',
  nextEntryTitle: 'Episode 2',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
  completionDrops: null,
};

const noop = { onAdvance: () => {}, onResume: () => {}, onRename: () => {}, onDelete: () => {} };

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

// A12: the row's own gesture, forwarded rather than handled here — the editor
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

async function releaseAt(dx: number) {
  const surface = screen.getByTestId('swipeable-surface');
  const event = makeTouchEvent(dx, 0);
  surface.props.onMoveShouldSetResponderCapture(event);
  await act(async () => {
    surface.props.onResponderRelease(event);
  });
}

describe('A23: complete from the right-hand side', () => {
  test('pressing Complete confirms first, then completes', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onComplete = jest.fn();
    await render(<SwipeableTrackRow track={show} {...noop} onReturnToBacklog={() => {}} onComplete={onComplete} />);

    await fireEvent.press(screen.getByLabelText('Complete Severance'));

    expect(alertSpy).toHaveBeenCalledWith('Mark Severance complete?', expect.any(String), expect.any(Array), expect.any(Object));
    expect(onComplete).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Complete')!.onPress!());
    expect(onComplete).toHaveBeenCalledWith(show);
  });

  test('an ongoing series names the unit completing will remove', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const saga: TrackSummary = { ...show, title: 'Saga', category: 'comic', ongoing: true, progress: null, completionDrops: 'Issue 13' };
    await render(<SwipeableTrackRow track={saga} {...noop} onReturnToBacklog={() => {}} onComplete={() => {}} />);

    await fireEvent.press(screen.getByLabelText('Complete Saga'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Mark Saga complete?',
      expect.stringContaining("Issue 13 isn't marked done, so it's removed"),
      expect.any(Array),
      expect.any(Object),
    );
  });

  test('a short left swipe still edits when both actions are available', async () => {
    const onEditProgress = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');
    await render(
      <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={() => {}} onEditProgress={onEditProgress} onComplete={() => {}} />,
    );
    await releaseAt(-60);
    expect(onEditProgress).toHaveBeenCalledWith(show);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('a deep left swipe asks to complete instead of editing', async () => {
    const onEditProgress = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');
    await render(
      <SwipeableTrackRow track={show} {...noop} onReturnToBacklog={() => {}} onEditProgress={onEditProgress} onComplete={() => {}} />,
    );
    await releaseAt(-200);
    expect(onEditProgress).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Mark Severance complete?', expect.any(String), expect.any(Array), expect.any(Object));
  });

  test('with nothing to edit, a short left swipe goes straight to complete', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const movie: TrackSummary = { ...show, kind: 'entry', title: 'Arrival', category: 'movie', progress: null, nextEntryTitle: 'Arrival' };
    await render(<SwipeableTrackRow track={movie} {...noop} onReturnToBacklog={() => {}} onComplete={() => {}} />);
    expect(screen.queryByLabelText(/Edit .* progress/)).toBeNull();
    await releaseAt(-60);
    expect(alertSpy).toHaveBeenCalledWith('Mark Arrival complete?', expect.any(String), expect.any(Array), expect.any(Object));
  });

  test('a finished track offers no Complete action', async () => {
    const finished: TrackSummary = { ...show, shelf: 'done', nextEntryId: null, nextEntryTitle: null };
    await render(<SwipeableTrackRow track={finished} {...noop} onReturnToBacklog={() => {}} onComplete={() => {}} />);
    expect(screen.queryByLabelText('Complete Severance')).toBeNull();
  });
});

