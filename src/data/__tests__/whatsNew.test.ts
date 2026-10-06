import { addTrack } from '@/data/addTrack';
import { markAnnounced, pendingAnnouncement } from '@/data/whatsNew';
import { migrate } from '@/db/schema';
import type { ReleaseNote } from '@/domain/whatsNew';
import { createMemoryDriver } from '../../../test/memoryDriver';

const NOTES: ReleaseNote[] = [{ version: '1.4.0', title: 'New', items: [] }];

async function freshDb() {
  const db = createMemoryDriver();
  await migrate(db);
  return db;
}

test('an existing library sees the note until it is dismissed', async () => {
  const db = await freshDb();
  await addTrack(db, { title: 'Dune', category: 'book', count: 1 }, '2026-10-01T12:00:00.000Z');

  expect((await pendingAnnouncement(db, '1.4.0', NOTES))?.title).toBe('New');
  expect((await pendingAnnouncement(db, '1.4.0', NOTES))?.title).toBe('New'); // not dismissed yet
  await markAnnounced(db, '1.4.0');
  expect(await pendingAnnouncement(db, '1.4.0', NOTES)).toBeNull();
});

test('a fresh install is recorded silently, then announces its next update', async () => {
  const db = await freshDb();
  expect(await pendingAnnouncement(db, '1.4.0', NOTES)).toBeNull();
  expect(await pendingAnnouncement(db, '1.5.0', [{ version: '1.5.0', title: 'Next', items: [] }])).toMatchObject({ title: 'Next' });
});
