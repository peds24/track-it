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
  externalSource: string | null;
  externalId: string | null;
};

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
};
