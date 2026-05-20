module.exports = {
  testEnvironment: 'node',

  testMatch: ['**/tests/**/*.test.js'],

  clearMocks: true,
  resetMocks: true,
  resetModules: true,

  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],

  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js'
  ]
};