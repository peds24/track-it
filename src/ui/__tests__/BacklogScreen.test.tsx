import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import BacklogScreen from '../../../app/(tabs)/backlog';
import { addTrack } from '@/data/addTrack';
import { migrate } from '@/db/schema';
import * as alertBridge from '@/ui/alert';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    useFocusEffect: (cb: () => void) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

afterEach(() => jest.restoreAllMocks());

test('A26: marking a backlog movie Watched asks to rate it, and Rate it opens the rate screen', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  const db = createMemoryDriver();
  await migrate(db);
  const created = await addTrack(db, { title: 'Arrival', category: 'movie', count: 1 }, '2026-10-01T12:00:00.000Z');
  await render(
    <DatabaseContext.Provider value={db}>
      <BacklogScreen />
    </DatabaseContext.Provider>,
  );

  await fireEvent.press(await screen.findByLabelText('Watched Arrival'));

  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Finished Arrival', 'Rank it against the other movies you’ve rated?', expect.any(Array)),
  );
  const buttons = alertSpy.mock.calls.find((c) => c[0] === 'Finished Arrival')![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Rate it')!.onPress!());
  expect(mockPush).toHaveBeenCalledWith(`/rate/entry/${created.id}`);
});

test('on web, the rate prompt goes through window.confirm and OK opens the rate screen', async () => {
  const originalPlatform = Platform.OS;
  Platform.OS = 'web';
  const confirmSpy = jest.fn().mockReturnValue(true);
  (window as unknown as { confirm: typeof confirmSpy }).confirm = confirmSpy;
  try {
    const db = createMemoryDriver();
    await migrate(db);
    const created = await addTrack(db, { title: 'Arrival', category: 'movie', count: 1 }, '2026-10-01T12:00:00.000Z');
    await render(
      <DatabaseContext.Provider value={db}>
        <BacklogScreen />
      </DatabaseContext.Provider>,
    );

    await fireEvent.press(await screen.findByLabelText('Watched Arrival'));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Finished Arrival')));
    expect(mockPush).toHaveBeenCalledWith(`/rate/entry/${created.id}`);
  } finally {
    Platform.OS = originalPlatform;
  }
});
