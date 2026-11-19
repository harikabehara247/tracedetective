// Serves dist/ the way GitHub Pages does, for testing a sub-path build locally:
// files as-is, "dir" → "dir/index.html" (with a redirect to add the slash), otherwise 404.html with status 404.
// Usage: BASE_PATH=/tracedetective/ npm run build:pages && node scripts/pages-sim.mjs /tracedetective/ 4174
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const base = process.argv[2] ?? '/';
const port = Number(process.argv[3] ?? 4174);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png' };

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith(base)) return send(res, 404, join('dist', '404.html'));
  const rel = normalize(decodeURIComponent(url.pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
  let file = join('dist', rel);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
      return res.end();
    }
    file = join(file, 'index.html');
  }
  if (existsSync(file) && statSync(file).isFile()) return send(res, 200, file);
  return send(res, 404, join('dist', '404.html'));
}).listen(port, () => console.log(`pages-sim on http://localhost:${port}${base}`));

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}
