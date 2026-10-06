import { fireEvent, render, screen } from '@testing-library/react-native';
import DoneScreen from '../../../app/(tabs)/done';
import { migrate } from '@/db/schema';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { createMemoryDriver } from '../../../test/memoryDriver';
import appConfig from '../../../app.json';

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

test('A27: the ? sheet names the app version and platform', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await render(
    <DatabaseContext.Provider value={db}>
      <DoneScreen />
    </DatabaseContext.Provider>,
  );

  await fireEvent.press(screen.getByLabelText('About the data on this screen'));

  expect(screen.getByText(new RegExp(`^Track It v${appConfig.expo.version.replace(/\./g, '\\.')} · (Android|iOS|Web)$`))).toBeTruthy();
});
