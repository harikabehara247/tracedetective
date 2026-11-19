import AxeBuilder from '@axe-core/playwright';
import { parsePsi } from '../src/core/url';
import { readFileSync } from 'node:fs';
import { expect, noHorizontalScroll, test, trackProblems } from './helpers';

// Synthetic PageSpeed responses (real Lighthouse 13 output for a local test page, host renamed).
// Google and the analysis service are mocked; nothing is sent anywhere.
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8'));
const genericMobile = fixture('psi-synthetic-generic-mobile.json');
const genericDesktop = fixture('psi-synthetic-generic-desktop.json');
const CORS = { 'access-control-allow-origin': '*' };
const pick = (url: string) => (url.includes('strategy=desktop') ? genericDesktop : genericMobile);

test.beforeEach(async ({ page }) => {
  await page.route('https://www.googleapis.com/pagespeedonline/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pick(r.request().url())), headers: CORS }));
  await page.route(/\/v1\/pagespeed\?/, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: parsePsi(pick(r.request().url())), cached: false, fetchedAt: '2026-11-19T15:00:00.000Z' }), headers: CORS }),
  );
});

test('a share link opens the full report: time breakdown, findings, preview and waterfall', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('analyze/url?url=https%3A%2F%2Fdemo-site.example%2F&device=mobile');
  await expect(page.getByRole('heading', { name: 'Where the time went' })).toBeVisible({ timeout: 20_000 });
  const stages = page.getByRole('list', { name: 'LCP stages' });
  for (const s of ['Server response', 'Resource discovery', 'Resource download', 'Rendering']) await expect(stages.getByText(s, { exact: true })).toBeVisible();
  await expect(page.getByText(/Main-thread work:/)).toBeVisible();
  await expect(page.getByText(/Platform: not identified/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to check next' })).toBeVisible();
  await expect(page.getByText(/^Stage: /).first()).toBeVisible();
  await expect(page.getByRole('img', { name: /Final screenshot of/ })).toBeVisible();
  await expect(page.getByText('body > img.hero', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Requests' })).toBeVisible();
  await expect(page.getByText('Chrome UX Report · 2026-10-21 to 2026-11-17')).toBeVisible();
  await noHorizontalScroll(page);
  expect(problems).toEqual([]);
});

test('switching to desktop keeps both results and compares them', async ({ page }) => {
  await page.goto('analyze/url?url=https%3A%2F%2Fdemo-site.example%2F&device=mobile');
  await expect(page.getByRole('heading', { name: 'Where the time went' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Test on desktop/ }).click();
  await expect(page).toHaveURL(/device=desktop/);
  await expect(page.getByText('Chrome UX Report · rolling 28 days')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Mobile and desktop/ })).toBeVisible();
});

test('platform notes appear only when chosen, and say the platform was not detected', async ({ page }) => {
  await page.goto('analyze/url');
  await page.getByLabel('Website URL', { exact: true }).fill('demo-site.example');
  await page.getByText('Advanced options').click();
  await page.getByRole('combobox', { name: 'Platform-specific notes' }).selectOption('wordpress');
  await page.getByRole('button', { name: 'Analyze Website' }).click();
  await expect(page).toHaveURL(/platform=wordpress/);
  await expect(page.getByText(/WordPress notes added because you chose it \(not detected\)/)).toBeVisible({ timeout: 20_000 });
});

test('the report has no serious or critical axe-core violations', async ({ page }) => {
  await page.goto('analyze/url?url=https%3A%2F%2Fdemo-site.example%2F&device=mobile');
  await expect(page.getByRole('heading', { name: 'Where the time went' })).toBeVisible({ timeout: 20_000 });
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);
  expect(bad).toEqual([]);
});
