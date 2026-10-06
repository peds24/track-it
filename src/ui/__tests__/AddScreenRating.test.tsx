import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AddTrackScreen from '../../../app/add';
import { listTracks } from '@/data/trackRepo';
import { migrate } from '@/db/schema';
import * as alertBridge from '@/ui/alert';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useNavigation: () => ({ addListener: () => () => {} }),
}));

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [null, jest.fn()],
}));

afterEach(() => jest.restoreAllMocks());

test('A26: adding a movie straight to Watched asks to rate it', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  // No catalogue in tests: search fails quietly and the typed title is used.
  global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  const db = createMemoryDriver();
  await migrate(db);
  await render(
    <DatabaseContext.Provider value={db}>
      <AddTrackScreen />
    </DatabaseContext.Provider>,
  );

  await fireEvent.press(screen.getByText('Movie'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Arrival');
  await fireEvent.press(screen.getByText('Watched'));

  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Finished Arrival', 'Rank it against the other movies you’ve rated?', expect.any(Array)),
  );
  expect(mockBack).toHaveBeenCalled();
  const [movie] = await listTracks(db, 'done');
  const buttons = alertSpy.mock.calls.find((c) => c[0] === 'Finished Arrival')![2] as { text: string; onPress?: () => void }[];
  await act(async () => buttons.find((b) => b.text === 'Rate it')!.onPress!());
  expect(mockPush).toHaveBeenCalledWith(`/rate/entry/${movie!.id}`);
});

test('adding to the backlog never asks', async () => {
  const alertSpy = jest.spyOn(alertBridge, 'showAlert');
  global.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  const db = createMemoryDriver();
  await migrate(db);
  await render(
    <DatabaseContext.Provider value={db}>
      <AddTrackScreen />
    </DatabaseContext.Provider>,
  );

  await fireEvent.press(screen.getByText('Movie'));
  await fireEvent.changeText(screen.getByLabelText('Title'), 'Arrival');
  await fireEvent.press(screen.getByText('Add to backlog'));

  await waitFor(() => expect(mockBack).toHaveBeenCalled());
  expect(alertSpy).not.toHaveBeenCalledWith('Finished Arrival', expect.anything(), expect.anything());
});
