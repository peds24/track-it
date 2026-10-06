import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import RateScreen from '../../../app/rate/[kind]/[id]';
import { addTrack } from '@/data/addTrack';
import { listRanking, saveRating } from '@/data/ratingRepo';
import { completeTrack } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import type { SqlDriver } from '@/db/driver';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

const params: { kind: string; id: string } = { kind: 'entry', id: '' };
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => params,
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace }),
  Stack: { Screen: () => null },
}));

const T0 = '2026-10-01T12:00:00.000Z';

async function finishedMovie(db: SqlDriver, title: string, creator: string | null, genres: string[] = []) {
  const created = await addTrack(
    db,
    {
      title,
      category: 'movie',
      count: 1,
      match: { id: `tmdb-${title}`, title, category: 'movie', count: 1 },
      metadata: { coverUrl: null, creator, description: null, releaseYear: '2020', genres },
    },
    T0,
  );
  await completeTrack(db, created, T0);
  return { ...created, category: 'movie' as const };
}

async function renderFor(db: SqlDriver, track: { kind: string; id: string }) {
  params.kind = track.kind;
  params.id = track.id;
  await render(
    <DatabaseContext.Provider value={db}>
      <RateScreen />
    </DatabaseContext.Provider>,
  );
}

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('the first movie of a sentiment is placed without any questions', async () => {
  const db = await freshDb();
  const arrival = await finishedMovie(db, 'Arrival', 'Denis Villeneuve');
  await renderFor(db, arrival);

  await fireEvent.press(await screen.findByText('I liked it'));

  await waitFor(() => expect(screen.getByLabelText('Scored 8.5 out of 10')).toBeTruthy());
  expect(screen.getByText('#1 of 1 movies')).toBeTruthy();
  expect((await listRanking(db, 'movie')).map((r) => r.title)).toEqual(['Arrival']);
});

test('a new movie is compared against the most similar one and placed by the answer', async () => {
  const db = await freshDb();
  const heat = await finishedMovie(db, 'Heat', 'Michael Mann', ['Crime']);
  const sicario = await finishedMovie(db, 'Sicario', 'Denis Villeneuve', ['Crime', 'Thriller']);
  await saveRating(db, heat, 'liked', 0, T0);
  await saveRating(db, sicario, 'liked', 1, T0);
  const dune = await finishedMovie(db, 'Dune', 'Denis Villeneuve', ['Science Fiction']);
  await renderFor(db, dune);

  await fireEvent.press(await screen.findByText('I liked it'));

  // Two liked movies: the window is both, and the shared director wins.
  expect(await screen.findByText('Both by Denis Villeneuve')).toBeTruthy();
  expect(screen.getByLabelText('I preferred Sicario')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('I preferred Dune'));
  // Then it meets Heat, the one left above it.
  await fireEvent.press(await screen.findByLabelText('I preferred Heat'));

  await waitFor(() => expect(screen.getByText('#2 of 3 movies')).toBeTruthy());
  expect((await listRanking(db, 'movie')).map((r) => r.title)).toEqual(['Heat', 'Dune', 'Sicario']);
});

test('Too tough to call settles it just below the opponent', async () => {
  const db = await freshDb();
  const heat = await finishedMovie(db, 'Heat', 'Michael Mann');
  await saveRating(db, heat, 'fine', 0, T0);
  const dune = await finishedMovie(db, 'Dune', null);
  await renderFor(db, dune);

  await fireEvent.press(await screen.findByText('It was fine'));
  await fireEvent.press(await screen.findByText('Too tough to call'));

  await waitFor(() => expect(screen.getByText('#2 of 2 movies')).toBeTruthy());
});

test('Undo goes back a question, and backing out of the first question changes the feeling', async () => {
  const db = await freshDb();
  const heat = await finishedMovie(db, 'Heat', null);
  const sicario = await finishedMovie(db, 'Sicario', null);
  await saveRating(db, heat, 'liked', 0, T0);
  await saveRating(db, sicario, 'liked', 1, T0);
  const dune = await finishedMovie(db, 'Dune', null);
  await renderFor(db, dune);

  await fireEvent.press(await screen.findByText('I liked it'));
  await fireEvent.press(await screen.findByText('Change how I felt'));
  expect(await screen.findByText('How was it?')).toBeTruthy();
  expect(await listRanking(db, 'movie')).toHaveLength(2);
});

test('re-ranking says what it replaces', async () => {
  const db = await freshDb();
  const heat = await finishedMovie(db, 'Heat', null);
  await saveRating(db, heat, 'liked', 0, T0);
  await renderFor(db, heat);

  expect(await screen.findByText('Currently 8.5 · #1 of 1 movies. Rating it again replaces that.')).toBeTruthy();
  await fireEvent.press(screen.getByText('I didn’t like it'));
  await waitFor(() => expect(screen.getByLabelText('Scored 2.5 out of 10')).toBeTruthy());
});
