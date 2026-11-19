# Fix log: 0.1.0 → 0.2.0

Each entry: problem, cause, change, files and how it is verified. Test names refer to [TEST_RESULTS.md](TEST_RESULTS.md).

## P0

### F1. Users could not check a URL
- **Problem:** `/analyze/url` showed "Planned, not available yet" and no form.
- **Cause:** 0.1.0 deliberately shipped no URL checker because a safe server did not exist.
- **Change:** URL check built with no server: Google PageSpeed Insights v5 (Google's servers fetch the page) plus a browser probe from the visitor's browser. Validation, private-address refusal, timeouts, cancellation, error explanations, methodology, findings and JSON export.
- **Files:** `src/core/url.ts`, `src/app/pages/UrlCheck.tsx`, `src/app/pages/Analyze.tsx`, `src/app/pages/Docs.tsx`
- **Verified by:** `tests/url.test.ts` (37), `tests/ui.test.tsx` URL check (2), `e2e/url-check.spec.ts` (4 × 3 viewports).

### F2. No clear starting point
- **Problem:** four tabs, one non-functional; landing CTA bypassed choice; nothing said which mode fits which problem.
- **Change:** `/analyze` is a Start analysis chooser (three modes, can/cannot lists). Landing CTA "Start analysis". Nav item renamed. SDK guide moved out of the tabs and rewritten for native OTLP import.
- **Files:** `src/app/pages/Analyze.tsx`, `src/app/pages/Landing.tsx`, `src/app/Layout.tsx`
- **Verified by:** `ui.test.tsx` "shows the three start options…", `e2e/onboarding.spec.ts` "Start analysis explains the three modes…", "demo cards open every sample trace".

### F3. No guided first visit
- **Change:** five-step accessible walkthrough (`role="dialog"`, `aria-modal`, focus management, Tab trap, Escape, focus return). Opens once on the home page, remembered in `localStorage` (`td:tour-done`, try/catch), reopenable from Start analysis and footer.
- **Files:** `src/app/components/Tour.tsx`, `src/app/Layout.tsx`
- **Fix during testing:** Escape was occasionally missed when pressed immediately after the dialog appeared (listener attached after paint). Moved to a document listener in `useLayoutEffect`; then passed 15/15 repeated runs.
- **Verified by:** `ui.test.tsx` onboarding (2), `e2e/onboarding.spec.ts` first visit (2).

### F4. Deep links returned HTTP 404 on GitHub Pages
- **Problem:** measured on the live site: every route except `/` returned 404.
- **Cause:** GitHub Pages has no rewrites; 0.1.0 relied on `404.html` being a copy of the app.
- **Change:** `scripts/spa-fallback.mjs` writes `index.html` for each of the 14 known routes (10 static, 4 sample traces) plus `404.html` for everything else. Favicon path made base-aware (`/favicon.svg` → `/tracedetective/favicon.svg` in the build) so it resolves from nested routes.
- **Verified by:** `e2e/smoke.spec.ts` "every route returns HTTP 200 on a direct load and a refresh…" run against `scripts/pages-sim.mjs`, which mimics GitHub Pages (directory index with slash redirect, 404.html with status 404). Live confirmation pending deploy.

### F5. Disabled and misleading actions
- **Change:** "Expand all" appears only when something is collapsed, "Collapse all" only when there is something to collapse. "Validate pasted JSON" is always enabled; an empty paste explains the problem. "Planned" labels removed from README, Docs, launch checklist.
- **Files:** `src/app/pages/TraceView.tsx`, `src/app/pages/Analyze.tsx`, `README.md`, `src/app/pages/Docs.tsx`, `docs/launch-checklist.md`

### F6. Browser tests could not run against the live site
- **Cause:** absolute paths (`/analyze`) ignore the `/tracedetective/` sub-path; webServer always started.
- **Change:** relative routes, `BASE_URL` support (no local server), `ALL_BROWSERS=1` for Firefox, WebKit and iPhone, shared helpers that collect console errors, page errors, failed requests and HTTP ≥ 400 responses. New suites: onboarding, URL check, accessibility, drag and drop, print, skip link, mobile menu, not-found. Workflow `live-smoke.yml` runs after each Pages deploy and daily; CI uploads the HTML report on failure. Pages deploys on push to `main`.
- **Files:** `playwright.config.ts`, `e2e/*`, `.github/workflows/*`, `scripts/pages-sim.mjs`

## P1

### F7. Native OTLP import
- **Change:** `convertOtlp` handles `resourceSpans` with `scopeSpans` or legacy `instrumentationLibrarySpans`, Tempo `batches` and `trace.resourceSpans`, hex or base64 IDs, nanosecond strings or numbers (BigInt, no precision loss at epoch scale), integer or string kind/status enums, all AnyValue types, exception events, status message. Collector JSON Lines are merged. Spans without IDs or with end < start are skipped with a warning; several traces → largest opened with a warning; attributes over 64 dropped with a warning; names clipped to 512. The result goes through the same validation and redaction as native files.
- **Files:** `src/core/otlp.ts`, `src/core/schema.ts`, removed `src/app/otlpSnippet.ts` and its test (no longer needed).
- **Verified by:** `tests/otlp.test.ts` (11), `ui.test.tsx` "imports pasted OTLP JSON", `e2e` "drag and drop imports an OTLP JSON file".

### F8. Engine edge cases
- **Change:** warning `implausible_window` when a trace spans more than 24 hours. Six new tests (see AUDIT_REPORT §4).
- **Files:** `src/core/schema.ts`, `tests/engine-edge.test.ts`

### F9. Accessibility defects found by axe-core
| Rule | WCAG | Where | Fix |
| --- | --- | --- | --- |
| `link-in-text-block` | 1.4.1 | 9 pages | Links underlined by default (`src/index.css`) |
| `label-content-name-mismatch` | 2.5.3 | timeline items | Removed `aria-label`; name now comes from visible text plus visually hidden start time and critical-path time; ERR badge readable as "ERROR" |
| `scrollable-region-focusable` | 2.1.1 | tables on Compare, Reports, Docs, service table; code blocks | `tabIndex=0`, `role="region"` and a label |
| (manual) skip link not first Tab stop | 2.4.1 | all pages | Focus moves to `<main>` only on navigation, not on the first load |

Verified by `e2e/a11y.spec.ts` on 12 pages × 3 viewports, and `smoke.spec.ts` skip link test.

### F10. Security hardening
- CSP meta tag in production builds (Vite plugin in `vite.config.ts`); `public/_headers` for header-capable hosts; `<meta name="referrer" content="no-referrer">`.
- URL input refuses credentials and secret-looking parameters (`token`, `key`, `sig`, `password`, `session`, `auth`, …).
- `npm audit`: 0 vulnerabilities. Secret scan of the working tree (Google, GitHub, Slack and OpenAI-style keys, private keys, `.env` files): none found.
- Docs: `SECURITY.md`, `PRIVACY.md`, in-app Docs (URL check, OpenTelemetry import, Privacy, Security sections).

### F11. Smaller fixes
- `normalizeUrl("localhost:8080")` treated `localhost:` as a scheme; now `host:port` input gets `https://` and is then refused or accepted correctly (test added).
- URL results said "— in 1 requests" when PSI returned no byte weight; now "—", with correct plural.
- Landing and README copy describe the URL check and OTLP import.
- Version 0.2.0 in `package.json` and report provenance; CHANGELOG entry.

## 0.2.1: failures from the first live run

The `live-smoke.yml` run after the 0.2.0 deploy (Chromium desktop, tablet and Pixel 7, Firefox, WebKit, iPhone 14) failed 9 tests. Each was reproduced locally where the engine allowed it, fixed, and re-tested.

| # | Failure in the live run | Cause | Change | Reproduced here |
| --- | --- | --- | --- | --- |
| L1 | About page overflowed by 39 px (Pixel 7) and 60 px (iPhone 14) | The repository URL is only shown when `VITE_REPO_URL` is set, which the Pages build does and local test builds did not. The unbreakable URL widened a grid column. | `minmax(0,1fr)` column and `break-all` on the link. Local test builds now set `VITE_REPO_URL`. | Yes: 13 px overflow on Pixel 7 before the fix, 0 after |
| L2 | Firefox: CSP violation "blocked a JavaScript eval" | Zod 4 probes `new Function("")` to decide whether to JIT-compile validators. The probe is caught, but Firefox still reports the violation. | `z.config({ jitless: true })` in `src/core/schema.ts`. | Yes: a new `securitypolicyviolation` check in the route test failed in Chromium before the fix and passes after |
| L3 | Firefox: refresh returned 304 | The browser revalidated from its HTTP cache. 304 is a success; the test was too strict. | Test accepts 200 or 304 on refresh (first load must still be 200). | Not reproducible in Chromium |
| L4 | Firefox, WebKit, iPhone: two headings matched "SELECT inventory" | Playwright's substring name match also hit the insight heading. Chromium passed only because of timing. | Exact name match in the test. | Test-only |
| L5 | WebKit, iPhone: Timing-Allow-Origin explanation not found | With mocked responses WebKit exposes a timing breakdown, so the "Not available" text is replaced by the numbers. The app behaved as designed; the test assumed one outcome. | Test accepts either outcome and checks the section heading; the methodology now always states when connection timing is shown. | Not reproducible in Chromium |

Manual checks reported after the 0.2.0 deploy: Start analysis showed three options; the tour opened and Escape closed it; the browser probe succeeded 5/5 on example.com; PageSpeed showed the shared-quota message; `/compare` redirected to `/compare/` and returned 200. The tour did not auto-open in the tester's browser because that profile had already dismissed it. The live first-visit tests, which use a clean browser context, passed in all six projects.
