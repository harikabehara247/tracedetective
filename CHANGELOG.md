# Changelog

All notable changes are listed here. The format follows Keep a Changelog, and versions follow Semantic Versioning.

## [Unreleased]

## [0.3.0] - 2026-11-19

Website analysis without API keys.

### Added
- Analysis service (`worker/`): a Cloudflare Worker that calls Google PageSpeed Insights with the project's own API key, stored only as a Worker secret. It checks the requesting origin, validates the address with the app's rules, limits each client to 6 and the whole service to 15 analyses a minute, caches successful results for 15 minutes, times out after 80 seconds, removes the key from any error text, writes no logs, and has a `/health` endpoint.
- `Deploy analysis service` workflow: tests, deploys the Worker, stores the key from a GitHub secret and checks `/health`. The Pages build passes the `PSI_PROXY_URL` repository variable to the app.
- Live site checks verify `/health` and run one real, unmocked analysis of example.com, which must show results or a clear explanation.

### Changed
- Website analysis asks only for a URL: enter it and press **Analyze Website**. The API key field is gone. Without the service configured, the app calls Google's keyless endpoint directly, and falls back to it once if the service cannot be reached.
- Mobile/Desktop and the browser probe moved under **Advanced options**. The browser probe is now off by default and explains what CORS lets a browser see.
- Results separate the **Lab test** (Lighthouse, simulated) from **Real users** (Chrome UX Report, last 28 days), with ratings against Core Web Vitals boundaries, an Overview, and a collapsible "How these numbers were measured".
- Errors (quota used up, rate limited, service busy, page could not be loaded, timeout, network) get their own title and message, with Try again, Open on PageSpeed Insights, and Time it from my browser instead. No empty results are shown when nothing was measured.
- **Export Report** replaces Export JSON and records lab and real-user data separately, any error, and how the result was obtained.
- "Check website URL" is now "Analyze website" across the app.

## [0.2.1] - 2026-11-19

Fixes for failures found by the first post-deploy live run of 0.2.0.

### Fixed
- About page overflowed horizontally on phones when the repository link is shown (production builds only).
- Zod's optional JIT probe (`new Function`) triggered a Content Security Policy violation, reported by Firefox. Validation now runs in jitless mode.
- Browser tests: accept HTTP 304 on refresh, use exact heading names, and accept either a timing breakdown or its explanation in the URL check.

### Added
- Browser tests fail on any Content Security Policy violation event, in every engine.
- Local browser tests build with the repository link set, like the Pages build.
- The URL check methodology states when DNS/TCP/TLS times are shown.


## [0.2.0] - 2026-11-19

### Added
- Start analysis page with three modes (Check website URL, Upload trace, Explore demo), each listing what it can and cannot do.
- Working URL check: input validation and normalisation, private/local address refusal, Google PageSpeed Insights (lab and field data, optional API key, 90 s timeout, clear quota/timeout/network errors), a 5-request browser probe, evidence-backed findings, methodology, and JSON export.
- Native OpenTelemetry import: OTLP/JSON (hex or base64 IDs, nanosecond times, int or string enums, legacy key), Collector file exporter JSON Lines, Grafana Tempo v1/v2 responses.
- First-visit guided walkthrough, reopenable from Start analysis and the footer.
- Warning for traces longer than 24 hours (mixed time units).
- Content Security Policy in production builds; `_headers` for hosts that support headers.
- Browser tests for every route (direct load and refresh), console errors, failed assets, onboarding, the URL check (mocked), keyboard skip link and mobile menu. Can run against a live URL, in Firefox and WebKit too, and on a GitHub Pages simulation.
- Live-site workflow that runs after each Pages deploy and daily.

### Changed
- GitHub Pages deep links and refreshes now return HTTP 200 (per-route `index.html`), instead of 404.
- Pages deploys on every push to `main`.
- "Expand all" and "Collapse all" show only when they do something; the paste button is always enabled and explains an empty paste.
- The skip link is the first Tab stop on page load.
- The instrumentation guide replaces the conversion script with export options, now that OTLP is imported directly.


## [0.1.0] - unreleased

### Added
- TraceDetective JSON schema 1.0 with Zod validation, structural checks (duplicates, missing parents, cycles, trace ID mismatch) and clear error messages.
- Span forest, exclusive time using the union of child intervals, and an iterative critical-path algorithm.
- Diagnostic rules: slow database call, slow external call, erroring dependency, repeated sequential calls, unexplained time.
- Two-trace comparison with matched spans, deltas, added and removed spans and new errors.
- Four synthetic sample traces.
- Pages: landing, analyze (demo, upload, URL check placeholder, SDK guide), examples, trace workspace, compare, reports, docs, about and 404.
- JSON export with provenance and a print-friendly report.
- Vitest unit and component tests and Playwright smoke tests.
