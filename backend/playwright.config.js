const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: 'chromium',
    headless: true
  },
  webServer: {
    command: 'node test/browser-server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 10000
  },
  reporter: 'list'
});
