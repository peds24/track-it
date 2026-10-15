import type { FixtureCase } from '../types';

// The Done screen's feedback and data-sources copy (src/ui/aboutText.ts,
// src/ui/feedback.ts). Inputs only.
const c = (fn: string, name: string, args: unknown[]): FixtureCase => ({ name: `${fn}: ${name}`, fn, args });

export const cases: FixtureCase[] = [
  c('aboutCopy', 'every string', []),
  c('noMailMessage', 'the address', []),
  c('versionLine', 'Android', ['Track It', '1.3.0', 'Android']),
  c('versionLine', 'iOS', ['Iris', '2.0.0', 'iOS']),
  c('feedbackMailto', 'Android, no name', ['Love it & the covers.\nMore stats?', { version: '1.3.0', platform: 'android' }]),
  c('feedbackMailto', 'Iris on iOS', ['  Scanner froze  \n', { version: '2.0.0', platform: 'iOS', name: 'Iris' }]),
  c('feedbackMailto', 'unicode and reserved characters', ['Café #1? 50% & “quotes” — ok', { version: '2.0.0', platform: 'iOS', name: 'Iris' }]),
];
