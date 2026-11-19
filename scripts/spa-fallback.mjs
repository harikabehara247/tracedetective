// GitHub Pages has no SPA rewrites: serve the app for unknown paths via 404.html.
import { copyFileSync } from 'node:fs';
copyFileSync('dist/index.html', 'dist/404.html');
