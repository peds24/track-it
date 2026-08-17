import { parseSeriesTitle, stripBareTrailingNumber } from '@/domain/seriesTitle';

test('strips a trailing #N', () => {
  expect(parseSeriesTitle('Absolute Batman #1')).toEqual({
    title: 'Absolute Batman',
    ordinal: 1,
  });
});

test('strips a trailing #N with no space before the number', () => {
  expect(parseSeriesTitle('Saga #12')).toEqual({ title: 'Saga', ordinal: 12 });
});

test.each(['Berserk Volume 5', 'Berserk Vol 5', 'Berserk Vol. 5'])(
  'strips a trailing volume form: %s',
  (raw) => {
    expect(parseSeriesTitle(raw)).toEqual({ title: 'Berserk', ordinal: 5 });
  },
);

test.each(['Chainsaw Man Issue 12', 'Chainsaw Man Iss 12', 'Chainsaw Man Iss. 12'])(
  'strips a trailing issue form: %s',
  (raw) => {
    expect(parseSeriesTitle(raw)).toEqual({ title: 'Chainsaw Man', ordinal: 12 });
  },
);

test('matching is case-insensitive for volume/issue forms', () => {
  expect(parseSeriesTitle('Berserk VOLUME 5')).toEqual({ title: 'Berserk', ordinal: 5 });
  expect(parseSeriesTitle('Chainsaw Man issue 12')).toEqual({
    title: 'Chainsaw Man',
    ordinal: 12,
  });
});

test('no trailing number leaves the title untouched', () => {
  expect(parseSeriesTitle('Absolute Batman')).toEqual({
    title: 'Absolute Batman',
    ordinal: null,
  });
});

test('trims incidental whitespace even with no match', () => {
  expect(parseSeriesTitle('  Absolute Batman  ')).toEqual({
    title: 'Absolute Batman',
    ordinal: null,
  });
});

/**
 * A title that is nothing but the ordinal itself ("#5" typed as the whole
 * title) would be emptied by stripping — better to leave it as a literal
 * title than hand back an empty string no series can be named.
 */
test('does not strip when doing so would empty the title', () => {
  expect(parseSeriesTitle('#5')).toEqual({ title: '#5', ordinal: null });
  expect(parseSeriesTitle('Volume 5')).toEqual({ title: 'Volume 5', ordinal: null });
});

/**
 * A11: Google Books' manga volume titles append the number bare, with no
 * "Vol"/"#" marker — "Attack on Titan 30", confirmed against a real
 * device scan. parseSeriesTitle deliberately does not match a bare
 * trailing number for a typed title (too likely to collide with a real
 * title), so this is a separate, narrowly-scoped function for the one
 * place a bare number is trustworthy: a provider's own title convention.
 */
describe('stripBareTrailingNumber', () => {
  test('strips a bare trailing number', () => {
    expect(stripBareTrailingNumber('Attack on Titan 30')).toEqual({
      title: 'Attack on Titan',
      ordinal: 30,
    });
  });

  test('no trailing number leaves the title untouched', () => {
    expect(stripBareTrailingNumber('Attack on Titan')).toEqual({
      title: 'Attack on Titan',
      ordinal: null,
    });
  });

  test('does not strip when doing so would empty the title', () => {
    expect(stripBareTrailingNumber('30')).toEqual({ title: '30', ordinal: null });
  });

  test('trims incidental whitespace even with no match', () => {
    expect(stripBareTrailingNumber('  Attack on Titan  ')).toEqual({
      title: 'Attack on Titan',
      ordinal: null,
    });
  });
});
