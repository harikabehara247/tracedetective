# TraceDetective audit report

**Version audited:** 0.1.0 (commit `0df37a2`, live at https://harikabehara247.github.io/tracedetective/)
**Fixed in:** 0.2.0 (branch `audit-release-readiness`)
**Date:** 19 November 2026
**Maintainer:** Harika Behara

This report lists what was checked, what was found and what was done. Every "verified" item was checked by a test or a measurement that was actually run; see [TEST_RESULTS.md](TEST_RESULTS.md). Fix details are in [FIX_LOG.md](FIX_LOG.md).

## Summary

| Area | Priority | Finding in 0.1.0 | Status in 0.2.0 |
| --- | --- | --- | --- |
| URL analysis | P0 | Users could not check a URL at all; the mode said "Planned, not available yet". | Fixed. Working URL check (PageSpeed Insights + browser probe) with validation, methodology, findings and export. |
| Onboarding | P0 | No single starting point; four tabs including a non-functional one; the SDK guide competed with real modes. | Fixed. "Start analysis" chooser with three modes and can/cannot lists, first-visit walkthrough. |
| Deep links on GitHub Pages | P0 | Every route except `/` returned **HTTP 404** on a direct load or refresh (measured on the live site, 04:40 UTC). The page rendered only because 404.html is a copy of the app. | Fixed. Per-route `index.html` files; verified HTTP 200 for all 15 routes on a GitHub Pages simulation. Needs redeploy to take effect live. |
| Disabled or misleading actions | P0 | "Expand all" shown disabled; "Validate pasted JSON" disabled until input; URL mode with no function. | Fixed. Actions are shown only when they do something; paste explains an empty input. |
| Automated browser tests | P0 | 7 smoke tests, local only, root-path URLs (could not run against the `/tracedetective/` sub-path). | Fixed. 21 tests × 3 viewports, runnable against any base URL, optional Firefox/WebKit, a GitHub Pages simulator, and a post-deploy/daily live workflow. |
| OTLP import | P1 | OTLP files rejected with "not supported yet"; users had to run a script. | Fixed. Native OTLP/JSON, Collector JSON Lines and Tempo v1/v2 import, with 11 tests. |
| Trace engine | P1 | Core cases were already tested. Gaps: infinite timestamps, mixed time units, file order independence, sibling reordering in compare. | Added 6 tests; added a warning for windows over 24 h. No engine bugs found. |
| Accessibility | P1 | axe-core found: links distinguishable by colour only (WCAG 1.4.1) on 9 pages; timeline items whose accessible name did not contain the visible text (2.5.3); scrollable tables and code blocks not keyboard-focusable (2.1.1). Skip link was not the first Tab stop because focus moved to `<main>` on load. | Fixed and covered by an axe-core test on 12 pages × 3 viewports. |
| Security | P1 | No CSP. Otherwise sound: no HTML injection paths, JSON only parsed, limits enforced. | CSP added. URL input hardening added (private ranges, credentials, secret-looking params). |
| Privacy | P1 | Accurate for 0.1.0. | Updated for the URL check's third-party request and the walkthrough flag. |
| hview.in case study | P1 | Not started. | Done with real measurements from two sessions; see [HVIEW_CASE_STUDY.md](../case-studies/hview-2026-11-19/HVIEW_CASE_STUDY.md). PageSpeed data could not be collected (quota). |

**Release readiness:** all automated checks pass on the 0.2.0 build (108 unit and component tests, 62 browser tests in Chromium at three viewports, locally and on a GitHub Pages simulation). The live site still runs 0.1.0 until the branch is merged and deployed. Release is ready once the post-deploy live workflow passes on the real URL; until that run, treat the live behaviour of the deep-link fix and the cross-browser runs (Firefox, WebKit) as **not yet verified**.

## 1. Onboarding (P0)

**Checked:** the landing page, the Analyze page and every action on them, as a first-time visitor.

**Found:** the primary CTA went straight to a demo trace; "Analyze a trace" went to Upload; the Analyze page had four tabs (demo, upload, URL, SDK guide), one of which could not do anything. Nothing explained which mode fits which problem.

**Done:**
- `/analyze` is now **Start analysis**: three cards (Check website URL, Upload trace, Explore demo), each with "It can" and "It cannot" lists and one button.
- Landing CTA is **Start analysis**; the three entry cards match the three modes.
- A five-step walkthrough opens on the first visit to the home page. It is an accessible modal (focus moves in, Tab is trapped, Escape closes, focus returns), it is remembered in `localStorage` (wrapped in try/catch, so blocked storage never causes a loop), and it can be reopened from Start analysis and the footer.
- The instrumentation guide is no longer a tab; it is linked from Start analysis and Upload.

## 2. URL analysis (P0)

**Constraint:** no unrestricted server-side fetching. The project has no server, and adding one only for this would create an SSRF surface. The brief allowed an established measurement service instead.

**Design:**

| Need | How it is met | Limits stated in the UI |
| --- | --- | --- |
| Validation and normalisation | `normalizeUrl`: trims, adds `https://` (also for `host:port`), http/https only, max 2,048 chars, no credentials, no secret-looking query parameters, fragment removed, non-standard port noted | Error text names the problem |
| Refuse local/private targets | Loopback, RFC 1918, CGNAT, link-local incl. `169.254.169.254`, multicast/reserved, IPv6 ULA/link-local/mapped, integer/hex IPs, single-label and `.local/.internal/.lan/.home.arpa` names | "Only public websites can be checked" |
| HTTP status, redirects | PageSpeed Insights main document request and `redirects` audit | Browser probe states status is not visible (opaque) |
| Response timing | PSI `server-response-time`; browser probe: 5 sequential requests, median, first vs repeats | Methodology panel on every result |
| DNS/TLS | Shown only if the target sends `Timing-Allow-Origin` | Otherwise "Not available" with the reason |
| Page metrics | PSI lab FCP, LCP, TBT, CLS, Speed Index, weight, score; CrUX field data (URL or origin) | Field data "Not available" when Google has none |
| Loading, failure, timeout | Elapsed-time indicator, Cancel, 90 s PSI timeout, 10 s per probe request; errors for quota (429), Lighthouse load failure, invalid request, timeout, network | Each error explains what to do |
| Findings | Only when a measured value crosses a published threshold; each lists evidence and next checks; server-side causes explicitly out of scope | "An external test cannot see which code or query is slow" |
| Export | JSON with provenance (tool version, times, user agent, notice), inputs, raw summaries and findings | |

**Known limitation (verified):** the shared keyless PSI quota returned HTTP 429 on 19 November 2026 at 04:23 and 04:41 UTC. The UI explains this and offers an optional API key field (password input, never stored). The browser probe works without any key.

## 3. Browser tests against the live URL (P0)

**Measured on the live 0.1.0 site (Claude desktop browser, Chrome 156, 04:40 UTC):** `/` 200; `/about`, `/analyze`, `/analyze/demo`, `/analyze/sdk`, `/analyze/upload`, `/analyze/url`, `/compare`, `/docs`, `/examples`, `/reports`, `/trace/sample-slow-database` and `/does-not-exist` all **404**. JS, CSS and favicon 200. No CSP meta tag.

The app rendered on those URLs because `404.html` is the app, but search engines, link checkers and monitoring treat 404 as broken, and some clients show an error.

**Suite now covers:** every route on direct load and refresh (status 200, `h1` visible, no horizontal scroll), console errors and uncaught exceptions, failed same-origin assets, the not-found page, sidebar and mobile navigation, skip link, mobile menu with Escape, waterfall keyboard navigation, filters, file upload (valid and invalid), drag and drop (OTLP), paste, all four demo traces, compare, JSON export, print layout, onboarding, URL check (mocked PSI success, 429, unreachable target, private-address refusal) and axe-core.

Runs: locally (`npm run test:e2e`), against any URL (`BASE_URL=…`), in Firefox/WebKit/iPhone (`ALL_BROWSERS=1`), and automatically after each Pages deploy and daily (`.github/workflows/live-smoke.yml`). The container used for this audit cannot reach github.io, so the live run must happen in GitHub Actions after deploy.

## 4. Trace engine verification (P1)

| Case | Test |
| --- | --- |
| Nested and overlapping children | `exclusiveTime` cases; new nested-overlap test (self time 20/20/50 ms, critical path sums to 100 ms) |
| Concurrency and critical path | last-finishing child, sequential children, clipping, multiple roots, sum = duration for every sample |
| Exclusive time never negative | existing |
| Invalid timestamps | strings and `NaN` rejected; **new:** `1e400` (Infinity) rejected; **new:** window > 24 h warns |
| Missing parents, duplicates, cycles, self-parent, trace ID mismatch | existing; also via OTLP |
| Deep and wide traces | 9,000-level chain, 5,000 siblings |
| File order independence | **new:** reversed span array gives identical tree, critical path and findings |
| Compare added/removed | existing |
| Compare reordered siblings | **new:** siblings swapped in time still match, with correct deltas |
| Compare repeated calls | **new:** 2 vs 4 identical calls → 2 matched, 2 added |

No engine defects were found.

## 5. User features (P1)

All verified in the browser suite or component tests: file import, drag and drop, paste, four examples, waterfall, span tree, keyboard navigation, filters, compare (including swap), insights with evidence links, JSON export with provenance, print layout. OTLP import is new and tested at unit, component and browser level.

## 6. Security and privacy (P1)

| Check | Result |
| --- | --- |
| Dependencies | `npm audit`: 0 vulnerabilities (all and production-only), 19 Nov 2026 |
| XSS / JSON rendering | No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in `src/`. All trace values rendered as React text. IDs restricted to `[A-Za-z0-9._:-]`. `<script>` as a span ID is rejected (test). |
| Storage | `sessionStorage` `tracedetective:imports` (imported traces, this tab); `localStorage` `td:tour-done`. Nothing else. |
| Third-party requests | None on load. Only on "Run check": `www.googleapis.com` (if PSI selected) and the user's URL (if probe selected). External links use `rel="noopener noreferrer"`; site-wide `referrer: no-referrer`. |
| File limits | 2 MB, 10,000 spans, 512-char names, 1,024-char values, 64 attributes (also enforced for OTLP with warnings) |
| Sensitive data | Attribute redaction by key on import (also for OTLP); URLs with secret-looking params refused |
| CSP | Added (meta tag in build): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'none'`. `'unsafe-inline'` styles are needed for computed bar positions. `connect-src https:` is needed for the browser probe. `frame-ancestors` cannot be set by meta tag; `_headers` sets it on hosts that support headers. GitHub Pages cannot set response headers. |
| Secrets in repo | Scan for keys, tokens and `.env` files before packaging: none found (see FIX_LOG). |

## 7. Open items

1. **Deploy and run the live workflow.** The deep-link fix, CSP and all new features reach users only after merge and deploy. The live run then confirms them in Chromium, Firefox and WebKit.
2. **Orphan spans.** Traces with a parent missing from the file are rejected (current policy). Partial exports are common with OpenTelemetry. An option to show orphans as extra roots with a warning is a reasonable next step; it needs a product decision.
3. **PageSpeed quota.** Keyless PSI is unreliable. A project-owned API key restricted by HTTP referrer to the Pages domain would make PSI work for everyone without exposing a usable secret; it must be created in the owner's Google Cloud account.
4. **Bundle size.** 504 KB JS (about 149 KB gzip) in one chunk. Route-level code splitting would help the first load.
5. **FCP/LCP for hview.in.** Not recorded (the embedded browser did not emit paint entries, and PSI was over quota). Re-run with a PSI key.
