const { defineConfig } = require('@playwright/test');
const path = require('node:path');

module.exports = defineConfig({
  testDir: path.join(__dirname, 'playwright-temp'),
  testMatch: ['tag-picker-phase2.spec.cjs'],
  use: {
    browserName: 'chromium',
    headless: true,
  },
});
