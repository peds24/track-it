import { aboutCopy, noMailMessage, versionLine } from '@/ui/aboutText';
import { FEEDBACK_EMAIL } from '@/ui/feedback';

// I12: the Done screen's feedback and data-sources copy, shared with iOS.
test('the copy Android shows today', () => {
  expect(aboutCopy()).toEqual({
    feedbackTitle: 'Send feedback',
    feedbackIntro: 'Something broken, missing, or great? It opens in your mail app, addressed to the developer.',
    feedbackPlaceholder: 'Your feedback',
    noMailTitle: 'No mail app found',
    dataSourcesTitle: 'Data sources',
    dataSources: [
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      'Book and manga data from Google Books. Comic data from Metron.',
    ],
  });
});

test('no mail app points at the address', () => {
  expect(noMailMessage()).toBe(`You can email your feedback to ${FEEDBACK_EMAIL}.`);
});

test('the version line names the app, version and platform', () => {
  expect(versionLine('Track It', '1.3.0', 'Android')).toBe('Track It v1.3.0 · Android');
  expect(versionLine('Iris', '2.0.0', 'iOS')).toBe('Iris v2.0.0 · iOS');
});
