import { FEEDBACK_EMAIL } from './feedback';

/**
 * The Done screen's feedback and data-sources copy (A25, A27), shared with
 * the iOS app through shared/fixtures/aboutText.json (I12). TMDB's notice is
 * a condition of its API terms: every platform shows it.
 */
export function aboutCopy() {
  return {
    feedbackTitle: 'Send feedback',
    feedbackIntro: 'Something broken, missing, or great? It opens in your mail app, addressed to the developer.',
    feedbackPlaceholder: 'Your feedback',
    noMailTitle: 'No mail app found',
    dataSourcesTitle: 'Data sources',
    dataSources: [
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      'Book and manga data from Google Books. Comic data from Metron.',
    ],
  };
}

/** When no mail app takes the `mailto:` draft. */
export function noMailMessage(): string {
  return `You can email your feedback to ${FEEDBACK_EMAIL}.`;
}

/** A27: which build this is, at the foot of the data-sources sheet. */
export function versionLine(name: string, version: string, platform: string): string {
  return `${name} v${version} · ${platform}`;
}
