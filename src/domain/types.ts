/** User-facing category chosen when adding a track (D10). */
export type Category = 'show' | 'movie' | 'book' | 'comic' | 'manga';

/** The unit a series is tracked in (D1). */
export type UnitLabel = 'episode' | 'issue' | 'volume';

/** What a single trackable entry is. */
export type EntryMediaType = UnitLabel | 'book' | 'movie';

/** Consumption mode — derived from EntryMediaType, never stored. */
export type Mode = 'watch' | 'read';

export type Status = 'unstarted' | 'in_progress' | 'done';

export type Shelf = 'currently' | 'backlog' | 'done';

export type SeriesMediaType = 'show' | 'comic' | 'manga';

export type Series = {
  id: string;
  title: string;
  mediaType: SeriesMediaType;
  unitLabel: UnitLabel;
  createdAt: string;
  /** A4: still being published, so it has no total and never reaches Done. */
  ongoing: boolean;
  /** A6: pulled into Backlog without touching any child's status (D3, D4). */
  paused: boolean;
  externalSource: string | null;
  externalId: string | null;
  /** A11: TMDB only. */
  seasons?: readonly SeasonBoundary[];
};

/**
 * A11: one TV season's episode count. Display metadata for the
 * season-segmented progress bar, populated only by TMDB — undefined for
 * every other category and for a series added before this existed. `Entry`
 * stays exactly as it is; this is never a new source of truth for progress
 * (D3 still holds).
 */
export type SeasonBoundary = { number: number; episodeCount: number };

export type Entry = {
  id: string;
  seriesId: string | null;
  title: string;
  ordinal: number | null;
  mediaType: EntryMediaType;
  status: Status;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  /**
   * A6: only meaningful for a standalone entry (seriesId null) — a series
   * pauses at the series row instead. A series child's own flag is unused.
   */
  paused: boolean;
  /**
   * A9: where a standalone book/movie's title came from, if it came from a
   * catalogue match rather than being typed by hand. A series child's own
   * columns are unused — its series row records this instead (mirrors `paused`
   * above).
   */
  externalSource: string | null;
  externalId: string | null;
};
