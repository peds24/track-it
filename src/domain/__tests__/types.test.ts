import type { Status } from '@/domain/types';

test('the test harness resolves the @/ alias', () => {
  const s: Status = 'done';
  expect(s).toBe('done');
});
