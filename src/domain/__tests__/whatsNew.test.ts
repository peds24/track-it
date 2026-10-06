import { announcementFor, type ReleaseNote } from '@/domain/whatsNew';

const NOTES: ReleaseNote[] = [{ version: '1.4.0', title: 'New', items: [] }];

test('an upgrade from a build that never recorded a version announces', () => {
  expect(announcementFor('1.4.0', null, true, NOTES)?.version).toBe('1.4.0');
});

test('an upgrade from an older recorded version announces', () => {
  expect(announcementFor('1.4.0', '1.3.0', false, NOTES)?.version).toBe('1.4.0');
});

test('a fresh install, or the same version again, does not', () => {
  expect(announcementFor('1.4.0', null, false, NOTES)).toBeNull();
  expect(announcementFor('1.4.0', '1.4.0', true, NOTES)).toBeNull();
});

test('a version with no notes says nothing', () => {
  expect(announcementFor('1.4.1', '1.4.0', true, NOTES)).toBeNull();
});
