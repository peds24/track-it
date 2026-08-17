import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
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
  ongoing: false,
  paused: false,
  seasons: null,
  nextEntryStatus: 'unstarted',
  nextEntryTitle: 'Episode 2',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
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
  await render(
    <SwipeableTrackRow track={show} {...noop} onDelete={onDelete} onReturnToBacklog={() => {}} />,
  );

  await fireEvent.press(screen.getByLabelText('Delete Severance'));

  expect(alertSpy).toHaveBeenCalled();
  expect(onDelete).not.toHaveBeenCalled();
});
