import { fireEvent, render, screen } from '@testing-library/react-native';
import { SearchResultRow } from '@/ui/SearchResultRow';

const dune = { id: 'v1', title: 'Dune', category: 'book' as const, count: 1, creator: 'Frank Herbert', year: '1965' };

test('shows the title with creator and year beneath it', async () => {
  await render(<SearchResultRow result={dune} onPress={() => {}} />);
  expect(screen.getByText('Dune')).toBeTruthy();
  expect(screen.getByText('Frank Herbert · 1965')).toBeTruthy();
});

test('shows no subtitle line when neither creator nor year is known', async () => {
  await render(<SearchResultRow result={{ id: 'x', title: 'Dune', category: 'book', count: 1 }} onPress={() => {}} />);
  expect(screen.queryByText(/·/)).toBeNull();
});

test('pressing the row picks the result', async () => {
  const onPress = jest.fn();
  await render(<SearchResultRow result={dune} onPress={onPress} />);
  await fireEvent.press(screen.getByText('Dune'));
  expect(onPress).toHaveBeenCalledWith(dune);
});
