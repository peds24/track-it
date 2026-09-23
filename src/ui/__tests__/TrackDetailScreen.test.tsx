import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TrackDetailScreen from '../../../app/track/[kind]/[id]';
import { addTrack } from '@/data/addTrack';
import { migrate } from '@/db/schema';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

const params: { kind: string; id: string } = { kind: 'entry', id: '' };
const mockBack = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useLocalSearchParams: () => params,
    useRouter: () => ({ push: jest.fn(), back: mockBack }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
    Stack: { Screen: () => null },
  };
});

afterEach(() => jest.restoreAllMocks());

async function setup(metadata?: Parameters<typeof addTrack>[1]['metadata']) {
  const db = createMemoryDriver();
  await migrate(db);
  const created = await addTrack(
    db,
    {
      title: 'Dune',
      category: 'book',
      count: 1,
      match: metadata ? { id: 'gb1', title: 'Dune', category: 'book', count: 1 } : undefined,
      metadata,
    },
    '2026-09-01T12:00:00.000Z',
  );
  params.kind = created.kind;
  params.id = created.id;
  await render(
    <DatabaseContext.Provider value={db}>
      <TrackDetailScreen />
    </DatabaseContext.Provider>,
  );
  return db;
}

test('shows title, creator, cleaned description and stats', async () => {
  await setup({ coverUrl: 'https://x/d.jpg', creator: 'Frank Herbert', description: '<p>Spice &amp; sand.</p>', releaseYear: '1965' });

  await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
  expect(screen.getByText('By Frank Herbert')).toBeTruthy();
  expect(screen.getByText('Spice & sand.')).toBeTruthy();
  expect(screen.getByText('Added')).toBeTruthy();
  expect(screen.getByLabelText('Dune cover')).toBeTruthy();
});

test('a hand-typed track shows the placeholder cover and no creator line', async () => {
  await setup();
  await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
  expect(screen.getByTestId('cover-placeholder')).toBeTruthy();
  expect(screen.queryByText(/^By /)).toBeNull();
});

test('Complete confirms, then the screen reports it finished', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  await setup();
  await waitFor(() => expect(screen.getByText('Complete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Complete'));
  const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Complete')!.onPress!());

  await waitFor(() => expect(screen.getByText('Finished')).toBeTruthy());
});

test('a long description collapses behind Show more', async () => {
  await setup({ coverUrl: null, creator: null, description: 'word '.repeat(120), releaseYear: null });
  await waitFor(() => expect(screen.getByText('Show more')).toBeTruthy());
});
