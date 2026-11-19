# Test results

Only tests that were executed are listed. All runs: 19 November 2026, Node.js 22, in the development container (Linux x64), on the `audit-release-readiness` branch (version 0.2.0).

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | Pass, 0 errors |
| Unit and component (Vitest 5, jsdom) | `npm test` | **108 passed**, 0 failed (5 files) |
| Production build | `npm run build` / `npm run build:pages` | Pass. JS 504 KB (149 KB gzip), CSS 33 KB. 14 route pages + 404.html |
| Browser tests, local preview (Playwright 1.63, Chromium) | `npm run test:e2e` | **62 passed**, 1 skipped, 0 failed (21 tests × desktop 1440×900, tablet 768×1024, Pixel 7) |
| Browser tests, GitHub Pages simulation at `/tracedetective/` | `BASE_URL=http://localhost:4174/tracedetective/ npx playwright test` | **62 passed**, 1 skipped, 0 failed |
| Accessibility (axe-core 4, WCAG 2.1 A/AA, serious + critical) | part of the browser tests | 0 violations on 12 pages × 3 viewports (after fixes F9) |
| Dependency audit | `npm audit` | 0 vulnerabilities |

The skipped test is "mobile menu…" on the desktop project, which has no menu button by design.

## Not executed here (and why)

| Check | Status | How it will run |
| --- | --- | --- |
| Browser suite against `https://harikabehara247.github.io/tracedetective/` | **Not run.** The container's network cannot reach github.io. The 0.1.0 live site was checked by hand instead (below). | `live-smoke.yml` after the 0.2.0 deploy |
| Firefox, WebKit, iPhone Safari | **Not run.** Only Chromium is installed in the container. | `ALL_BROWSERS=1` in `live-smoke.yml` |
| Real PageSpeed Insights call through the UI | **Not run successfully.** Keyless quota returned HTTP 429 twice. The UI path for 429 is tested with a mock; success is tested with a mocked PSI-shaped response. | With an API key, by hand |

## Live site (0.1.0) manual checks

Claude desktop browser pane (Chrome 156, Windows 10), 19 Nov 2026 04:40:54 UTC, `fetch(..., {cache: 'no-store'})` from the site's own origin:

| Path | Status |
| --- | --- |
| `/tracedetective/` | 200 |
| `/tracedetective/analyze`, `/analyze/url`, `/analyze/upload`, `/analyze/demo`, `/analyze/sdk`, `/examples`, `/trace/sample-slow-database`, `/compare`, `/reports`, `/docs`, `/about` | **404** (app still rendered from 404.html) |
| `/tracedetective/does-not-exist` | 404 (expected) |
| JS bundle, CSS, favicon | 200 |
| CSP meta tag | absent |

Earlier in this project (before this audit) all pages, sample scenarios, import, exports and mobile layout were checked on the live site by hand and worked.

## Unit and component tests (108)

- `tests/core.test.ts` (44): interval math, validation and structural errors, parse errors, redaction, warnings, tree building, deep (9,000) and wide (5,000) traces, critical path, diagnostics for every sample, comparison, report provenance.
- `tests/engine-edge.test.ts` (6): Infinity timestamps, mixed-unit warning, file order independence, nested overlap, reordered siblings in compare, repeated calls in compare.
- `tests/otlp.test.ts` (11): conversion of services, times, enums and attribute types; parse + redact + analyse; base64 IDs; legacy key and numeric nanos; multiple traces; skipped spans; missing parent; attribute cap and long names; Collector JSON Lines; non-OTLP JSON Lines; Tempo v1 and v2.
- `tests/url.test.ts` (37): normalisation, 21 rejected inputs (private, loopback, metadata IP, IPv6, integer IP, `.local`, single label, bad scheme, credentials, secret params, too long, `host:port`), public IPs, ports; PSI request URL; PSI parsing (synthetic PSI-shaped fixture) and robustness; findings; HTTP error finding; error explanations; probe timing, breakdown with and without Timing-Allow-Origin, failures, timeout abort, empty input.
- `tests/ui.test.tsx` (10): keyboard selection, collapse with ArrowLeft, synthetic label and finding, unknown trace, Start analysis, walkthrough first visit/Escape/remembered, reopen from footer, URL private-address refusal without fetch, PSI result + quota error, pasted OTLP import.

## Browser tests (21 per viewport)

`smoke.spec.ts`: every route 200 on load and refresh with no console errors, failed assets or overflow; not-found page; navigation; skip link; mobile menu; waterfall/details sync with keyboard; filters; upload valid/invalid and reload; compare and swap; export provenance; drag-and-drop OTLP; print layout.
`onboarding.spec.ts`: walkthrough opens once and leads to a mode; Escape skips; Start analysis modes; all four demo traces.
`url-check.spec.ts` (PSI and target mocked): full run with findings, methodology and export; 429 explanation with probe still working; unreachable target; private addresses refused with no outside request.
`a11y.spec.ts`: axe-core on 12 pages.
