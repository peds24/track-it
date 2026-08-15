import { render, screen, fireEvent } from '@testing-library/react-native';
import { FilterBar } from '@/ui/FilterBar';

test('selecting a category reports it', async () => {
  const onCategoryChange = jest.fn();
  await render(<FilterBar category={null} onCategoryChange={onCategoryChange} />);
  await fireEvent.press(screen.getByText('Manga'));
  expect(onCategoryChange).toHaveBeenCalledWith('manga');
});

test('tapping the active category clears the filter', async () => {
  const onCategoryChange = jest.fn();
  await render(<FilterBar category="manga" onCategoryChange={onCategoryChange} />);
  await fireEvent.press(screen.getByText('Manga'));
  expect(onCategoryChange).toHaveBeenCalledWith(null);
});
