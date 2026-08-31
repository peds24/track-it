import { render, screen, waitFor } from '@testing-library/react-native';
import CurrentlyScreen from '../../../app/(tabs)/index';
import { addTrack } from '@/data/addTrack';
import { advanceEntry, listTracks } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

async function setupDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('Currently screen renders empty state when no tracks exist', async () => {
  const db = await setupDb();
  render(
    <DatabaseContext.Provider value={db}>
      <CurrentlyScreen />
    </DatabaseContext.Provider>,
  );

  await waitFor(() => {
    expect(screen.getByText('Nothing on the go')).toBeTruthy();
  });
});

test('Currently screen groups active tracks by category in the Add page order', async () => {
  const db = await setupDb();
  const now = '2026-08-12T10:00:00.000Z';

  // Add a book, a show, and a manga
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, now);
  await addTrack(db, { title: 'Severance', category: 'show', count: 9 }, now);
  await addTrack(db, { title: 'Berserk', category: 'manga', count: 10 }, now);

  // Advance them to 'currently'
  const allBacklog = await listTracks(db, 'backlog');
  for (const t of allBacklog) {
    if (t.nextEntryId) {
      await advanceEntry(db, t.nextEntryId, now);
    }
  }

  render(
    <DatabaseContext.Provider value={db}>
      <CurrentlyScreen />
    </DatabaseContext.Provider>,
  );

  await waitFor(() => {
    expect(screen.getByText('Shows')).toBeTruthy();
    expect(screen.getByText('Books')).toBeTruthy();
    expect(screen.getByText('Manga')).toBeTruthy();
    expect(screen.getByText('Severance')).toBeTruthy();
    expect(screen.getByText('Dune')).toBeTruthy();
    expect(screen.getByText('Berserk')).toBeTruthy();
  });
});

test('advancing a track moves it to the top within its category group', async () => {
  const db = await setupDb();
  const t0 = '2026-08-12T10:00:00.000Z';
  const t1 = '2026-08-12T11:00:00.000Z';
  const t2 = '2026-08-12T12:00:00.000Z';

  // Add two shows
  await addTrack(db, { title: 'Severance', category: 'show', count: 9 }, t0);
  await addTrack(db, { title: 'Silo', category: 'show', count: 10 }, t0);

  // Advance both to currently
  const [sev, silo] = await listTracks(db, 'backlog');
  await advanceEntry(db, sev!.nextEntryId!, t1);
  await advanceEntry(db, silo!.nextEntryId!, t2);

  // Silo was advanced at t2, so it should come before Severance
  const initial = await listTracks(db, 'currently', 'show');
  expect(initial.map((t) => t.title)).toEqual(['Silo', 'Severance']);

  // Advance Severance at t3 (later than t2)
  const t3 = '2026-08-12T13:00:00.000Z';
  const updatedSev = initial.find((t) => t.title === 'Severance')!;
  await advanceEntry(db, updatedSev.nextEntryId!, t3);

  // Now Severance is first within Shows
  const afterAdvance = await listTracks(db, 'currently', 'show');
  expect(afterAdvance.map((t) => t.title)).toEqual(['Severance', 'Silo']);
});

