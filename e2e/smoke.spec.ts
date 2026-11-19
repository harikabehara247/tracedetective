import { expect, test, type Page } from '@playwright/test';

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const ROUTES = ['/', '/analyze', '/analyze/upload', '/analyze/url', '/analyze/sdk', '/examples', '/trace/sample-slow-database', '/compare', '/reports', '/docs', '/about', '/does-not-exist'];

test('every route renders without console errors or page overflow', async ({ page }) => {
  const errors = trackErrors(page);
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator('h1').first()).toBeVisible();
    await test.step(`no overflow on ${r}`, () => noHorizontalScroll(page));
  }
  expect(errors).toEqual([]);
});

test('navigation reaches every page', async ({ page }) => {
  await page.goto('/');
  const mobile = await page.getByRole('button', { name: 'Menu' }).isVisible();
  for (const label of ['Analyze', 'Examples', 'Compare', 'Reports', 'Docs', 'About', 'Home']) {
    if (mobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.locator('h1').first()).toBeVisible();
  }
});

test('waterfall and details stay in sync, with keyboard support', async ({ page }) => {
  await page.goto('/trace/sample-slow-database');
  await expect(page.getByRole('heading', { name: 'Slow database query' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Database call dominates the request: SELECT inventory' })).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Span hierarchy and timeline' });
  await tree.getByRole('treeitem', { name: /payment\.authorize/ }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'payment.authorize' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('heading', { level: 3, name: 'INSERT orders' })).toBeVisible();
  await expect(page).toHaveURL(/span=db-ins-1/);
  // Evidence link selects the span.
  await page.getByRole('button', { name: /order-service · SELECT inventory/ }).first().click();
  await expect(page.getByRole('heading', { level: 3, name: 'SELECT inventory' })).toBeVisible();
});

test('filters narrow the timeline', async ({ page }) => {
  await page.goto('/trace/sample-failing-dependency');
  await page.getByLabel('Errors only').check();
  const items = page.getByRole('tree').getByRole('treeitem');
  await expect(items).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(items).toHaveCount(6);
});

test('uploading valid and invalid JSON', async ({ page }) => {
  await page.goto('/analyze/upload');
  await page.getByLabel('Trace JSON file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
  await expect(page.getByText('This trace could not be imported')).toBeVisible();
  await expect(page.getByText(/Not valid JSON/)).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss' }).click();

  await page.getByRole('button', { name: 'Insert example' }).click();
  await page.getByRole('button', { name: 'Validate pasted JSON' }).click();
  await expect(page.getByText('Trace is valid')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze trace' }).click();
  await expect(page).toHaveURL(/\/trace\/import-/);
  await expect(page.getByRole('heading', { name: 'Healthy order request', level: 1 })).toBeVisible();
  // Survives a reload within the tab.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Healthy order request', level: 1 })).toBeVisible();
});

test('compare shows deltas and unmatched spans', async ({ page }) => {
  await page.goto('/compare?baseline=sample-healthy-order&current=sample-failing-dependency');
  await expect(page.getByText('Only in current (added) (1)')).toBeVisible();
  await expect(page.getByText('Only in baseline (removed) (3)')).toBeVisible();
  await page.getByRole('button', { name: 'Swap baseline and current' }).click();
  await expect(page.getByText('Only in current (added) (3)')).toBeVisible();
});

test('exports include provenance', async ({ page }) => {
  await page.goto('/trace/sample-external-payment');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray();
  const json = JSON.parse(Buffer.concat(text).toString());
  expect(json.provenance.synthetic).toBe(true);
  expect(json.provenance.processing).toMatch(/locally/);
});
