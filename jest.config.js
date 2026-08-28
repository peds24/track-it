module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  // Stale copies of the suite live in the git worktrees under .claude/. They
  // resolve `@/` back to this repo's src but load their own node_modules, so a
  // second React reaches the renderer and every component test there dies on
  // "Invalid hook call". Git already excludes the directory; jest has to be
  // told separately.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|@testing-library/.*))',
  ],
};
