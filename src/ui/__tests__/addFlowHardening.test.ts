import { addedNotStarted, normalizeEan5 } from '@/ui/addFlow';

// I12: the EAN-5 field and the add-then-start failure, shared with iOS.
test('the EAN-5 field keeps digits only, at most five', () => {
  expect(normalizeEan5('12345')).toBe('12345');
  expect(normalizeEan5('1234567')).toBe('12345');
  expect(normalizeEan5(' 12a3-4 ')).toBe('1234');
  expect(normalizeEan5('')).toBe('');
  expect(normalizeEan5('١٢٣')).toBe(''); // only ASCII digits are a barcode
});

test('a track that was added but could not start says where it is', () => {
  expect(addedNotStarted('Dune')).toEqual({
    title: 'Added, but couldn’t start it',
    message: 'Dune is in your Backlog. Start it from there.',
  });
});
