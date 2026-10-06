import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExpandableText } from '@/ui/ExpandableText';

const LONG = 'Spice. '.repeat(60).trim();

function visible(text: string) {
  return screen.getByText(text);
}

test('a short description shows in full with no toggle', async () => {
  await render(<ExpandableText text="Spice." />);

  expect(visible('Spice.').props.numberOfLines).toBeUndefined();
  expect(screen.queryByText('Show more')).toBeNull();
});

test('a long description clamps and expands with Show more, then collapses', async () => {
  await render(<ExpandableText text={LONG} lines={6} />);

  expect(visible(LONG).props.numberOfLines).toBe(6);
  await fireEvent.press(screen.getByText('Show more'));
  expect(visible(LONG).props.numberOfLines).toBeUndefined();
  await fireEvent.press(screen.getByText('Show less'));
  expect(visible(LONG).props.numberOfLines).toBe(6);
});

test('the measured line count wins over the character estimate', async () => {
  await render(<ExpandableText text={LONG} lines={6} />);
  const copies = screen.getAllByText(LONG, { includeHiddenElements: true });
  expect(copies).toHaveLength(2);

  // Wide screen: the whole text fits in four lines, so nothing is hidden.
  await fireEvent(copies[0]!, 'textLayout', { nativeEvent: { lines: [1, 2, 3, 4] } });
  expect(screen.queryByText('Show more')).toBeNull();
  expect(visible(LONG).props.numberOfLines).toBeUndefined();

  // Narrow screen: nine lines, so it clamps.
  await fireEvent(copies[0]!, 'textLayout', { nativeEvent: { lines: [1, 2, 3, 4, 5, 6, 7, 8, 9] } });
  expect(screen.getByText('Show more')).toBeTruthy();
});
