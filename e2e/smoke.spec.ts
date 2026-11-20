import { ROUTES, cspViolations, expect, noHorizontalScroll, test, trackProblems } from './helpers';

test('every route returns HTTP 200 on a direct load and a refresh, with no console errors, failed assets or overflow', async ({ page }) => {
  const problems = trackProblems(page);
  for (const r of ROUTES) {
    await test.step(r || 'home', async () => {
      const res = await page.goto(r);
      expect(res?.status(), `status for /${r}`).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await noHorizontalScroll(page);
      expect(await cspViolations(page), `CSP violations on /${r}`).toEqual([]);
      const again = await page.reload();
      // A refresh may be answered from the HTTP cache (304 Not Modified), which is also a success.
      expect([200, 304], `status after refresh for /${r}`).toContain(again?.status());
      await expect(page.locator('h1').first()).toBeVisible();
    });
  }
  expect(problems).toEqual([]);
});

test("unknown paths show the app's not-found page", async ({ page }) => {
  const problems = trackProblems(page, true);
  await page.goto('does-not-exist');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: /home/i }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Find where a slow page loses time.' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('navigation reaches every page', async ({ page }) => {
  await page.goto('./');
  const mobile = await page.getByRole('button', { name: 'Menu' }).isVisible();
  for (const label of ['Analyze a website', 'Reports', 'Investigate a trace', 'Compare traces', 'Examples', 'Docs', 'About', 'Home']) {
    if (mobile) await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label, exact: true }).click();
    await expect(page.locator('h1').first()).toBeVisible();
  }
});

test('keyboard: skip link moves focus to the main content', async ({ page }) => {
  await page.goto('docs');
  // Wait for the app to render before the first Tab, or the key can land before the skip link exists.
  await expect(page.locator('h1').first()).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('mobile menu opens and closes with Escape, returning focus to the button', async ({ page }) => {
  await page.goto('./');
  const menu = page.getByRole('button', { name: 'Menu' });
  test.skip(!(await menu.isVisible()), 'desktop layout has no menu button');
  await menu.click();
  await expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Site navigation' })).toBeHidden();
  await expect(menu).toBeFocused();
});

test('waterfall and details stay in sync, with keyboard support', async ({ page }) => {
  await page.goto('trace/sample-slow-database');
  await expect(page.getByRole('heading', { name: 'Slow database query' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Database call dominates the request: SELECT inventory' })).toBeVisible();
  const tree = page.getByRole('tree', { name: 'Span hierarchy and timeline' });
  await tree.getByRole('treeitem', { name: /payment\.authorize/ }).click();
  await expect(page.getByRole('heading', { level: 3, name: 'payment.authorize', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('heading', { level: 3, name: 'INSERT orders', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/span=db-ins-1/);
  // Evidence link selects the span.
  await page.getByRole('button', { name: /order-service · SELECT inventory/ }).first().click();
  await expect(page.getByRole('heading', { level: 3, name: 'SELECT inventory', exact: true })).toBeVisible();
});

test('filters narrow the timeline', async ({ page }) => {
  await page.goto('trace/sample-failing-dependency');
  await page.getByLabel('Errors only').check();
  const items = page.getByRole('tree').getByRole('treeitem');
  await expect(items).toHaveCount(4);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(items).toHaveCount(6);
});

test('uploading valid and invalid JSON', async ({ page }) => {
  await page.goto('analyze/upload');
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
  await page.goto('compare?baseline=sample-healthy-order&current=sample-failing-dependency');
  await expect(page.getByText('Only in current (added) (1)')).toBeVisible();
  await expect(page.getByText('Only in baseline (removed) (3)')).toBeVisible();
  await page.getByRole('button', { name: 'Swap baseline and current' }).click();
  await expect(page.getByText('Only in current (added) (3)')).toBeVisible();
});

test('exports include provenance', async ({ page }) => {
  await page.goto('trace/sample-external-payment');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await download;
  const text = await (await file.createReadStream()).toArray();
  const json = JSON.parse(Buffer.concat(text).toString());
  expect(json.provenance.synthetic).toBe(true);
  expect(json.provenance.processing).toMatch(/locally/);
});

test('drag and drop imports an OTLP JSON file', async ({ page }) => {
  await page.goto('analyze/upload');
  const otlp = JSON.stringify({
    resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'cart' } }] }, scopeSpans: [{ spans: [{ traceId: '5b8efff798038103d269b633813fc60c', spanId: 'eee19b7ec3c1b174', name: 'GET /cart', kind: 2, startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000120000000' }] }] }],
  });
  const dt = await page.evaluateHandle((text) => {
    const d = new DataTransfer();
    d.items.add(new File([text], 'trace.otlp.json', { type: 'application/json' }));
    return d;
  }, otlp);
  await page.getByText('Drag a .json file here').dispatchEvent('drop', { dataTransfer: dt });
  await expect(page.getByText('Trace is valid')).toBeVisible();
  await page.getByRole('button', { name: 'Analyze trace' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'cart · GET /cart' })).toBeVisible();
});

test('print layout hides navigation and keeps the report', async ({ page }) => {
  await page.goto('reports');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeHidden();
  await expect(page.locator('h1').first()).toBeVisible();
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(255, 255, 255)');
});
