# Case study: external timing of hview.in

**Target:** https://hview.in/ (home page)
**Date:** 19 November 2026, 04:23–04:42 UTC, two sessions
**Measured by:** TraceDetective project (Harika Behara, maintainer)
**Raw data:** [navigation-timing.json](navigation-timing.json)

The site was not modified. Only the public home page was requested, 7 times by page loads and 8 times by the cross-origin probe. No login, form or private page was touched.

## What this study can and cannot say

This is an **outside-in** measurement. It shows how long the server took to start answering and how long the page took to load in one browser on one network. It **cannot** show why: there is no visibility into PHP execution, database queries, caching inside the application or hosting configuration. The response headers name the server software (below), but nothing here is evidence about the code or queries behind it. To find internal causes, the site owner would need server-side traces or logs, which can be analysed with TraceDetective's Upload mode.

## Environment

| Item | Value |
| --- | --- |
| Browser | Claude desktop app browser pane, Chromium engine (Chrome 156.0.8078.75), Windows 10 x64 |
| Network | Not measured independently. Browser estimate (`navigator.connection`): effective type 4g, RTT 50 ms, downlink 10 Mbps |
| Location | Not recorded (the measurement device's location is not part of the data) |
| Pane state | Session 1: in the background (`document.hidden` true). Session 2: visible |
| Cache | Each run used a unique query string (`?td_run=N`) so the HTML document was fetched fresh. Sub-resources could come from the browser cache after the first run |

## Method

1. **Page loads.** Navigate to the URL, then read the Navigation Timing Level 2 entry (`performance.getEntriesByType('navigation')`): status, protocol, DNS, connect, TLS, time to first byte (from navigation start), request-to-first-byte, download, DOMContentLoaded and load event end, transfer size.
2. **Cross-origin probe.** From the TraceDetective origin (`harikabehara247.github.io`), `fetch(url, {mode: 'no-cors', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'})`, timed with `performance.now()`. This is the same method as the app's browser probe.
3. **PageSpeed Insights.** One keyless API request per session.

## Results

### Document response (Navigation Timing)

| Run | Time (UTC) | Connection | Status | Protocol | TTFB | Request → first byte | DOMContentLoaded | Load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 04:24:22 | new (connect 58 ms incl. TLS 57.5 ms) | 200 | h3 | 234.6 ms | 171.2 ms | 636.6 ms | 1,318.9 ms |
| 2 | 04:24:45 | reused | 200 | h3 | 97.6 ms | 89.9 ms | 184.0 ms | 371.1 ms |
| 3 | 04:24:49 | reused | 200 | h3 | 89.9 ms | 80.7 ms | 177.1 ms | 288.8 ms |
| 4 | 04:24:54 | reused | 200 | h3 | 101.9 ms | 92.2 ms | 176.2 ms | 271.9 ms |
| 5 | 04:24:58 | reused | 200 | h3 | 103.2 ms | 94.2 ms | 193.8 ms | 300.3 ms |
| 6 | 04:41:25 | new (connect 67 ms) | 200 | h3 | 171 ms | – | 571 ms | 1,240 ms |
| 7 | 04:41:33 | reused | 200 | h3 | 118 ms | 112 ms | 205 ms | 373 ms |

DNS was 0 ms in every run (the name was already resolved). No redirects. HTML transfer about 115.7 KB (Brotli). First full load: 47 resources, 952,282 bytes transferred (run 1); 45 resources in run 6.

**Summary of repeats:**
- TTFB with a reused connection (runs 2–5, 7): 89.9–118 ms, median **101.9 ms**.
- TTFB with a new connection (runs 1, 6): 234.6 ms and 171 ms. Connection setup (TCP/QUIC + TLS) accounted for about 58–67 ms of that.
- Load event with a reused connection: 271.9–373 ms, median **300.3 ms**. With a new connection (runs 1 and 6): 1,240–1,319 ms.

### Cross-origin probe (as the app measures)

| Session | Request 1 | Repeats |
| --- | --- | --- |
| 1 (≈04:23) | 279 ms | 98, 87 ms |
| 2 (04:41:09) | 189.2 ms | 105, 88.6, 88.5, 82.3 ms (median 88.6 ms) |

No timing breakdown was available because the site does not send `Timing-Allow-Origin`, exactly as the app reports.

### Response headers (document)

`server: hcdn`, `cache-control: no-store, no-cache, must-revalidate`, `content-encoding: br`, `x-powered-by: PHP/8.3.36`. No `Timing-Allow-Origin`, no `Access-Control-Allow-Origin`.

### PageSpeed Insights

Both attempts (≈04:23 and 04:41:02 UTC) returned **HTTP 429**: the shared keyless daily quota was exhausted. No Lighthouse or Chrome UX Report data was collected, so there are **no FCP, LCP, TBT, CLS or field-data figures** in this study.

### Paint metrics

Not recorded. In session 1 the pane was hidden; in session 2 the embedded browser did not emit `paint` or `largest-contentful-paint` entries.

## Observations (limited to what was measured)

1. The server answered every request with HTTP 200 over HTTP/3 with no redirects.
2. With a warm connection, the time from sending the request to the first byte was consistently about 80–112 ms in this environment.
3. The first visit cost noticeably more: roughly 60 ms of connection setup plus a slower first response, and about 1.2–1.3 s to the load event, versus about 0.3 s on repeat loads. The first load transferred about 0.95 MB in 45–47 requests; repeat loads could reuse cached sub-resources, which is a likely but unconfirmed reason for most of the difference.
4. The HTML is sent with `no-store, no-cache`, so browsers and shared caches will not reuse it. Whether that is intended, and whether the HTML is cached at the CDN edge, cannot be determined from outside.

## Limitations

- One device, one network, one location, about 20 minutes. Not representative of all users.
- 7 page loads and 8 probe requests are a small sample. Values can change with time of day, CDN node and server load.
- The browser pane is an embedded Chromium, not a standalone Chrome install.
- No lab or field Core Web Vitals (PSI unavailable).
- Nothing here describes server-side internals.

## How to repeat

1. Open TraceDetective → Start analysis → Check website URL.
2. Enter `hview.in`, keep both methods, add a PageSpeed API key, run on Mobile and on Desktop.
3. Export JSON for each run and keep them with this study. Repeat at different times of day.
