import { formatScore, type RatingSummary, type Sentiment } from '@/domain/rating';
import type { Category } from '@/domain/types';

// The words of the Rate and Rankings screens and the rate prompt (A26),
// shared by the TS screens and (through shared/fixtures/rateText.json) the
// Iris iOS ones. No React imports.

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

export function sentimentLabel(sentiment: Sentiment): string {
  return SENTIMENT_LABEL[sentiment];
}

export function categoryPlural(category: Category): string {
  return CATEGORY_PLURAL[category];
}

export function existingRatingNote(existing: RatingSummary, category: Category): string {
  return `Currently ${formatScore(existing.score)} · #${existing.rank} of ${existing.outOf} ${CATEGORY_PLURAL[category]}. Rating it again replaces that.`;
}

export function rateFootnote(category: Category): string {
  return `You’ll compare it with other ${CATEGORY_PLURAL[category]} you’ve rated — by the same creator or in the same genre where possible — and its 1–10 score comes from where it lands.`;
}

export function questionFootnote(comparisons: number, sentiment: Sentiment, category: Category): string {
  return `Question ${comparisons + 1} · among the ${CATEGORY_PLURAL[category]} ${SENTIMENT_GROUP[sentiment]}`;
}

export function undoLabel(answered: number): string {
  return answered === 0 ? 'Change how I felt' : 'Undo last answer';
}

export function rankLine(rank: number, outOf: number, category: Category): string {
  return `#${rank} of ${outOf} ${CATEGORY_PLURAL[category]}`;
}

export function scoredLabel(score: number): string {
  return `Scored ${formatScore(score)} out of 10`;
}

export function seeYourLabel(category: Category): string {
  return `See your ${CATEGORY_PLURAL[category]}`;
}

export function notRatedYet(category: Category): string {
  return `Not rated yet. Rank it against the other ${CATEGORY_PLURAL[category]} you’ve finished.`;
}

export function rankingsEmpty(category: Category): { title: string; body: string } {
  return {
    title: `No ${CATEGORY_PLURAL[category]} ranked yet`,
    body: 'Finish something and tap Rate — you’ll compare it with the others you’ve rated, and its score comes from where it lands.',
  };
}

export function rankingRowLabel(rank: number, title: string, score: number): string {
  return `Number ${rank}, ${title}, ${formatScore(score)} out of 10`;
}

export function ratePrompt(title: string, category: Category): { title: string; message: string } {
  return { title: `Finished ${title}`, message: `Rank it against the other ${CATEGORY_PLURAL[category]} you’ve rated?` };
}
