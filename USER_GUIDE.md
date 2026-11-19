# TraceDetective user guide

TraceDetective helps you find out why a website or API request is slow or failing. It runs in your browser: no account, no install, and trace files never leave your machine.

Open it at https://harikabehara247.github.io/tracedetective/ and choose **Start analysis**.

## Which mode should I use?

| You have… | Use | You get | You do not get |
| --- | --- | --- | --- |
| A public URL that feels slow | **Check website URL** | HTTP status, redirects, server response time, page-load metrics, real-user data when Google has it, your own response times | Anything inside the server (database, queries, code) |
| A trace from OpenTelemetry or another tracer | **Upload trace** | Waterfall, critical path, self time, insights with evidence, comparison | Live monitoring or percentiles across many requests |
| Nothing yet, just curious | **Explore demo** | Four synthetic traces showing common problems | Real measurements |

A common path: the URL check shows the server is slow to respond, so you capture a trace of that request and upload it to see which operation is responsible.

## Check website URL

1. Enter a URL, for example `example.com` or `https://api.example.com/health`. `https://` is added if you leave it out.
2. Choose the methods:
   - **Google PageSpeed Insights.** Google loads the page in a test browser and reports status, redirects, server response time, FCP, LCP, TBT, CLS, page weight and, when available, 28-day real-user Chrome data. This sends the URL to Google and takes 15–60 seconds.
   - **Browser probe.** Your browser requests the URL 5 times and times each response from your network. No cookies are sent. The status code cannot be read by a web page from another site, so it is shown as not visible.
3. For PageSpeed, pick Mobile or Desktop. If you see "shared free quota is used up", get a free API key from Google (link under the field) and paste it. The key is used only for that request and is not saved.
4. Press **Run check**. You can cancel at any time.

**Reading the results**

- *PageSpeed Insights* and *Browser probe* panels show the raw measurements.
- *Connection timing* shows DNS, TCP and TLS only when the site allows it with a `Timing-Allow-Origin` header. Otherwise it says why it is not available. A first probe request much slower than the repeats usually means connection setup.
- *Findings* appear only when a measurement crosses a stated threshold. Each lists its evidence and what to check next.
- *Methodology* explains exactly how each number was measured.
- **Export JSON** saves everything with the time, tool version and your browser's user agent. **Open full PageSpeed report** opens Google's own report for the same URL.

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

Traces are processed in your browser and never uploaded. The only outside requests happen when you run a URL check: to Google if PageSpeed Insights is selected, and to the URL itself if the browser probe is selected. The site stores your imported traces for the current tab and a flag that you have seen the tour. No cookies, no analytics. Details: [PRIVACY.md](PRIVACY.md).

## Limits to keep in mind

- Insights are hypotheses with evidence, not proven causes. Confirm with logs, query plans or profiling.
- Only instrumented work is visible. An uninstrumented service or queue can be the real cause.
- URL checks measure from Google's locations or from your network, not from your users'.
- The demo traces are synthetic.

## Help and feedback

Open an issue on GitHub: https://github.com/harikabehara247/tracedetective/issues. Security problems: see [SECURITY.md](SECURITY.md).
