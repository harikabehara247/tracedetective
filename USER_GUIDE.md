# TraceDetective user guide

TraceDetective helps you find out why a web page is slow. Paste any public URL, on any platform: no account, API key, source code, trace file or plugin. Trace files, if you use them, are analysed in your browser and never leave your machine.

Open it at https://harikabehara247.github.io/tracedetective/ and paste a URL on the home page, or choose **Analyze a website**.

## Which mode should I use?

| You have… | Use | You get | You do not get |
| --- | --- | --- | --- |
| A public URL that feels slow | **Analyze a website** (start here) | Mobile and desktop lab results, where the time went, a screenshot and filmstrip, every request, the LCP element, real-user data when Google has it, and ranked findings | Anything inside the server (code, functions, database queries) |
| A trace from OpenTelemetry or a tracing tool | **Investigate a trace** (advanced) | Waterfall, critical path, self time, insights with evidence, comparison | Live monitoring or percentiles across many requests |
| Nothing yet, just curious | **Explore demo traces** | Four synthetic traces showing common problems | Real measurements |

A common path: the website report shows the server is slow to respond, so you capture a trace of that request in your application and import it to see which measured step took the time.

## Analyze a website

1. Paste a public address, for example `example.com` or `https://www.example.com/pricing`. `https://` is added if you leave it out.
2. Choose **Mobile** (a mid-range phone on slow 4G, the default) or **Desktop**, and press **Analyze Website**. The test takes 15–60 seconds and you can cancel at any time.
3. Optional, under **Advanced options**:
   - **Platform-specific notes**: advice is platform-neutral by default. Choose a platform (currently WordPress) to add its notes to findings even when it is not detected.
   - **Also time the site from my browser**: your browser requests the address 5 times and times each answer from your network. Browsers keep other sites’ responses private (CORS), so this cannot see status codes, redirects or content, and shows DNS, TCP and TLS times only when the site sends a `Timing-Allow-Origin` header. Some sites and browser extensions block it.

The report's address is a share link: opening it runs the same check (results are reused for 15 minutes). **Run a fresh test** skips that reuse after you change the site. **Test on desktop** / **Test on mobile** runs the other device and adds a side-by-side comparison.

**Reading the report**

- *Summary*: score, HTTP status, redirects, server response time, page weight, the final address, and the platform if one was detected, with the detection method and an example file. A platform is named only when files from its own locations appear in the request list (for example `/wp-content/`, `/_next/static/`, `cdn.shopify.com`); otherwise the report says it was not identified.
- *Where the time went*: the time until the main content appeared (LCP), split into server response, resource discovery, resource download and rendering, as PageSpeed measured it, plus main-thread blocking time. If PageSpeed does not return the split, the report says so and links to its LCP breakdown.
- *What to check next*: ranked findings. Each one shows what was measured, its source (lab test, request log, real users or your browser), the loading stage it concerns, why it may matter, a practical next step, and possible causes marked as hypotheses. Savings figures are PageSpeed's own estimates and are labelled as such.
- *What the test browser saw*: the final screenshot and the loading filmstrip.
- *Lab test* (Lighthouse, simulated) and *Real users* (Chrome UX Report, the 28-day window shown when Google returns it): kept separate. Low-traffic sites will see "Not available" for real users.
- *Main content: the LCP element*: the element, its selector and HTML, and its file only when PageSpeed ties the file to the element (the basis is stated).
- *Requests*: every request in order with type, size, status and observed timing; render-blocking files and the LCP file are marked.
- *What this report can and cannot see* and *How these numbers were measured* explain the limits. A URL check cannot identify an internal database query or code function.
- **Export Report** saves everything as JSON with the time, tool version and your browser's user agent. **Print or save as PDF** prints the report. **Full report on PageSpeed Insights** opens Google's own report for the same address.

**When the test cannot run**, the page says why and shows no numbers rather than empty or made-up ones:

- *The lab test is unavailable right now*: Google's free quota is used up. Try again later, open the test on the PageSpeed Insights website, or time the site from your browser instead.
- *Please wait a moment* / *The analysis service is busy*: too many tests in the last minute. Wait and try again.
- *Google could not load this page*: the site did not answer Google's test browser (DNS error, timeout, blocked). Check the address.
- *The test took too long*: no result arrived within 90 seconds. Try again.

**What is refused:** local and private addresses (`localhost`, `192.168.x.x`, `10.x.x.x`, `169.254.169.254` and similar), URLs with a username or password, and URLs whose query string looks like it holds a secret (`?token=`, `?key=`, `?sig=`…). Remove the secret and try again.

## Investigate a trace

A trace is a timed record of one request moving through an application and its services. It can show which measured steps took time. Your application has to record traces (for example with OpenTelemetry); most sites and frameworks do not do this by default. The **Investigate a trace** page shows an illustration, a synthetic sample you can open at once, and a synthetic OTLP JSON file you can download to try the import.


Accepted formats (up to 2 MB, 10,000 spans):

- **OpenTelemetry OTLP/JSON** (`{"resourceSpans": [...]}`), hex or base64 IDs.
- **OpenTelemetry Collector file exporter** output (one JSON object per line).
- **Grafana Tempo API** responses (`/api/traces/<id>` and `/api/v2/traces/<id>`).
- **TraceDetective JSON schema 1.0** (see Docs → JSON schema).

Ways to import: drag a file onto the drop area, press **Choose file**, or paste JSON and press **Validate pasted JSON**. You see a preview (name, span and service counts, warnings) before opening it. Problems are explained and name the span at fault, for example a parent that is not in the file.

If a file holds several traces, the one with the most spans opens and a warning names the rest. Attribute values whose keys look sensitive (password, token, cookie, API key…) are replaced with `[redacted]`; still remove secrets before importing.

Imported traces stay in this browser tab until you close it. Remove them sooner under *Imported in this tab*.

**Getting a trace out of your service:** see *Investigate a trace → Step-by-step export guide* for OpenTelemetry Collector and Grafana Tempo examples. Jaeger, Zipkin and commercial APM formats are not read directly; if they receive OpenTelemetry data, also send it to a Collector with the file exporter.

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

A short tour opens on your first visit. Reopen it with **Take the tour** on the start page (`/analyze`) or in the footer.

## Privacy in one paragraph

Traces are processed in your browser and never uploaded. The only outside requests happen when you analyze a website: the address goes to Google PageSpeed Insights (through the TraceDetective analysis service on the main site), and to the address itself only if you choose the browser probe. The site stores your imported traces for the current tab and a flag that you have seen the tour. No cookies, no analytics. Details: [PRIVACY.md](PRIVACY.md).

## Limits to keep in mind

- Insights are hypotheses with evidence, not proven causes. Confirm with logs, query plans or profiling.
- Only instrumented work is visible. An uninstrumented service or queue can be the real cause.
- Website analysis measures from Google's locations or from your network, not from your users'.
- The demo traces are synthetic.

## Help and feedback

Open an issue on GitHub: https://github.com/harikabehara247/tracedetective/issues. Security problems: see [SECURITY.md](SECURITY.md).
