import { genresFrom, withGenres } from '@/domain/genres';

test('splits path-style categories into separate genres', () => {
  expect(genresFrom(['Fiction / Fantasy / Epic'])).toEqual(['Fiction', 'Fantasy', 'Epic']);
});

test('drops filler and case-insensitive duplicates, keeping first spelling', () => {
  expect(genresFrom(['Fiction / General', 'fiction', 'Horror', null, '', undefined])).toEqual(['Fiction', 'Horror']);
});

test('nothing in, nothing out', () => {
  expect(genresFrom(undefined)).toEqual([]);
  expect(genresFrom(null)).toEqual([]);
});

test('withGenres adds the key only when there is something to add', () => {
  expect(withGenres({ a: 1 }, ['Drama'])).toEqual({ a: 1, genres: ['Drama'] });
  expect('genres' in withGenres({ a: 1 }, ['General'])).toBe(false);
});
