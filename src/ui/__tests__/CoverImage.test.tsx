import { fireEvent, render, screen } from '@testing-library/react-native';
import { CoverImage } from '@/ui/CoverImage';

test('renders the image when a cover url is given', async () => {
  await render(<CoverImage uri="https://x/c.jpg" title="Dune" category="book" width={160} height={240} />);
  expect(screen.getByLabelText('Dune cover')).toBeTruthy();
  expect(screen.queryByTestId('cover-placeholder')).toBeNull();
});

test('shows the placeholder with initials when there is no cover', async () => {
  await render(<CoverImage uri={null} title="The Expanse" category="show" width={160} height={240} />);
  expect(screen.getByTestId('cover-placeholder')).toBeTruthy();
  expect(screen.getByText('TE')).toBeTruthy();
});

test('falls back to the placeholder when the image fails to load', async () => {
  await render(<CoverImage uri="https://x/404.jpg" title="Dune" category="book" width={160} height={240} />);
  await fireEvent(screen.getByLabelText('Dune cover'), 'error');
  expect(screen.getByTestId('cover-placeholder')).toBeTruthy();
});

test('a thumbnail-sized placeholder drops the initials', async () => {
  await render(<CoverImage uri={null} title="Dune" category="book" width={40} height={60} />);
  expect(screen.queryByText('D')).toBeNull();
});
