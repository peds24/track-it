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
  paused: false,
  seasons: null,
  nextEntryStatus: 'unstarted',
  nextEntryTitle: 'Episode 4',
  lastAdvancedAt: '2026-08-12T11:00:00.000Z',
};

const HOUSE_SEASONS = [
  { number: 1, episodeCount: 22 },
  { number: 2, episodeCount: 24 },
  { number: 3, episodeCount: 24 },
];

const houseWithSeasons: TrackSummary = {
  ...show,
  title: 'House',
  progress: { done: 37, total: 70 },
  seasons: HOUSE_SEASONS,
};

test('a series row shows its title, next unit and progress', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Severance')).toBeTruthy();
  expect(screen.getByText(/Episode 4/)).toBeTruthy();
  expect(screen.getByText(/3 of 9/)).toBeTruthy();
});

test('tapping advance reports the next entry id', async () => {
  const onAdvance = jest.fn();
  await render(<TrackRow track={show} onAdvance={onAdvance} onResume={() => {}} />);
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
  await render(<TrackRow track={book} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByLabelText('Mark Dune read')).toBeTruthy();
});

/** The medium is a word, not a colour — every row names its kind (design language). */
test('a row names its medium in the meta line', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('SHOW')).toBeTruthy();
});

/**
 * The bar depicts a count, so it exists only where a count does. A standalone
 * book has nothing to be part-way through numerically — absence is the signal.
 */
test('a series draws a progress bar', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
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
  await render(<TrackRow track={book} onAdvance={() => {}} onResume={() => {}} />);
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
  await render(<TrackRow track={finished} onAdvance={() => {}} onResume={() => {}} />);
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
  await render(<TrackRow track={finished} onAdvance={() => {}} onResume={() => {}} />);
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
  await render(<TrackRow track={manga} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Reading Volume 1')).toBeTruthy();
});

test('a watch-mode series whose next entry is unstarted reads "Watching"', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Watching Episode 4')).toBeTruthy();
});

test('a read-mode series whose next entry is unstarted reads "Next"', async () => {
  const manga: TrackSummary = {
    ...show,
    title: 'Berserk',
    category: 'manga',
    progress: { done: 0, total: 34 },
    nextEntryStatus: 'unstarted',
    nextEntryId: 'v1',
    nextEntryTitle: 'Volume 1',
  };
  await render(<TrackRow track={manga} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Next Volume 1')).toBeTruthy();
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
  await render(<TrackRow track={ongoing} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Ongoing')).toBeTruthy();
  expect(screen.getByText('Next Volume 8')).toBeTruthy();
  expect(screen.queryByTestId('progress-track')).toBeNull();
});

test('a finite series still shows its count', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('3 of 9')).toBeTruthy();
  expect(screen.queryByText('Ongoing')).toBeNull();
});

/**
 * "Done" on an untouched backlog row claims you finished something you never
 * began. The control starts the track instead, and says so.
 */
