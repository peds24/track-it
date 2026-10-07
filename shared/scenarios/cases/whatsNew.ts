import type { Scenario } from '../types';

const NOTES = [{ version: '1.4.0', title: 'New', items: [] }];

/** The library row is seeded with raw SQL rather than addTrack, so this area
 * replays in Swift before addTrack is ported (Task 5 before Task 6). */
const SEED_BOOK = {
  call: 'sql',
  args: ["INSERT INTO entry (id, series_id, title, ordinal, media_type, status, created_at) VALUES ('book-1', NULL, 'Dune', NULL, 'book', 'unstarted', '2026-10-01T12:00:00.000Z')"],
};

export const scenarios: Scenario[] = [
  {
    name: 'an existing library sees the note until it is dismissed',
    steps: [
      SEED_BOOK,
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'markAnnounced', args: ['1.4.0'] },
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
    ],
  },
  {
    name: 'a fresh install is recorded silently, then announces its next update',
    steps: [
      { call: 'pendingAnnouncement', args: ['1.4.0', NOTES] },
      { call: 'query', args: ['SELECT key, value FROM app_meta'] },
      { call: 'pendingAnnouncement', args: ['1.5.0', [{ version: '1.5.0', title: 'Next', items: [] }]] },
    ],
  },
];
