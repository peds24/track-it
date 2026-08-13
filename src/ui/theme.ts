export const theme = {
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
  radius: { sm: 6, md: 10 },
  color: {
    bg: '#FFFFFF',
    text: '#111111',
    muted: '#767676',
    line: '#E6E6E6',
    accent: '#111111',
  },
  font: {
    title: { fontSize: 28, fontWeight: '600' as const },
    row: { fontSize: 17, fontWeight: '500' as const },
    meta: { fontSize: 13, fontWeight: '400' as const },
  },
} as const;
