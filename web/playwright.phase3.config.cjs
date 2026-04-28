const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './playwright-temp',
  testMatch: 'tag-picker-phase3.spec.cjs',
  use: {
    headless: true,
  },
});
