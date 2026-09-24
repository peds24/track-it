import { googleBooksImage, sharpCoverUrl } from '@/providers/images';

describe('sharpCoverUrl', () => {
  test('bumps a TMDB poster of any small size to w780', () => {
    expect(sharpCoverUrl('https://image.tmdb.org/t/p/w342/p.jpg')).toBe('https://image.tmdb.org/t/p/w780/p.jpg');
    expect(sharpCoverUrl('https://image.tmdb.org/t/p/w92/p.jpg')).toBe('https://image.tmdb.org/t/p/w780/p.jpg');
  });

  test('bumps an AniList cover to its extraLarge path', () => {
    expect(sharpCoverUrl('https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx1.jpg')).toBe(
      'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx1.jpg',
    );
    expect(sharpCoverUrl('https://s4.anilist.co/file/anilistcdn/media/manga/cover/small/bx1.jpg')).toBe(
      'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx1.jpg',
    );
  });

  test('asks Google Books for a 600px-wide cover without the page-curl effect', () => {
    expect(
      sharpCoverUrl('http://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api'),
    ).toBe('https://books.google.com/books/content?id=X&printsec=frontcover&img=1&zoom=1&source=gbs_api&fife=w600');
  });

  test('replaces an existing fife width rather than adding a second one', () => {
    expect(sharpCoverUrl('https://books.google.com/books/content?id=X&zoom=1&fife=w200')).toBe(
      'https://books.google.com/books/content?id=X&zoom=1&fife=w600',
    );
  });

  test('leaves every other URL alone, apart from forcing https', () => {
    expect(sharpCoverUrl('https://static.metron.cloud/media/issue/1.jpg')).toBe('https://static.metron.cloud/media/issue/1.jpg');
    expect(sharpCoverUrl('http://example.com/a.jpg')).toBe('https://example.com/a.jpg');
  });

  test('passes null through', () => {
    expect(sharpCoverUrl(null)).toBeNull();
    expect(sharpCoverUrl(undefined)).toBeNull();
  });
});

test('googleBooksImage sizes a thumbnail to the requested width', () => {
  expect(googleBooksImage('http://books.google.com/books/content?id=X&zoom=5&edge=curl', 200)).toBe(
    'https://books.google.com/books/content?id=X&zoom=5&fife=w200',
  );
});
