import { expect, test } from './helpers';

// Unmocked: runs a real website analysis against the deployed site. Enabled only with REAL_PSI=1
// (the Live site checks workflow), in one browser, because each run uses PageSpeed Insights quota.
// It passes when the page shows either measured results or a clear explanation, never a blank result.
test.skip(!process.env.REAL_PSI, 'Set REAL_PSI=1 to run a real analysis');

test('a real analysis shows results or a clear explanation', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One browser is enough for the real analysis');
  test.setTimeout(150_000);
  await page.goto('analyze/url');
  await page.getByLabel('Website URL', { exact: true }).fill('example.com');
  await page.getByRole('button', { name: 'Analyze Website' }).click();
  const lab = page.getByRole('heading', { name: 'Lab test', exact: true }).first();
  const problem = page.getByRole('alert').getByRole('heading');
  await expect(lab.or(problem)).toBeVisible({ timeout: 120_000 });
  if (await lab.isVisible()) {
    await expect(page.getByRole('heading', { name: 'Mobile and desktop side by side' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Real users', exact: true }).first()).toBeVisible();
    info.annotations.push({ type: 'result', description: 'Lab results received' });
  } else {
    const text = (await page.getByRole('alert').innerText()).trim();
    expect(text.length).toBeGreaterThan(40);
    await expect(page.getByText(/none were measured/)).toBeVisible();
    info.annotations.push({ type: 'result', description: `Explained failure: ${text.split('\n')[0]}` });
  }
});
