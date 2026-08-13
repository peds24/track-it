import { render, screen, fireEvent } from '@testing-library/react-native';
import { TrackRow } from '@/ui/TrackRow';
import type { TrackSummary } from '@/data/trackRepo';

const show: TrackSummary = {
  kind: 'series',
  id: 's1',
  title: 'Severance',
  category: 'show',
  shelf: 'currently',
  createdAt: '2026-08-12T10:00:00.000Z',
  progress: { done: 3, total: 9 },
  nextEntryId: 'e4',
  nextEntryTitle: 'Episode 4',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
};

test('a series row shows its title, next unit and progress', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} />);
  expect(screen.getByText('Severance')).toBeTruthy();
  expect(screen.getByText(/Episode 4/)).toBeTruthy();
  expect(screen.getByText(/3 of 9/)).toBeTruthy();
});

test('tapping advance reports the next entry id', async () => {
  const onAdvance = jest.fn();
  await render(<TrackRow track={show} onAdvance={onAdvance} />);
  await fireEvent.press(screen.getByLabelText('Mark Episode 4 watched'));
  expect(onAdvance).toHaveBeenCalledWith('e4');
});

test('a read-mode track uses read wording', async () => {
  const book: TrackSummary = {
    ...show,
    kind: 'entry',
    id: 'b1',
    title: 'Dune',
    category: 'book',
    progress: null,
    nextEntryId: 'b1',
    nextEntryTitle: 'Dune',
  };
  await render(<TrackRow track={book} onAdvance={() => {}} />);
  expect(screen.getByLabelText('Mark Dune read')).toBeTruthy();
});

/**
 * The `nextEntryId && nextEntryTitle` guard is the one branch keeping a finished
 * track from rendering a button whose tap would throw "already done". Asserting
 * the title still renders proves the button is absent, not the whole row.
 */
test('a track with nothing left to advance renders no advance button', async () => {
  const finished: TrackSummary = {
    ...show,
    kind: 'entry',
    id: 'b2',
    title: 'Dune',
    category: 'book',
    shelf: 'done',
    progress: null,
    nextEntryId: null,
    nextEntryTitle: null,
  };
  await render(<TrackRow track={finished} onAdvance={() => {}} />);
  expect(screen.getByText('Dune')).toBeTruthy();
  expect(screen.queryByLabelText(/^Mark /)).toBeNull();
});
