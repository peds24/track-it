import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { addTrack } from '@/data/addTrack';
import { pendingAnnouncement } from '@/data/whatsNew';
import { migrate } from '@/db/schema';
import { DatabaseContext } from '@/ui/DatabaseProvider';
import { RELEASE_NOTES } from '@/ui/releaseNotes';
import { WhatsNew } from '@/ui/WhatsNew';
import { createMemoryDriver } from '../../../test/memoryDriver';
import appConfig from '../../../app.json';

test('the running version has release notes', () => {
  expect(RELEASE_NOTES.some((n) => n.version === appConfig.expo.version)).toBe(true);
});

test('shows once after an update, and Got it dismisses it for good', async () => {
  const db = createMemoryDriver();
  await migrate(db);
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, '2026-10-01T12:00:00.000Z');
  await render(
    <DatabaseContext.Provider value={db}>
      <WhatsNew version="1.4.0" />
    </DatabaseContext.Provider>,
  );

  expect(await screen.findByText('What’s new in 1.4.0')).toBeTruthy();
  expect(screen.getByText('Rate what you finish')).toBeTruthy();
  await fireEvent.press(screen.getByText('Got it'));

  await waitFor(async () => expect(await pendingAnnouncement(db, '1.4.0', RELEASE_NOTES)).toBeNull());
});
