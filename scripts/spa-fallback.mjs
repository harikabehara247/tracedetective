// GitHub Pages has no SPA rewrites. Two fixes:
// 1. 404.html is a copy of the app, so unknown paths still load it (with HTTP 404).
// 2. Every known route gets its own index.html, so deep links and refreshes return HTTP 200.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const index = join(dist, 'index.html');
const samples = readdirSync('src/fixtures')
  .filter((f) => f.endsWith('.json'))
  .map((f) => `trace/sample-${f.replace(/\.json$/, '')}`);
const routes = ['analyze', 'analyze/url', 'analyze/upload', 'analyze/demo', 'analyze/sdk', 'examples', 'compare', 'reports', 'docs', 'about', ...samples];

copyFileSync(index, join(dist, '404.html'));
for (const route of routes) {
  mkdirSync(join(dist, route), { recursive: true });
  copyFileSync(index, join(dist, route, 'index.html'));
}
console.log(`spa-fallback: 404.html plus ${routes.length} route pages`);
