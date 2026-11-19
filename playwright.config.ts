import { defineConfig, devices } from '@playwright/test';

// BASE_URL=https://harikabehara247.github.io/tracedetective/ runs the suite against a deployed site.
// Without it, the production build is served locally. ALL_BROWSERS=1 adds Firefox and WebKit.
const live = process.env.BASE_URL;
const baseURL = live ? (live.endsWith('/') ? live : `${live}/`) : 'http://localhost:4173/';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: live ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'off' },
  webServer: live
    ? undefined
    : { command: 'npm run build:pages && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    ...(process.env.ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
