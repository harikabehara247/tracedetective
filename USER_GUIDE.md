# TraceDetective user guide

TraceDetective helps you find out why a website or API request is slow or failing. It runs in your browser: no account, no install, and trace files never leave your machine.

Open it at https://harikabehara247.github.io/tracedetective/ and choose **Start analysis**.

## Which mode should I use?

| You have… | Use | You get | You do not get |
| --- | --- | --- | --- |
| A public URL that feels slow | **Check website URL** | HTTP status, redirects, server response time, page-load metrics, real-user data when Google has it, your own response times | Anything inside the server (database, queries, code) |
| A trace from OpenTelemetry or another tracer | **Upload trace** | Waterfall, critical path, self time, insights with evidence, comparison | Live monitoring or percentiles across many requests |
| Nothing yet, just curious | **Explore demo** | Four synthetic traces showing common problems | Real measurements |

A common path: website analysis shows the server is slow to respond, so you capture a trace of that request and upload it to see which operation is responsible.

## Analyze website

1. Enter a public address, for example `example.com` or `https://www.example.com/pricing`. `https://` is added if you leave it out.
2. Press **Analyze Website**. There is no account, registration or API key. The test takes 15–60 seconds and you can cancel at any time.
3. Optional, under **Advanced options**:
   - **Test device**: Mobile (the default, a mid-range phone on slow 4G) or Desktop.
   - **Also time the site from my browser**: your browser requests the address 5 times and times each answer from your network. Browsers keep other sites’ responses private (CORS), so this cannot see status codes, redirects or content, and shows DNS, TCP and TLS times only when the site sends a `Timing-Allow-Origin` header. Some sites and browser extensions block it.

**Reading the results**

- *Overview*: HTTP status, redirects, server response time and the Lighthouse performance score.
- *Lab test* (Lighthouse, simulated): one page load in Google’s test environment. Good for finding causes and comparing changes, not a measure of what visitors experience on average.
- *Real users* (Chrome UX Report, last 28 days): what real Chrome users experienced, at the 75th percentile. Only shown when Google has enough visits for the page or site. Low-traffic sites will see "Not available".
- *From your browser*: only when you chose the browser probe.
- *Findings* appear only when a measurement crosses a stated threshold. Each lists its evidence, its source (lab, real users or browser) and what to check next.
- *How these numbers were measured* explains each method.
- **Export Report** saves everything as JSON with the time, tool version and your browser's user agent. **Full report on PageSpeed Insights** opens Google's own report for the same address.

**When the test cannot run**, the page says why and shows no numbers rather than empty or made-up ones:

- *The lab test is unavailable right now*: Google's free quota is used up. Try again later, open the test on the PageSpeed Insights website, or time the site from your browser instead.
- *Please wait a moment* / *The analysis service is busy*: too many tests in the last minute. Wait and try again.
- *Google could not load this page*: the site did not answer Google's test browser (DNS error, timeout, blocked). Check the address.
- *The test took too long*: no result arrived within 90 seconds. Try again.

**What is refused:** local and private addresses (`localhost`, `192.168.x.x`, `10.x.x.x`, `169.254.169.254` and similar), URLs with a username or password, and URLs whose query string looks like it holds a secret (`?token=`, `?key=`, `?sig=`…). Remove the secret and try again.

## Upload trace

Accepted formats (up to 2 MB, 10,000 spans):

- **OpenTelemetry OTLP/JSON** (`{"resourceSpans": [...]}`), hex or base64 IDs.
- **OpenTelemetry Collector file exporter** output (one JSON object per line).
- **Grafana Tempo API** responses (`/api/traces/<id>` and `/api/v2/traces/<id>`).
- **TraceDetective JSON schema 1.0** (see Docs → JSON schema).

Ways to import: drag a file onto the drop area, press **Choose file**, or paste JSON and press **Validate pasted JSON**. You see a preview (name, span and service counts, warnings) before opening it. Problems are explained and name the span at fault, for example a parent that is not in the file.

If a file holds several traces, the one with the most spans opens and a warning names the rest. Attribute values whose keys look sensitive (password, token, cookie, API key…) are replaced with `[redacted]`; still remove secrets before importing.

Imported traces stay in this browser tab until you close it. Remove them sooner under *Imported in this tab*.

**Getting a trace out of your service:** see *Start analysis → How to export a trace* for Collector and Tempo examples.

## The trace workspace

- **Waterfall and tree.** Each row is one operation, indented under its caller, with a bar on a shared timeline. Click a row, or use the keyboard: ↑ ↓ move, → expands or moves to the first child, ← collapses or moves to the parent, Home and End jump.
- **Critical path.** The cyan line under bars marks what the request was waiting on. Making anything else faster will not make the request faster.
- **Filters.** Search by name, service or span ID; pick a service; show errors only or the critical path only. Matching rows keep their parents for context.
- **Span details.** Timing (duration, self time, critical-path time), status, kind and attributes for the selected span.
- **Insights.** Rule-based findings: slow database call, slow external call, error origin, repeated sequential calls (possible N+1), unexplained time. Each shows the evidence, other explanations to consider, what to check next and a caveat. Click a span in the evidence to select it.
- **Time by service.** Total and self time per service.

## Compare two traces

Open **Compare**, pick a baseline (for example a healthy request) and a current trace (the slow one). You see the total change, matched operations with time deltas, operations that appear only in one trace, new errors and resolved errors. **Swap** reverses them. Two single traces show what differed, not why; repeat with more samples before concluding.

## Reports

**Reports** shows a printable summary of one trace. **Print or save as PDF** uses your browser's print dialog. **Export JSON** (also on the trace page) saves the analysis with provenance, so others can see what tool version produced it and whether the data was synthetic.

## Walkthrough

A short tour opens on your first visit. Reopen it with **Take the tour** on Start analysis or in the footer.

## Privacy in one paragraph

Traces are processed in your browser and never uploaded. The only outside requests happen when you analyze a website: the address goes to Google PageSpeed Insights (through the TraceDetective analysis service on the main site), and to the address itself only if you choose the browser probe. The site stores your imported traces for the current tab and a flag that you have seen the tour. No cookies, no analytics. Details: [PRIVACY.md](PRIVACY.md).

## Limits to keep in mind

- Insights are hypotheses with evidence, not proven causes. Confirm with logs, query plans or profiling.
- Only instrumented work is visible. An uninstrumented service or queue can be the real cause.
- Website analysis measures from Google's locations or from your network, not from your users'.
- The demo traces are synthetic.

## Help and feedback

Open an issue on GitHub: https://github.com/harikabehara247/tracedetective/issues. Security problems: see [SECURITY.md](SECURITY.md).
