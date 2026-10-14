module.exports = {
  preset: 'jest-expo',
  // Stage 1's tests are pure TypeScript domain logic (src/domain/schedule.ts,
  // placement.ts) with no React Native component rendering, so this is deliberately
  // narrow for now rather than running the full RN test app surface.
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
};
