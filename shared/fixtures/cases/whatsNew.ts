import type { FixtureCase } from '../types';

const NOTES = [{ version: '1.4.0', title: 'New', items: [] }];

export const cases: FixtureCase[] = [
  { name: 'an upgrade from a build that never recorded a version announces', fn: 'announcementFor', args: ['1.4.0', null, true, NOTES] },
  { name: 'an upgrade from an older recorded version announces', fn: 'announcementFor', args: ['1.4.0', '1.3.0', false, NOTES] },
  { name: 'a fresh install, or the same version again, does not', fn: 'announcementFor', args: ['1.4.0', null, false, NOTES] },
  { name: 'a fresh install, or the same version again, does not (2)', fn: 'announcementFor', args: ['1.4.0', '1.4.0', true, NOTES] },
  { name: 'a version with no notes says nothing', fn: 'announcementFor', args: ['1.4.1', '1.4.0', true, NOTES] },
];
