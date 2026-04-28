module.exports = {
  testDir: './playwright-temp',
  testMatch: /category-picker-phase1\.spec\.cjs/,
  timeout: 120000,
  reporter: 'line',
  use: {
    browserName: 'chromium',
    launchOptions: {
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
    trace: 'off',
  },
};
