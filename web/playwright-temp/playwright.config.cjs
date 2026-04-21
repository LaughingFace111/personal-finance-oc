module.exports = {
  testDir: './playwright-temp',
  timeout: 120000,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    launchOptions: {
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
    viewport: { width: 1440, height: 1200 },
    trace: 'off',
  },
};
