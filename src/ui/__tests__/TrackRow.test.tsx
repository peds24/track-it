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
  ongoing: false,
  nextEntryStatus: 'unstarted',
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

/** The medium is a word, not a colour — every row names its kind (design language). */
test('a row names its medium in the meta line', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} />);
  expect(screen.getByText('SHOW')).toBeTruthy();
});

/**
 * The bar depicts a count, so it exists only where a count does. A standalone
 * book has nothing to be part-way through numerically — absence is the signal.
 */
test('a series draws a progress bar', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} />);
  expect(screen.getByTestId('progress-track')).toBeTruthy();
});

test('a standalone track draws no progress bar', async () => {
  const book: TrackSummary = {
    ...show,
    kind: 'entry',
    id: 'b1',
    title: 'Piranesi',
    category: 'book',
    progress: null,
    nextEntryId: 'b1',
    nextEntryTitle: 'Piranesi',
  };
  await render(<TrackRow track={book} onAdvance={() => {}} />);
  expect(screen.getByText('Piranesi')).toBeTruthy();
  expect(screen.queryByTestId('progress-track')).toBeNull();
});

/**
 * A completed series keeps its count but loses its bar. "How far in am I" is not
 * a question a finished track raises, and the Done shelf is deliberately
 * de-emphasised — a full-width accent bar on every row would make the least
 * important screen the most colourful one in the app.
 */
test('a finished series keeps its count but draws no progress bar', async () => {
  const finished: TrackSummary = {
    ...show,
    title: 'Chainsaw Man',
    category: 'manga',
    shelf: 'done',
    progress: { done: 11, total: 11 },
    nextEntryId: null,
    nextEntryTitle: null,
  };
  await render(<TrackRow track={finished} onAdvance={() => {}} />);
  expect(screen.getByText('11 of 11')).toBeTruthy();
  expect(screen.queryByTestId('progress-track')).toBeNull();
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

/**
 * "Next" and "Reading" are not interchangeable: a volume already in progress is
 * one you are part-way through, not one you are about to begin. Only read-mode
 * entries ever reach in_progress (D2).
 */
test('a series whose next entry is in progress reads "Reading", not "Next"', async () => {
  const manga: TrackSummary = {
    ...show,
    title: 'Berserk',
    category: 'manga',
    progress: { done: 0, total: 34 },
    nextEntryStatus: 'in_progress',
    nextEntryId: 'v1',
    nextEntryTitle: 'Volume 1',
  };
  await render(<TrackRow track={manga} onAdvance={() => {}} />);
  expect(screen.getByText('Reading Volume 1')).toBeTruthy();
});

test('a series whose next entry is unstarted reads "Next"', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} />);
  expect(screen.getByText('Next Episode 4')).toBeTruthy();
});

/**
 * A4: an ongoing series has no total, so it reports no fraction. The bar needs
 * one, and "absence is the signal" already means "nothing to measure".
 */
test('an ongoing series shows Ongoing and draws no progress bar', async () => {
  const ongoing: TrackSummary = {
    ...show,
    title: 'One Piece',
    category: 'manga',
    ongoing: true,
    progress: null,
    nextEntryStatus: 'unstarted',
    nextEntryId: 'v8',
    nextEntryTitle: 'Volume 8',
  };
  await render(<TrackRow track={ongoing} onAdvance={() => {}} />);
  expect(screen.getByText('Ongoing')).toBeTruthy();
  expect(screen.getByText('Next Volume 8')).toBeTruthy();
  expect(screen.queryByTestId('progress-track')).toBeNull();
});

test('a finite series still shows its count', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} />);
  expect(screen.getByText('3 of 9')).toBeTruthy();
  expect(screen.queryByText('Ongoing')).toBeNull();
});
