import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TrackDetailScreen from '../../../app/track/[kind]/[id]';
import { addTrack } from '@/data/addTrack';
import { migrate } from '@/db/schema';
import * as alertBridge from '@/ui/alert';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

const params: { kind: string; id: string } = { kind: 'entry', id: '' };
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useLocalSearchParams: () => params,
    useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace, canGoBack: () => mockCanGoBack }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
    // Renders only a custom headerLeft, so the web direct-load fallback is testable.
    Stack: { Screen: ({ options }: { options?: { headerLeft?: (p: object) => unknown } }) => options?.headerLeft?.({}) ?? null },
  };
});

afterEach(() => {
  jest.restoreAllMocks();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack = true;
});

async function setup(metadata?: Parameters<typeof addTrack>[1]['metadata']) {
  return setupWith({
    title: 'Dune',
    category: 'book',
    count: 1,
    match: metadata ? { id: 'gb1', title: 'Dune', category: 'book', count: 1 } : undefined,
    metadata,
  });
}

async function setupWith(input: Parameters<typeof addTrack>[1]) {
  const db = createMemoryDriver();
  await migrate(db);
  const created = await addTrack(db, input, '2026-09-01T12:00:00.000Z');
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
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
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

test('completing a series uses the same confirm copy as the row', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  await setupWith({ title: 'Berserk', category: 'manga', count: 3 });
  await waitFor(() => expect(screen.getByText('Complete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Complete'));

  expect(alertSpy).toHaveBeenCalledWith(
    'Mark Berserk complete?',
    'Every remaining unit is marked done. It moves to Done.',
    expect.any(Array),
  );
});

test('deleting a series warns that every unit under it goes too', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  await setupWith({ title: 'Berserk', category: 'manga', count: 3 });
  await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Delete'));

  expect(alertSpy).toHaveBeenCalledWith(
    'Delete Berserk?',
    'This removes the track and every episode, issue or volume under it. It cannot be undone.',
    expect.any(Array),
  );
});

test('deleting a standalone entry keeps the short warning', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  await setup();
  await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Delete'));

  expect(alertSpy).toHaveBeenCalledWith('Delete Dune?', 'This removes the track. It cannot be undone.', expect.any(Array));
});

test('a failed load shows the not-found state instead of an unhandled rejection', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  jest.spyOn(db, 'all').mockRejectedValue(new Error('disk I/O error'));
  params.kind = 'entry';
  params.id = 'whatever';
  await render(
    <DatabaseContext.Provider value={db}>
      <TrackDetailScreen />
    </DatabaseContext.Provider>,
  );

  await waitFor(() => expect(screen.getByText(/couldn’t be found/)).toBeTruthy());
});

// Web: Alert.alert is a no-op on react-native-web, so every confirm here goes
// through showAlert, which uses window.confirm in the browser.
test('on web, Complete confirms through window.confirm', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  const confirmSpy = jest.fn().mockReturnValue(true);
  (window as any).confirm = confirmSpy;
  try {
    await setup();
    await waitFor(() => expect(screen.getByText('Complete')).toBeTruthy());
    await act(async () => {
      await fireEvent.press(screen.getByText('Complete'));
    });
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Mark Dune complete?'));
    await waitFor(() => expect(screen.getByText('Finished')).toBeTruthy());
  } finally {
    Platform.OS = originalPlatform;
  }
});

// Web: a detail URL opened directly (a bookmark, a reload) has no history to
// go back to, so a delete lands on the tabs instead of a dead back().
test('deleting from a directly opened detail page returns to the tabs', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  mockCanGoBack = false;
  await setup();
  await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Delete'));
  const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  expect(mockBack).not.toHaveBeenCalled();
});

test('deleting after navigating in goes back as before', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  await setup();
  await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());

  await fireEvent.press(screen.getByText('Delete'));
  const buttons = alertSpy.mock.calls[0]![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Delete')!.onPress!());

  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(mockReplace).not.toHaveBeenCalled();
});

// Web: opened directly there is no history, so the header has no back arrow
// and the screen would be a dead end — it offers a way to the tabs instead.
test('a directly opened detail page offers a way back to the tabs', async () => {
  mockCanGoBack = false;
  await setup();
  await waitFor(() => expect(screen.getByLabelText('Go to your tracks')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Go to your tracks'));
  expect(mockReplace).toHaveBeenCalledWith('/');
});

test('a detail page reached by navigating in keeps the normal back arrow', async () => {
  await setup();
  await waitFor(() => expect(screen.getByText('Delete')).toBeTruthy());
  expect(screen.queryByLabelText('Go to your tracks')).toBeNull();
});
