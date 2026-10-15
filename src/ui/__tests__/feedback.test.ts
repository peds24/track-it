import { FEEDBACK_EMAIL, feedbackMailto } from '@/ui/feedback';

test('addresses the developer and carries the message, version and platform', () => {
  const url = feedbackMailto('Love it & the covers.\nMore stats?', { version: '1.3.0', platform: 'android' });

  expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?`)).toBe(true);
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  expect(params.get('subject')).toBe('Track It feedback (v1.3.0)');
  expect(params.get('body')).toBe('Love it & the covers.\nMore stats?\n\n—\nTrack It 1.3.0 · android');
});

test('encodes spaces as %20, which every mail client reads, never +', () => {
  const url = feedbackMailto('a b', { version: '1.3.0', platform: 'ios' });
  expect(url).not.toContain('+');
  expect(url).toContain('a%20b');
});

test('trims the message', () => {
  const url = feedbackMailto('  hi  \n', { version: '1.3.0', platform: 'web' });
  expect(decodeURIComponent(url)).toContain('body=hi\n\n—');
});

test('sends to serdiopedro@gmail.com', () => {
  expect(FEEDBACK_EMAIL).toBe('serdiopedro@gmail.com');
});

test('an app name changes the subject and signature (Iris on iOS, I12)', () => {
  const url = feedbackMailto('hi', { version: '2.0.0', platform: 'iOS', name: 'Iris' });
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  expect(params.get('subject')).toBe('Iris feedback (v2.0.0)');
  expect(params.get('body')).toBe('hi\n\n—\nIris 2.0.0 · iOS');
});
