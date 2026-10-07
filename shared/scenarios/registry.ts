import { addTrack } from '@/data/addTrack';
import { exportLibrary, importLibrary } from '@/data/backup';
import * as ratings from '@/data/ratingRepo';
import * as tracks from '@/data/trackRepo';
import { markAnnounced, pendingAnnouncement } from '@/data/whatsNew';
import type { SqlDriver } from '@/db/driver';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Call = (db: SqlDriver, ...args: any[]) => Promise<unknown>;
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** Every repository call a scenario may make. Swift's runner mirrors this table. */
export const scenarioCalls: Record<string, Call> = {
  addTrack: (db, input, now) => addTrack(db, input, now),
  createSeriesTrack: (db, draft, now, startAt) => tracks.createSeriesTrack(db, draft, now, opt(startAt)),
  createStandaloneTrack: (db, input, now) => tracks.createStandaloneTrack(db, input, now),
  firstEntryOf: (db, track) => tracks.firstEntryOf(db, track),
  listTracks: (db, shelf, category) => tracks.listTracks(db, shelf, opt(category)),
  getTrackDetail: (db, kind, id) => tracks.getTrackDetail(db, kind, id),
  advanceEntry: (db, entryId, now) => tracks.advanceEntry(db, entryId, now),
  deleteTrack: (db, track) => tracks.deleteTrack(db, track),
  renameTrack: (db, track, title) => tracks.renameTrack(db, track, title),
  returnTrackToBacklog: (db, track) => tracks.returnTrackToBacklog(db, track),
  resumeTrack: (db, track) => tracks.resumeTrack(db, track),
  setTrackPosition: (db, seriesId, target, now) => tracks.setTrackPosition(db, seriesId, target, now),
  completeTrack: (db, track, now) => tracks.completeTrack(db, track, now),
  listRanking: (db, category) => ratings.listRanking(db, category),
  ratingProfileOf: (db, track) => ratings.ratingProfileOf(db, track),
  getRating: (db, track) => ratings.getRating(db, track),
  // A Map: recorded as an object in insertion order.
  allScores: async (db) => Object.fromEntries(await ratings.allScores(db)),
  saveRating: (db, track, sentiment, index, now) => ratings.saveRating(db, track, sentiment, index, now),
  removeRating: (db, track) => ratings.removeRating(db, track),
  markAnnounced: (db, version) => markAnnounced(db, version),
  pendingAnnouncement: (db, version, notes) => pendingAnnouncement(db, version, notes),
  // Recorded as parsed JSON so ids inside can be normalised; key order is irrelevant.
  exportLibrary: async (db) => JSON.parse(await exportLibrary(db)),
  // A JSON syntax error's text is V8's own; both platforms report this instead.
  importLibrary: async (db, json: string) => {
    try {
      JSON.parse(json);
    } catch {
      throw new Error('Backup is not valid JSON');
    }
    return importLibrary(db, json);
  },
  // The raw SQL the TS tests use for setup and inspection. An SQLite error's
  // message is sqlite3_errmsg on both platforms.
  sql: (db, sql: string, params) => db.run(sql, opt(params) ?? []),
  query: (db, sql: string, params) => db.all(sql, opt(params) ?? []),
};
