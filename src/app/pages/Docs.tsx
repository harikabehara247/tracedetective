import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LIMITS, RULE_THRESHOLDS, formatPct } from '../../core';
import { SITE } from '../config';
import { PageHeader, useDocumentTitle } from '../ui';

const SECTIONS = [
  ['quick-start', 'Quick start'],
  ['url-check', 'Website analysis'],
  ['otlp', 'OpenTelemetry import'],
  ['schema', 'JSON schema'],
  ['timing', 'How timing is calculated'],
  ['rules', 'Insight rules'],
  ['compare', 'Comparison'],
  ['limitations', 'Limitations'],
  ['privacy', 'Privacy'],
  ['security', 'Security'],
  ['contributing', 'Contributing'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-h`} className="scroll-mt-20 outline-none">
      <h2 id={`${id}-h`} className="mb-3 text-xl font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">{children}</div>
    </section>
  );
}

const FIELDS: [string, string, string][] = [
  ['traceId', 'string, required', 'Must match the document traceId. Letters, digits, ".", "_", ":" and "-", up to 128 characters.'],
  ['spanId', 'string, required', 'Unique within the trace. Same character rules as traceId.'],
  ['parentSpanId', 'string, optional', 'Omit or set to null for root spans. Must reference a span in the file.'],
  ['name', 'string, required', 'Operation name, up to 512 characters.'],
  ['service', 'string, required', 'Service that emitted the span.'],
  ['kind', 'enum, optional', 'server, client, internal, producer or consumer. Defaults to internal.'],
  ['startTimeMs', 'number, required', 'Start time in milliseconds. Absolute epoch or relative; only differences matter.'],
  ['durationMs', 'number, required', 'Duration in milliseconds. Zero is allowed, negative is rejected.'],
  ['status', 'enum, optional', 'ok, error or unset. Defaults to unset.'],
  ['attributes', 'object, optional', `String, number or boolean values. Up to ${LIMITS.maxAttributes} per span.`],
];

const EXAMPLE = `{
  "schemaVersion": "1.0",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "name": "Checkout request",
  "synthetic": false,
  "spans": [
    { "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "spanId": "a1",
      "name": "POST /checkout", "service": "api", "kind": "server",
      "startTimeMs": 0, "durationMs": 220, "status": "ok", "attributes": {} },
    { "traceId": "4bf92f3577b34da6a3ce929d0e0e4736", "spanId": "b2", "parentSpanId": "a1",
      "name": "SELECT cart", "service": "api", "kind": "client",
      "startTimeMs": 12, "durationMs": 140, "status": "ok",
      "attributes": { "db.system.name": "postgresql" } }
  ]
}`;

export function Docs() {
  useDocumentTitle('Docs');
  return (
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="On this page" className="no-print mb-6 lg:sticky lg:top-6 lg:mb-0 lg:self-start">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">On this page</h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col">
          {SECTIONS.map(([id, label]) => (
            <li key={id}><Link to={`/docs#${id}`}>{label}</Link></li>
          ))}
        </ul>
      </nav>
      <div className="max-w-3xl space-y-10">
        <PageHeader title="Documentation">How to use {SITE.name}, what it calculates, and what it cannot tell you.</PageHeader>

        <Section id="quick-start" title="Quick start">
          <ol>
            <li>Go to <Link to="/analyze">Start analysis</Link> and pick a mode: check a public URL, import your own trace, or open an <Link to="/examples">example trace</Link>.</li>
            <li>In the timeline, select a span with the mouse or move through spans with the arrow keys. Details and related insights update as you go.</li>
            <li>Read the insights. Each one lists the evidence, other explanations to consider and what to verify next.</li>
            <li>Compare against a healthy trace of the same endpoint on the <Link to="/compare">Compare</Link> page.</li>
            <li>Export JSON or print a report from the <Link to="/reports">Reports</Link> page.</li>
          </ol>
          <p>To run it yourself: <code>npm install</code>, then <code>npm run dev</code>. <code>npm test</code> runs the test suite and <code>npm run build</code> produces a static site in <code>dist/</code>.</p>
        </Section>

        <Section id="url-check" title="Website analysis">
          <p>
            <Link to="/analyze/url">Website analysis</Link> measures a public website from outside. Enter the address and choose Analyze Website. There is no
            account, registration or API key.
          </p>
          <ul>
            <li>
              <strong>Lab test (Lighthouse).</strong> Google PageSpeed Insights loads the page once in Google’s test environment, as a mid-range phone on slow 4G by
              default or as a desktop (Advanced options). It returns HTTP status, final URL, redirects, server response time, FCP, LCP, TBT, CLS, Speed Index and
              page weight. This is a simulated, single measurement, useful for finding causes and comparing changes.
            </li>
            <li>
              <strong>Real users (Chrome UX Report).</strong> When Google has enough Chrome traffic for the page or site, the same response includes what real
              Chrome users experienced over the last 28 days, at the 75th percentile. It is shown separately and is missing for low-traffic sites.
            </li>
            <li>
              <strong>Browser probe (optional).</strong> Under Advanced options you can also time the address from your own browser: 5 sequential{' '}
              <code>GET</code> requests with <code>no-cors</code>, no cookies, no referrer and no cache. Browsers keep other sites’ responses private (CORS), so
              status codes and redirects are not visible, and DNS, TCP and TLS timing are only shown when the server sends <code>Timing-Allow-Origin</code>.{' '}
              <code>http://</code> URLs cannot be probed from this https page.
            </li>
          </ul>
          <p>
            {SITE.psiProxyUrl
              ? 'Requests go through the TraceDetective analysis service, which adds the project’s own Google API key on the server, limits how often each visitor and the whole site can run tests, and keeps a result for 15 minutes so repeated tests of the same page do not use more quota.'
              : 'This copy of the site calls Google’s public PageSpeed Insights endpoint directly, without a key. That endpoint has a small shared quota, so tests can fail with a quota message at busy times.'}{' '}
            When a test fails, the page says why (quota used up, too many tests, timeout, page could not be loaded) and offers to try again, open the same test on
            the PageSpeed Insights website, or run the browser probe. It never shows empty or made-up numbers.
          </p>
          <p>
            Input is normalised (https:// is added, fragments are removed) and refused when it has credentials, a secret-looking query parameter, or a local,
            private-network, link-local or internal host. Findings appear only when a measured value crosses a published threshold: server response over 600 ms,
            LCP over 2.5 s, TBT over 200 ms, CLS over 0.1, more than 1.6 MB transferred, a redirect chain, an HTTP error, or a cold first request much slower than repeats.
          </p>
          <p>
            An external check cannot see inside the server. It never reports database, query, cache or code-level causes. Use it to decide whether a problem is
            the network, the server response, or the page itself, then import a trace to see inside the server.
          </p>
        </Section>

        <Section id="otlp" title="OpenTelemetry import">
          <p>The Upload tab accepts OpenTelemetry trace data directly:</p>
          <ul>
            <li>OTLP/JSON with a top-level <code>resourceSpans</code> array, including the older <code>instrumentationLibrarySpans</code> key.</li>
            <li>OpenTelemetry Collector file exporter output: one OTLP JSON request per line. The lines are merged.</li>
            <li>Grafana Tempo API responses: <code>batches</code> (v1) and <code>trace.resourceSpans</code> (v2).</li>
          </ul>
          <p>
            Hex IDs are used as they are; base64 IDs from generic protobuf JSON encoders are converted to hex. Nanosecond timestamps become milliseconds. Span kind
            and status accept integer or string enums. <code>service.name</code> comes from the resource. Exception events add <code>exception.type</code> and{' '}
            <code>exception.message</code>, and the status message becomes <code>error.message</code>. Array and map attribute values are kept as JSON text.
          </p>
          <p>
            Spans without IDs or with an end before their start are skipped with a warning. When a file holds several traces, the one with the most spans is
            opened and the warning names the others. Attributes beyond {LIMITS.maxAttributes} per span are dropped with a warning. Every parent must be in the file;
            a partial export is rejected and the missing span is named.
          </p>
        </Section>

        <Section id="schema" title="JSON schema (version 1.0)">
          <p>
            A document has <code>schemaVersion</code> (must be <code>"1.0"</code>), <code>traceId</code>, optional <code>name</code> and
            <code> description</code>, <code>synthetic</code> (true for generated data) and a <code>spans</code> array with 1 to{' '}
            {LIMITS.maxSpans.toLocaleString('en-US')} spans. Files over 2 MB are rejected.
          </p>
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Schema fields (scrollable)">
            <table className="w-full min-w-[560px] text-left">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th scope="col" className="py-2 pr-3">Field</th><th scope="col" className="py-2 pr-3">Type</th><th scope="col" className="py-2">Notes</th></tr>
              </thead>
              <tbody>
                {FIELDS.map(([f, t, n]) => (
                  <tr key={f} className="border-t border-line align-top">
                    <th scope="row" className="py-2 pr-3 font-mono font-normal">{f}</th>
                    <td className="py-2 pr-3 text-muted">{t}</td>
                    <td className="py-2">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Validation rejects duplicate span IDs, missing parents, parent cycles, mismatched trace IDs, negative durations and non-numeric or infinite times, and names the span at fault. It warns, without rejecting, when a child extends outside its parent, when there are several roots, or when the trace spans more than 24 hours (usually a sign of mixed time units).</p>
          <pre tabIndex={0} aria-label="Example trace document" className="overflow-x-auto rounded-lg border border-line bg-navy p-3 text-xs"><code>{EXAMPLE}</code></pre>
          <p>
            Attribute names follow OpenTelemetry semantic conventions where possible. Both current and older names are recognised, for example{' '}
            <code>db.system.name</code> and <code>db.system</code>, or <code>http.response.status_code</code> and <code>http.status_code</code>.
          </p>
        </Section>

        <Section id="timing" title="How timing is calculated">
          <ul>
            <li><strong>Positions</strong> are relative to the earliest span start. Bars may overlap; concurrent work is shown as it happened.</li>
            <li><strong>Self time</strong> is a span’s duration minus the union of its direct children’s intervals, clipped to the span’s own bounds. Overlapping children are counted once, so self time is never negative and never double-counted.</li>
            <li><strong>Critical path</strong> walks backwards from the end of the root span. At each point it follows the child that finished last, because that is what the parent was waiting on, then continues from that child’s start. Time not covered by such a child belongs to the parent. The segments add up exactly to the trace duration.</li>
            <li>With several root spans, the whole trace window is treated as one virtual parent, and gaps between roots count as untraced time.</li>
          </ul>
        </Section>

        <Section id="rules" title="Insight rules">
          <p>Insights are deterministic rules with fixed thresholds. They show where time went. They do not prove why.</p>
          <ul>
            <li><strong>Slow database call:</strong> a span with database attributes holds at least {formatPct(RULE_THRESHOLDS.dominantShare)} of the critical path and at least {RULE_THRESHOLDS.dominantMinMs} ms. It suggests checking the query plan. It never claims an index is missing.</li>
            <li><strong>Slow external call:</strong> the same thresholds for outbound HTTP or RPC client spans. The deepest such call is reported, with the calls it was made through.</li>
            <li><strong>Erroring dependency:</strong> spans with error status. Spans with no errored descendants are reported as the likely origin; errored parents are listed as probably propagating the failure.</li>
            <li><strong>Repeated sequential calls:</strong> {RULE_THRESHOLDS.repeatedMinCount} or more non-overlapping sibling calls with the same service and name, which can point to an N+1 pattern or retries.</li>
            <li><strong>Unexplained time:</strong> a span with children whose self time is at least {formatPct(RULE_THRESHOLDS.gapShare)} of the trace and {RULE_THRESHOLDS.gapMinMs} ms. This is reported as unexplained, not as CPU time.</li>
          </ul>
        </Section>

        <Section id="compare" title="Comparison">
          <p>
            Spans are matched by their path in the tree (service and name of every ancestor) plus their position among siblings with the same name. This
            keeps repeated calls apart. Unmatched spans are listed as added or removed. A percentage is not shown when the baseline is 0 ms. Comparing
            two single traces shows what differed in those two requests, not what caused the difference.
          </p>
        </Section>

        <Section id="limitations" title="Limitations">
          <ul>
            <li>It analyses one trace at a time. It does not compute latency percentiles across many requests.</li>
            <li>Insights only see what is instrumented. Uninstrumented code, queues or services can be the true cause.</li>
            <li>OTLP protobuf (binary) files are not supported; export OTLP JSON instead. Partial traces with missing parents are rejected.</li>
            <li>There is no live monitoring, alerting or trace storage.</li>
            <li>Website analysis reports only what is visible from outside. It cannot check pages behind a login, local or private addresses, and it cannot explain server-internal causes. PageSpeed Insights results come from Google’s locations and test devices, not your users’.</li>
            <li>The four built-in examples are synthetic. They are not benchmarks or measurements.</li>
          </ul>
        </Section>

        <Section id="privacy" title="Privacy">
          <ul>
            <li>Traces are parsed and analysed in your browser. They are never sent to a server.</li>
            <li>Imported traces are kept in this browser tab’s session storage so a reload does not lose them. Closing the tab clears them, and you can remove them sooner on the Upload tab.</li>
            <li>Attribute values whose keys look sensitive (password, secret, token, authorization, cookie, API key, session, credential) are replaced with “[redacted]” on import.</li>
            <li>Website analysis sends the address you enter to Google PageSpeed Insights (Google’s privacy policy applies){SITE.psiProxyUrl ? ', through the TraceDetective analysis service. The service uses your IP address only to count tests per minute, keeps each result for 15 minutes so repeat tests are fast, and writes no request logs' : ''}. You never enter an API key.</li>
            <li>The optional browser probe sends requests from your browser to the address you enter, without cookies or a referrer.</li>
            <li>The only thing stored on your device besides imported traces is a flag that you have seen the walkthrough (local storage).</li>
            <li>The site has no login, no ads, no cookies and no analytics.</li>
            <li>Still, remove secrets and personal data from traces before importing or sharing reports.</li>
          </ul>
        </Section>

        <Section id="security" title="Security">
          <ul>
            <li>Imported data is never executed. All values are rendered as text, never as HTML.</li>
            <li>File size, span count, string length and attribute count are limited to keep the browser responsive.</li>
            <li>The app makes no network requests with trace data. The only server-side part is the optional analysis service, which forwards a validated public address to Google and never fetches the address itself. Local and private targets are refused in the browser and again on the service.</li>
            <li>A Content Security Policy allows scripts and styles only from the site itself; connections are limited to https.</li>
            <li>Report vulnerabilities privately as described in SECURITY.md in the repository.</li>
          </ul>
        </Section>

        <Section id="contributing" title="Contributing">
          <p>
            Issues and pull requests are welcome. See CONTRIBUTING.md in the repository for setup, coding standards and how to add a diagnostic rule with
            tests.{SITE.repoUrl ? <> The source is on <a href={SITE.repoUrl}>GitHub</a>.</> : null}
          </p>
        </Section>
      </div>
    </div>
  );
}
