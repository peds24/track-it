/**
 * A27: an update announces itself once, on the first launch after it lands.
 * Pure: the caller supplies the version it is running, the last version it
 * announced (null when it never has), whether the library has anything in
 * it, and the notes it knows about.
 */
export type ReleaseNote = {
  version: string;
  title: string;
  items: readonly { heading: string; body: string }[];
};

/**
 * The note to show, or null. Never on a fresh install — someone who has
 * just installed the app has nothing to compare against — and never twice
 * for the same version. An upgrade from a build that predates this (no
 * stored version, but tracks in the library) does announce.
 */
export function announcementFor(
  current: string,
  lastSeen: string | null,
  hasLibrary: boolean,
  notes: readonly ReleaseNote[],
): ReleaseNote | null {
  if (lastSeen === current) return null;
  if (lastSeen === null && !hasLibrary) return null;
  return notes.find((n) => n.version === current) ?? null;
}
