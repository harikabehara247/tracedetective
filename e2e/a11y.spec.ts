import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './helpers';

const PAGES = ['', 'analyze', 'analyze/url', 'analyze/upload', 'analyze/demo', 'analyze/sdk', 'examples', 'trace/sample-slow-database', 'compare?baseline=sample-healthy-order&current=sample-slow-database', 'reports', 'docs', 'about'];

test('no serious or critical axe-core violations (WCAG 2.1 A/AA rules)', async ({ page }) => {
  const found: string[] = [];
  for (const p of PAGES) {
    await page.goto(p);
    await expect(page.locator('h1').first()).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) if (v.impact === 'serious' || v.impact === 'critical') found.push(`/${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
  }
  expect(found).toEqual([]);
});
