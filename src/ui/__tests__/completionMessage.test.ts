import { completionMessage } from '@/ui/completionMessage';

test('a standalone entry just moves to Done', () => {
  expect(completionMessage({ kind: 'entry', ongoing: false, completionDrops: null })).toBe('It moves to Done.');
});

test('an ongoing series with an auto-appended unit names the unit it removes', () => {
  expect(completionMessage({ kind: 'series', ongoing: true, completionDrops: 'Issue 13' })).toBe(
    "Issue 13 isn't marked done, so it's removed and the series ends at the last one you finished. Tap Done on it first if you finished it.",
  );
});

test('an ongoing series with nothing to drop stops growing', () => {
  expect(completionMessage({ kind: 'series', ongoing: true, completionDrops: null })).toBe(
    'Everything you have reached is marked done and the series stops growing. It moves to Done.',
  );
});

test('a finite series marks every remaining unit done', () => {
  expect(completionMessage({ kind: 'series', ongoing: false, completionDrops: null })).toBe(
    'Every remaining unit is marked done. It moves to Done.',
  );
});
