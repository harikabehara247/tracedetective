import { expect, test } from './helpers';

// PageSpeed Insights and the target site are mocked, so these tests are deterministic and
// never send anything to Google. The response shape follows the PSI v5 API; values are invented.
const PSI = {
  lighthouseResult: {
    requestedUrl: 'https://example.com/',
    finalDisplayedUrl: 'https://www.example.com/',
    fetchTime: '2026-11-19T04:00:00.000Z',
    lighthouseVersion: '12.0.0',
    configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate' },
    categories: { performance: { score: 0.62 } },
    audits: {
      'server-response-time': { numericValue: 1340 },
      'largest-contentful-paint': { numericValue: 2100 },
      redirects: { details: { items: [{ url: 'https://example.com/', wastedMs: 420 }, { url: 'https://www.example.com/', wastedMs: 0 }] } },
      'network-requests': { details: { items: [{ url: 'https://www.example.com/', resourceType: 'Document', statusCode: 200, protocol: 'h2' }] } },
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('https://www.googleapis.com/pagespeedonline/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PSI), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
});

test('runs both methods and shows evidence-backed findings, methodology and export', async ({ page }) => {
  await page.goto('analyze/url');
  await page.getByLabel('URL', { exact: true }).fill('example.com');
  await page.getByRole('button', { name: 'Run check' }).click();
  await expect(page.getByRole('heading', { name: /Slow server response: 1.34 s/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /redirect/ })).toBeVisible();
  await expect(page.getByText('5 of 5')).toBeVisible();
  await expect(page.getByText(/Not visible to the browser/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Methodology' })).toBeVisible();
  await expect(page.getByText(/Timing-Allow-Origin/).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await download;
  const json = JSON.parse(Buffer.concat(await (await file.createReadStream()).toArray()).toString());
  expect(json.kind).toBe('url-check');
  expect(json.input.url).toBe('https://example.com/');
  expect(json.browserProbe.samples).toHaveLength(5);
  expect(json.findings.map((f: { id: string }) => f.id)).toContain('slow-server');
});

test('explains a PageSpeed quota error and still shows the browser probe', async ({ page }) => {
  await page.route('https://www.googleapis.com/pagespeedonline/**', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":{"message":"Quota exceeded"}}', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('analyze/url');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: 'Run check' }).click();
  await expect(page.getByText(/shared free quota is used up/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('5 of 5')).toBeVisible();
});

test('reports an unreachable URL from the browser probe', async ({ page }) => {
  await page.route('https://example.com/**', (r) => r.abort('connectionrefused'));
  await page.goto('analyze/url');
  await page.getByLabel('URL', { exact: true }).fill('https://example.com');
  await page.getByRole('checkbox', { name: /PageSpeed Insights/ }).uncheck();
  await page.getByRole('button', { name: 'Run check' }).click();
  await expect(page.getByRole('heading', { name: 'Your browser could not reach the URL' })).toBeVisible({ timeout: 20_000 });
});

test('refuses local and private addresses without making a request', async ({ page }) => {
  await page.goto('analyze/url');
  const origin = new URL(page.url()).origin;
  const outside: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(origin)) outside.push(r.url()); });
  for (const url of ['localhost:8080', 'http://10.0.0.5', 'http://169.254.169.254/']) {
    await page.getByLabel('URL', { exact: true }).fill(url);
    await page.getByRole('button', { name: 'Run check' }).click();
    await expect(page.getByRole('alert')).toContainText('public websites');
  }
  expect(outside).toEqual([]);
});
