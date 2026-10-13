import type { Category } from '@/domain/types';
import type { FixtureCase } from '../types';

// The Rate/Rankings/prompt copy from src/ui/rateText.ts. Inputs only.
const CATEGORIES: Category[] = ['show', 'movie', 'book', 'comic', 'manga'];
const SENTIMENTS = ['liked', 'fine', 'disliked'] as const;
const c = (fn: string, name: string, args: unknown[]): FixtureCase => ({ name: `${fn}: ${name}`, fn, args });
const summary = (score: number, rank: number, outOf: number) => ({ sentiment: 'liked', score, rank, outOf, category: 'movie' });

export const cases: FixtureCase[] = [
  ...SENTIMENTS.map((s) => c('sentimentLabel', s, [s])),
  ...CATEGORIES.flatMap((cat) => [
    c('categoryPlural', cat, [cat]),
    c('rateFootnote', cat, [cat]),
    c('seeYourLabel', cat, [cat]),
    c('notRatedYet', cat, [cat]),
    c('rankingsEmpty', cat, [cat]),
    c('rankLine', cat, [3, 12, cat]),
    c('ratePrompt', cat, ['Arrival', cat]),
    ...SENTIMENTS.map((s) => c('questionFootnote', `${cat} ${s}`, [1, s, cat])),
  ]),
  c('existingRatingNote', 'a top score', [summary(10, 1, 4), 'movie']),
  c('existingRatingNote', 'a score that rounds', [summary(8.45, 3, 12), 'book']),
  c('existingRatingNote', 'the bottom', [summary(0, 12, 12), 'manga']),
  c('undoLabel', 'no answers yet', [0]),
  c('undoLabel', 'one answer', [1]),
  c('undoLabel', 'several answers', [3]),
  c('questionFootnote', 'the first question', [0, 'liked', 'movie']),
  c('scoredLabel', 'ten', [10]),
  c('scoredLabel', 'a half', [7.25]),
  c('rankLine', 'one of one', [1, 1, 'show']),
  c('rankingRowLabel', 'plain', [3, 'Arrival', 8.4]),
  c('rankingRowLabel', 'an apostrophe and emoji', [1, 'Bob’s Burgers 🍔', 10]),
  c('ratePrompt', 'a long title', ['The Lord of the Rings: The Fellowship of the Ring (Extended Edition)', 'movie']),
];
