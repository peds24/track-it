import { getRating } from '@/data/ratingRepo';
import { getTrackDetail } from '@/data/trackRepo';
import type { SqlDriver } from '@/db/driver';
import { showAlert } from '@/ui/alert';
import type { Sentiment } from '@/domain/rating';
import type { Category } from '@/domain/types';
import type { Palette } from '@/ui/theme';

/** A26: what a ranking is "of" — "#3 of 12 movies". */
export const CATEGORY_PLURAL: Record<Category, string> = {
  show: 'shows',
  movie: 'movies',
  book: 'books',
  comic: 'comics',
  manga: 'manga',
};

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  liked: 'I liked it',
  fine: 'It was fine',
  disliked: 'I didn’t like it',
};

/** "Question 2 · among the movies you liked". */
export const SENTIMENT_GROUP: Record<Sentiment, string> = {
  liked: 'you liked',
  fine: 'that were fine',
  disliked: 'you didn’t like',
};

/** The score badge's fill and ink — strongest for liked, alarm for disliked. */
export function sentimentColors(c: Palette, sentiment: Sentiment): { bg: string; fg: string } {
  if (sentiment === 'liked') return { bg: c.primaryContainer, fg: c.onPrimaryContainer };
  if (sentiment === 'fine') return { bg: c.surfaceContainerHighest, fg: c.onSurface };
  return { bg: c.errorContainer, fg: c.onErrorContainer };
}

export function rateHref(track: { kind: 'series' | 'entry'; id: string }): `/rate/${string}` {
  return `/rate/${track.kind}/${track.id}`;
}

/**
 * A26: the moment a track is finished is the moment to rank it (Beli asks
 * right after a visit). Asked, not forced — Later leaves a Rate button on
 * the Done row and the detail screen.
 */
export function promptToRate(
  track: { kind: 'series' | 'entry'; id: string; title: string; category: Category },
  open: (href: `/rate/${string}`) => void,
): void {
  // Web: Alert.alert is a no-op in the browser; showAlert uses window.confirm.
  showAlert(`Finished ${track.title}`, `Rank it against the other ${CATEGORY_PLURAL[track.category]} you’ve rated?`, [
    { text: 'Later', style: 'cancel' },
    { text: 'Rate it', onPress: () => open(rateHref(track)) },
  ]);
}

/** A26: after an action that may have finished `track`, ask for a rating
 * if it is now Done and has none. Never throws — a failed check just skips
 * the question; the Rate button is still there. */
export async function offerRatingIfFinished(
  db: SqlDriver,
  track: { kind: 'series' | 'entry'; id: string; title: string; category: Category },
  open: (href: `/rate/${string}`) => void,
): Promise<void> {
  try {
    const detail = await getTrackDetail(db, track.kind, track.id);
    if (detail?.summary.shelf !== 'done' || (await getRating(db, track))) return;
    promptToRate(track, open);
  } catch {
    // Nothing to do: the prompt is a convenience.
  }
}
