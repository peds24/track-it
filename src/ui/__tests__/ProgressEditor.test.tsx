import { fireEvent, render, screen } from '@testing-library/react-native';
import type { TrackSummary } from '@/data/trackRepo';
import { ProgressEditor } from '@/ui/ProgressEditor';

const show: TrackSummary = {
  kind: 'series',
  id: 's1',
  title: 'Severance',
  category: 'show',
  shelf: 'currently',
  createdAt: '2026-08-12T10:00:00.000Z',
  // 3 done means episode 4 is the one being watched.
  progress: { done: 3, total: 9 },
  nextEntryId: 'e4',
  nextEntryOrdinal: 4,
  entryCount: 9,
  ongoing: false,
  paused: false,
  seasons: null,
  nextEntryStatus: 'in_progress',
  nextEntryTitle: 'Episode 4',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
};

const HOUSE: TrackSummary = {
  ...show,
  title: 'House',
  // 60 done means episode 61 overall — season 3, episode 15.
  progress: { done: 60, total: 70 },
  nextEntryOrdinal: 61,
  entryCount: 70,
  seasons: [
    { number: 1, episodeCount: 22 },
    { number: 2, episodeCount: 24 },
    { number: 3, episodeCount: 24 },
  ],
};

const noop = () => {};

test('the editor names the track and seeds the field with where it already is', async () => {
  await render(<ProgressEditor track={show} onCancel={noop} onSubmit={noop} />);
  expect(screen.getByText('Edit track number')).toBeTruthy();
  expect(screen.getByText('Severance')).toBeTruthy();
  expect(screen.getByLabelText('Episode number').props.placeholder).toBe('4');
  expect(screen.getByText('of 9')).toBeTruthy();
});

test('saving a typed number reports it as a position', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={show} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '7');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).toHaveBeenCalledWith(show, 7);
});

test('saving does nothing while the field is empty — a placeholder is not an answer', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={show} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('saving does nothing for a number past the end of the series', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={show} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '10');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('saving does nothing for a number below the start of the series', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={show} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '0');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('cancelling reports no position at all', async () => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  await render(<ProgressEditor track={show} onCancel={onCancel} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '7');
  await fireEvent.press(screen.getByLabelText('Cancel'));
  expect(onCancel).toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('a comic asks for an issue, not an episode', async () => {
  const comic: TrackSummary = { ...show, title: 'Saga', category: 'comic' };
  await render(<ProgressEditor track={comic} onCancel={noop} onSubmit={noop} />);
  expect(screen.getByLabelText('Issue number')).toBeTruthy();
});

test('a show with seasons offers a season field alongside the episode field', async () => {
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={noop} />);
  expect(screen.getByLabelText('Season number').props.placeholder).toBe('3');
  expect(screen.getByLabelText('Episode number').props.placeholder).toBe('15');
  expect(screen.getByText('of 24')).toBeTruthy();
});

test('a season and episode save as the flat position they name', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Season number'), '2');
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '5');
  await fireEvent.press(screen.getByLabelText('Save position'));
  // Season 1 is 22 episodes, so S2 E5 is episode 27 overall.
  expect(onSubmit).toHaveBeenCalledWith(HOUSE, 27);
});

test('the episode total follows whichever season is typed in', async () => {
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={noop} />);
  await fireEvent.changeText(screen.getByLabelText('Season number'), '1');
  expect(screen.getByText('of 22')).toBeTruthy();
});

test('leaving the season alone saves against the season it already showed', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '2');
  await fireEvent.press(screen.getByLabelText('Save position'));
  // Still season 3: 46 episodes precede it, so E2 is episode 48 overall.
  expect(onSubmit).toHaveBeenCalledWith(HOUSE, 48);
});

test('saving does nothing for an episode that season does not have', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Season number'), '1');
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '23');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('saving does nothing for a season the show does not have', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={HOUSE} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Season number'), '9');
  await fireEvent.changeText(screen.getByLabelText('Episode number'), '1');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});

test('a closed editor renders nothing', async () => {
  await render(<ProgressEditor track={null} onCancel={noop} onSubmit={noop} />);
  expect(screen.queryByText('Edit track number')).toBeNull();
});

// A20: an ongoing series has no `progress` (it has no total to report), but
// the editor still needs to render for it against however many entries
// already exist — `entryCount`/`nextEntryOrdinal` carry that instead.
const ONGOING_MANGA: TrackSummary = {
  ...show,
  title: 'One Piece',
  category: 'manga',
  ongoing: true,
  progress: null,
  entryCount: 30,
  nextEntryOrdinal: 30,
  nextEntryTitle: 'Volume 30',
};

test('an ongoing track seeds the field from its current entry, against how many exist so far', async () => {
  await render(<ProgressEditor track={ONGOING_MANGA} onCancel={noop} onSubmit={noop} />);
  expect(screen.getByLabelText('Volume number').props.placeholder).toBe('30');
  expect(screen.getByText('of 30')).toBeTruthy();
});

test('saving a typed number for an ongoing track reports it as a position', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={ONGOING_MANGA} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Volume number'), '17');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).toHaveBeenCalledWith(ONGOING_MANGA, 17);
});

test('saving does nothing for an ongoing track past how many entries exist so far', async () => {
  const onSubmit = jest.fn();
  await render(<ProgressEditor track={ONGOING_MANGA} onCancel={noop} onSubmit={onSubmit} />);
  await fireEvent.changeText(screen.getByLabelText('Volume number'), '31');
  await fireEvent.press(screen.getByLabelText('Save position'));
  expect(onSubmit).not.toHaveBeenCalled();
});
