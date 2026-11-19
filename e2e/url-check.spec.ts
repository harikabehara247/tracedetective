import { parsePsi } from '../src/core/url';
import { expect, test } from './helpers';

// PageSpeed Insights (direct or through the analysis service) and the target site are mocked,
// so these tests are deterministic and never send anything to Google. The response shape follows the PSI v5 API; values are invented.
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

const CORS = { 'access-control-allow-origin': '*' };
/** Answers like Google when called directly, and like the analysis service (`/v1/pagespeed`) when the build uses it. */
async function mockPageSpeed(page: import('@playwright/test').Page, outcome: 'ok' | 'quota') {
  await page.route('https://www.googleapis.com/pagespeedonline/**', (r) =>
    outcome === 'ok'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PSI), headers: CORS })
      : r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":{"code":429,"message":"Quota exceeded"}}', headers: CORS }),
  );
  await page.route(/\/v1\/pagespeed\?/, (r) =>
    outcome === 'ok'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: parsePsi(PSI), cached: false, fetchedAt: PSI.lighthouseResult.fetchTime }), headers: CORS })
      : r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"quota","message":"Daily quota used up"}}', headers: { ...CORS, 'retry-after': '3600' } }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockPageSpeed(page, 'ok');
  await page.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
});

async function analyze(page: import('@playwright/test').Page, url: string) {
  await page.getByLabel('Website URL', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'Analyze Website' }).click();
}

test('asks only for a URL and a device: no API key, platform and probe under Advanced options', async ({ page }) => {
  await page.goto('analyze/url');
  await expect(page.getByRole('button', { name: 'Analyze Website' })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(1);
  await expect(page.getByLabel(/api key/i)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Mobile/ })).toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Platform-specific notes' })).toBeHidden();
  await page.getByText('Advanced options').click();
  await expect(page.getByRole('combobox', { name: 'Platform-specific notes' })).toHaveValue('');
  await expect(page.getByRole('checkbox', { name: /time the site from my browser/ })).not.toBeChecked();
});

test('analyzes a website, separates lab and real-user data, and exports a report', async ({ page }) => {
  await page.goto('analyze/url');
  const outside: string[] = [];
  page.on('request', (r) => { if (/^https?:\/\/example\.com/.test(r.url())) outside.push(r.url()); });
  await analyze(page, 'example.com');
  await expect(page.getByRole('heading', { name: /Server took 1.34 s to start sending the page/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /redirect/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lab test', exact: true })).toBeVisible();
  await expect(page.getByText('Lighthouse · simulated').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Real users', exact: true })).toBeVisible();
  await expect(page.getByText(/Google publishes real-user data only/)).toBeVisible();
  await expect(page.getByText('How these numbers were measured')).toBeVisible();
  expect(outside).toEqual([]); // the browser probe is optional and off by default
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Report' }).click();
  const file = await download;
  const json = JSON.parse(Buffer.concat(await (await file.createReadStream()).toArray()).toString());
  expect(json.kind).toBe('website-analysis');
  expect(json.input.url).toBe('https://example.com/');
  expect(json.labData.serverResponseMs).toBe(1340);
  expect(json.fieldData).toBeNull();
  expect(json.findings.map((f: { id: string }) => f.id)).toContain('slow-server');
});

test('runs the optional browser probe when chosen', async ({ page }) => {
  await page.goto('analyze/url');
  await page.getByText('Advanced options').click();
  await page.getByRole('checkbox', { name: /time the site from my browser/ }).check();
  await analyze(page, 'example.com');
  await expect(page.getByRole('heading', { name: 'From your browser' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('5 of 5')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connection timing (DNS, TCP, TLS)' })).toBeVisible();
});

test('explains a used-up quota without blank results and offers alternatives', async ({ page }) => {
  await page.unrouteAll();
  await mockPageSpeed(page, 'quota');
  await page.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await page.goto('analyze/url');
  await analyze(page, 'https://example.com');
  await expect(page.getByRole('heading', { name: 'The lab test is unavailable right now' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/none were measured/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lab test', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open on PageSpeed Insights/ })).toBeVisible();
  await page.getByRole('button', { name: 'Time it from my browser instead' }).click();
  await expect(page.getByText('5 of 5')).toBeVisible({ timeout: 20_000 });
});

test('reports an unreachable URL from the browser probe', async ({ page }) => {
  await page.route('https://example.com/**', (r) => r.abort('connectionrefused'));
  await page.goto('analyze/url');
  await page.getByText('Advanced options').click();
  await page.getByRole('checkbox', { name: /time the site from my browser/ }).check();
  await analyze(page, 'https://example.com');
  await expect(page.getByRole('heading', { name: 'Your browser could not reach the URL' })).toBeVisible({ timeout: 20_000 });
});

test('refuses local and private addresses without making a request', async ({ page }) => {
  await page.goto('analyze/url');
  const origin = new URL(page.url()).origin;
  const outside: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(origin)) outside.push(r.url()); });
  for (const url of ['localhost:8080', 'http://10.0.0.5', 'http://169.254.169.254/']) {
    await analyze(page, url);
    await expect(page.getByRole('alert')).toContainText('public websites');
  }
  expect(outside).toEqual([]);
});
