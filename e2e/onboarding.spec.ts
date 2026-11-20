import { expect, test } from './helpers';

test.describe('first visit', () => {
  test.use({ skipTour: false });

  test('walkthrough opens once, is keyboard operable and leads to a mode', async ({ page }) => {
    await page.goto('./');
    const dialog = page.getByRole('dialog', { name: 'Welcome to TraceDetective' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome to TraceDetective' })).toBeFocused();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'Your data stays with you' })).toBeVisible();
    await page.getByRole('button', { name: 'Analyze a website' }).click();
    await expect(page).toHaveURL(/analyze\/url$/);
    await page.goto('./');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Escape skips the walkthrough', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('dialog', { name: 'Welcome to TraceDetective' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test('the start page explains the three modes and each one opens', async ({ page }) => {
  await page.goto('analyze');
  await expect(page.getByRole('heading', { level: 1, name: 'Start analysis' })).toBeVisible();
  for (const [cta, heading] of [
    ['Analyze a website', 'Analyze a website'],
    ['Investigate a trace', 'What is a trace?'],
    ['Open the demos', /Slow database query/],
  ] as const) {
    await page.goto('analyze');
    await page.getByRole('main').getByRole('link', { name: cta, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
  }
});

test('trace onboarding opens the synthetic sample and serves the sample download', async ({ page, request }) => {
  await page.goto('analyze/upload');
  await expect(page.getByText('A trace is a timed record of one request moving through an application and its services.')).toBeVisible();
  const dl = page.getByRole('link', { name: 'Download sample trace (synthetic, OTLP JSON)' });
  const href = await dl.getAttribute('href');
  const res = await request.get(new URL(href!, page.url()).href);
  expect(res.status()).toBe(200);
  expect(JSON.stringify(await res.json())).toContain('tracedetective.synthetic');
  await page.getByRole('link', { name: 'Open a synthetic sample' }).click();
  await expect(page.getByText('Synthetic sample data').first()).toBeVisible();
  await expect(page.getByRole('tree')).toBeVisible();
});

test('demo cards open every sample trace', async ({ page }) => {
  await page.goto('analyze/demo');
  const count = await page.getByRole('link', { name: 'Open trace' }).count();
  expect(count).toBe(4);
  for (let i = 0; i < count; i++) {
    await page.goto('analyze/demo');
    await page.getByRole('link', { name: 'Open trace' }).nth(i).click();
    await expect(page.getByText('Synthetic sample data').first()).toBeVisible();
    await expect(page.getByRole('tree')).toBeVisible();
  }
});
