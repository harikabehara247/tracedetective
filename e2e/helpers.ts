import { expect, test as base, type Page } from '@playwright/test';

/** Every test starts with the walkthrough already dismissed, except where a test opts out. */
export const test = base.extend<{ skipTour: boolean }>({
  skipTour: [true, { option: true }],
  page: async ({ page, skipTour }, use) => {
    if (skipTour) await page.addInitScript(() => window.localStorage.setItem('td:tour-done', '1'));
    await use(page);
  },
});
export { expect };

/** Console errors, uncaught exceptions and failed same-origin requests (except expected 404 documents). */
export function trackProblems(page: Page, allow404Document = false) {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (allow404Document && /404/.test(m.text())) return;
    problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    const origin = new URL(page.url() || r.url()).origin;
    if (!r.url().startsWith(origin) || r.status() < 400) return;
    if (allow404Document && r.request().resourceType() === 'document') return;
    problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => {
    if (r.failure()?.errorText.includes('ERR_ABORTED')) return;
    problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`);
  });
  return problems;
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export const ROUTES = [
  '',
  'analyze',
  'analyze/url',
  'analyze/upload',
  'analyze/demo',
  'analyze/sdk',
  'examples',
  'trace/sample-slow-database',
  'trace/sample-healthy-order',
  'trace/sample-external-payment',
  'trace/sample-failing-dependency',
  'compare',
  'reports',
  'docs',
  'about',
];