test('a backlog row offers Start, not Done', async () => {
  const backlogged: TrackSummary = {
    ...show,
    title: 'Piranesi',
    category: 'book',
    shelf: 'backlog',
    progress: null,
    nextEntryStatus: 'unstarted',
    nextEntryId: 'b1',
    nextEntryTitle: 'Piranesi',
  };
  await render(<TrackRow track={backlogged} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Start')).toBeTruthy();
  expect(screen.queryByText('Done')).toBeNull();
  expect(screen.getByLabelText('Start Piranesi')).toBeTruthy();
});

/**
 * A10: a movie still completes in one tap (D2) — "Start" implies a middle
 * state it never has, so its own backlog control says what tapping it
 * actually does. Category-aware, not mode-aware: a standalone book is still
 * genuinely two-tap and keeps "Start".
 */
test('a backlog movie offers Watched, not Start', async () => {
  const backloggedMovie: TrackSummary = {
    ...show,
    kind: 'entry',
    id: 'm1',
    title: 'Sicario',
    category: 'movie',
    shelf: 'backlog',
    progress: null,
    nextEntryStatus: 'unstarted',
    nextEntryId: 'm1',
    nextEntryTitle: 'Sicario',
  };
  await render(<TrackRow track={backloggedMovie} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Watched')).toBeTruthy();
  expect(screen.queryByText('Start')).toBeNull();
  expect(screen.getByLabelText('Watched Sicario')).toBeTruthy();
});

test('a track already under way keeps Done', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Done')).toBeTruthy();
  expect(screen.queryByText('Start')).toBeNull();
});

/**
 * A6: a paused track has progress, so "Not started" would misreport it and
 * "Start" would claim the count begins at zero. Resume is the only control
 * that both names the state correctly and cannot accidentally advance it.
 */
test('a paused track offers Resume, not Start, and reports where it was left', async () => {
  const paused: TrackSummary = {
    ...show,
    shelf: 'backlog',
    paused: true,
  };
  await render(<TrackRow track={paused} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Resume')).toBeTruthy();
  expect(screen.queryByText('Start')).toBeNull();
  expect(screen.getByText('Paused · Episode 4')).toBeTruthy();
  expect(screen.getByLabelText('Resume Severance')).toBeTruthy();
});

test('tapping Resume reports the track, not an entry id, and never calls onAdvance', async () => {
  const onAdvance = jest.fn();
  const onResume = jest.fn();
  const paused: TrackSummary = {
    ...show,
    shelf: 'backlog',
    paused: true,
  };
  await render(<TrackRow track={paused} onAdvance={onAdvance} onResume={onResume} />);
  await fireEvent.press(screen.getByLabelText('Resume Severance'));
  expect(onResume).toHaveBeenCalledWith(paused);
  expect(onAdvance).not.toHaveBeenCalled();
});

test('a paused standalone track reports Paused without repeating its own title', async () => {
  const paused: TrackSummary = {
    ...show,
    kind: 'entry',
    id: 'b1',
    title: 'Dune',
    category: 'book',
    shelf: 'backlog',
    paused: true,
    progress: null,
    nextEntryId: 'b1',
    nextEntryTitle: 'Dune',
  };
  await render(<TrackRow track={paused} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Paused')).toBeTruthy();
  expect(screen.queryByText('Paused · Dune')).toBeNull();
});

test('a show with season data shows the season-scoped label instead of "Next Episode"/"Watching"', async () => {
  // 37 done: season 1 (22) full, season 2 has 15 done — episode 16 of
  // season 2 is next.
  await render(<TrackRow track={houseWithSeasons} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('S2 Ep 16 of 24')).toBeTruthy();
  expect(screen.queryByText(/Watching/)).toBeNull();
  expect(screen.queryByText(/^Next /)).toBeNull();
});

test('a show with season data draws one segment per season', async () => {
  await render(<TrackRow track={houseWithSeasons} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getAllByTestId('progress-segment')).toHaveLength(3);
});

test('a show with no season data keeps the flat bar and the default "Watching" label', async () => {
  await render(<TrackRow track={show} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Watching Episode 4')).toBeTruthy();
  expect(screen.queryAllByTestId('progress-segment')).toHaveLength(0);
  expect(screen.getByTestId('progress-track')).toBeTruthy();
});

/**
 * A13: reverses the original A11 scoping. A paused show still has real
 * progress worth showing correctly — "Paused" alone (or the flat bar) hid
 * exactly the information a segmented bar exists to convey. Season
 * treatment now follows "is there real progress to show," not "is this
 * actively being watched right now."
 */
test('a paused show with season data keeps its segmented bar and shows "Paused · S# Ep# of #"', async () => {
  const paused: TrackSummary = {
    ...houseWithSeasons,
    shelf: 'backlog',
    paused: true,
  };
  await render(<TrackRow track={paused} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getAllByTestId('progress-segment')).toHaveLength(3);
  expect(screen.getByText('Paused · S2 Ep 16 of 24')).toBeTruthy();
});

test('a not-yet-started backlog show (unpaused) keeps the flat bar and "Not started"', async () => {
  const notStarted: TrackSummary = {
    ...houseWithSeasons,
    shelf: 'backlog',
    paused: false,
    progress: { done: 0, total: 176 },
  };
  await render(<TrackRow track={notStarted} onAdvance={() => {}} onResume={() => {}} />);
  expect(screen.getByText('Not started')).toBeTruthy();
  expect(screen.queryAllByTestId('progress-segment')).toHaveLength(0);
  expect(screen.queryByText(/^S\d/)).toBeNull();
});
