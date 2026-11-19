import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true } },
  ],
});
