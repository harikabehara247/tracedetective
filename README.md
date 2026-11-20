<p align="center"><img src="public/logo.svg" alt="TraceDetective" width="480"></p>

# TraceDetective

**Find the bottleneck. Understand the cause. Fix it faster.**

TraceDetective is a free, open-source tool for investigating slow web pages. Paste any public URL, on any platform, and see how the page performed on mobile and desktop, where the measured time went while it loaded, which evidence points to the biggest delays, and what to check first. No account, API key, source code, trace file or plugin is needed.

A URL check shows what a visitor's browser can observe. It cannot identify an internal database query or code function; that needs an instrumented trace. If your application records traces, the optional **Investigate a trace** path shows a nested waterfall, the critical path, time by service and rule-based insights. Traces are analysed in your browser and never uploaded.

It is an investigation aid, not a production monitoring system. Findings state what was measured; possible causes are labelled as hypotheses to verify.

## Features

| Feature | Status |
| --- | --- |
| Four synthetic example scenarios (healthy, slow database, slow external call, failing dependency) | Available |
| JSON import by file, drag and drop or paste, with schema and structure validation | Available |
| Waterfall and span tree in one keyboard-navigable view, with span details | Available |
| Exclusive (self) time and critical path that handle concurrent spans correctly | Available |
| Rule-based insights with evidence, alternative explanations, next checks and caveats | Available |
| Two-trace comparison with matched spans, deltas, added/removed spans and new errors | Available |
| JSON export with provenance, and a print-friendly report (save as PDF from the browser) | Available |
| Native OpenTelemetry import: OTLP/JSON, Collector file exporter JSON Lines, Grafana Tempo API responses | Available |
| **Analyze a website** (primary): HTTP status, redirects, final URL and server response time; Lighthouse lab results for mobile and desktop; Chrome real-user data with its 28-day window, shown separately | Available. No account or API key: the project's analysis service holds the key on the server. |
| Where the time went: the LCP time split into server response, resource discovery, resource download and rendering, plus main-thread blocking time, when PageSpeed returns them | Available |
| Screenshot, loading filmstrip, request waterfall (type, size, timing, render-blocking and LCP marked) and the LCP element with its file, when PageSpeed ties them together | Available |
| Ranked findings with the measurement, its source, the loading stage, why it may matter, a next check, and possible causes marked as hypotheses | Available |
| Platform detection from the platform's own file locations (WordPress, Elementor, Shopify, Next.js, Nuxt, Drupal, Squarespace, Wix, Webflow), with the method shown. Advice is platform-neutral unless a platform is detected or chosen | Available |
| Share link, rerun, mobile/desktop comparison, Export Report and print | Available |
| DNS / TCP / TLS breakdown for a URL | Only when the target sends `Timing-Allow-Origin` |
| Guided first-visit walkthrough, a "What is a trace?" introduction with a synthetic sample to open or download | Available |
| Live ingestion, storage, alerting | Not planned |

## Quick start

Requirements: Node.js 22 or later.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit and component tests (Vitest)
npm run build        # static site in dist/
npm run test:e2e     # browser tests at desktop, tablet and phone sizes (Playwright)
```

`npm run test:e2e` needs a Chromium build for Playwright (`npx playwright install chromium` if you do not have one).

Test a deployed site, in Chromium, Firefox and WebKit:

```bash
BASE_URL=https://harikabehara247.github.io/tracedetective/ ALL_BROWSERS=1 npx playwright test
```

Simulate GitHub Pages locally (sub-path, directory indexes, real 404 status):

```bash
BASE_PATH=/tracedetective/ npm run build:pages && node scripts/pages-sim.mjs /tracedetective/ 4174
BASE_URL=http://localhost:4174/tracedetective/ npx playwright test
```

See [USER_GUIDE.md](USER_GUIDE.md) for a walkthrough of every feature.

## Trace format

TraceDetective reads OpenTelemetry OTLP/JSON directly (see `/docs#otlp`) and its own small JSON schema (version 1.0). The full reference is on the Docs page in the app (`/docs#schema`). A minimal example:

```json
{
  "schemaVersion": "1.0",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "name": "Checkout request",
  "synthetic": false,
  "spans": [
    { "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "spanId": "a1", "name": "POST /checkout",
      "service": "api", "kind": "server", "startTimeMs": 0, "durationMs": 220, "status": "ok", "attributes": {} }
  ]
}
```

Limits: 2 MB per file, 10,000 spans, 64 attributes per span. Duplicate IDs, missing parents, cycles, mismatched trace IDs and negative durations are rejected with a message naming the span.

## Architecture

```
src/
  core/          Pure TypeScript, no DOM: schema (Zod), OTLP conversion, span forest,
                 timing, critical path, diagnostics, comparison, report export,
                 URL normalisation, PageSpeed parsing and client, browser probe, URL findings
  fixtures/      The four synthetic sample traces (generated by scripts/generate-fixtures.py)
  app/           React UI: routes, layout, pages, components, trace store
tests/           Vitest unit and component tests, malformed fixtures
e2e/             Playwright smoke tests
scripts/         Fixture generator, GitHub Pages route pages, GitHub Pages simulator
worker/          Analysis service: Cloudflare Worker that adds the PageSpeed API key server-side
```

- **Self time** = span duration minus the union of its direct children's intervals, clipped to the span. Overlapping children are counted once.
- **Critical path** walks backwards from the end of the root: at each point it follows the child that finished last, then continues from that child's start. Segments always sum to the trace duration. The walk is iterative, so very deep or very wide traces do not overflow the stack (tested with 9,000 levels and 5,000 siblings).
- **Diagnostics** are fixed, documented rules (`src/core/diagnostics.ts`). Thresholds are exported as `RULE_THRESHOLDS`.
- **Comparison** matches spans by their ancestry path plus their position among same-named siblings.

The app is a static single-page app. The only server-side part is the analysis service in `worker/`, which adds the project's PageSpeed Insights key, validates the address, rate-limits and caches, and only ever calls Google, so there is nothing that could be made to fetch internal addresses. Without it, the app calls Google's keyless endpoint directly. Imported traces are kept in `sessionStorage` for the current tab only.

## Deployment

The build is a static site.

- **Cloudflare Pages:** build command `npm run build`, output directory `dist`. `public/_redirects` handles client-side routes.
- **GitHub Pages:** `.github/workflows/pages.yml` deploys on every push to `main` (and on demand). It builds with `BASE_PATH=/<repo>/`, writes an `index.html` for every known route so deep links and refreshes return HTTP 200, and copies `index.html` to `404.html` for anything else. `.github/workflows/live-smoke.yml` then runs the browser suite against the live site in Chromium, Firefox and WebKit, and again daily.

Set `VITE_REPO_URL` at build time to show GitHub links in the app. Without it, the links are hidden.

**Analysis service (optional, recommended):** `.github/workflows/deploy-proxy.yml` deploys `worker/` to Cloudflare Workers with the Google API key stored as a Worker secret. Set the repository variable `PSI_PROXY_URL` to its URL and the Pages build passes it to the app as `VITE_PSI_PROXY_URL`. Setup steps: [worker/README.md](worker/README.md).

## Limitations

- One trace at a time. No latency percentiles across requests.
- Insights only see instrumented work. An uninstrumented component can be the true cause.
- Website analysis sees only what a client sees. It never reports database or code-level causes.
- The built-in examples are synthetic. They are not benchmarks or measurements of a real system.
- See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE). Created and maintained by Harika Behara.
