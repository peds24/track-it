import type { ReleaseNote } from '@/domain/whatsNew';

/** A27: what the first launch after each update says. Newest first. */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.4.0',
    title: 'What’s new in 1.4.0',
    items: [
      {
        heading: 'Rate what you finish',
        body: 'Say whether you liked it, then pick which you preferred against others you’ve rated — movies only against movies, books only against books. Its 1–10 score comes from where it lands.',
      },
      {
        heading: 'Tough matchups',
        body: 'You’re paired with the most similar things you’ve rated — same author or director, same genre — so the choices actually mean something.',
      },
      {
        heading: 'Your rankings',
        body: 'Tap the podium on the Done tab to see your ranked list for each category. Finished tracks show their score, or a Rate button.',
      },
      {
        heading: 'Read before you add',
        body: 'Long descriptions on the Add screen now expand with Show more.',
      },
    ],
  },
];
