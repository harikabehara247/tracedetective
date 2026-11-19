import { useRef, useState, type DragEvent } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { LIMITS, parseTraceText, type ParseResult, type TraceSource } from '../../core';
import { SAMPLES } from '../../fixtures';
import { sampleTraceId, useTraces } from '../store';
import { Button, ButtonLink, Card, PageHeader, SyntheticBadge, downloadJson, useDocumentTitle } from '../ui';
import { NotFound } from './NotFound';
import { UrlCheck } from './UrlCheck';
import { openTour } from '../components/Tour';

const MODES = [
  { id: 'url', label: 'Analyze a website' },
  { id: 'upload', label: 'Investigate a trace' },
  { id: 'demo', label: 'Explore demo traces' },
] as const;

const HEADERS: Record<string, [string, string]> = {
  url: ['Analyze a website', 'Paste a page URL. Get a visual performance report and the next things to check. No files or setup needed.'],
  upload: ['Investigate a trace', 'Optional and more advanced: see where one request spent its time inside your application.'],
  demo: ['Explore demo traces', 'Synthetic traces that show what trace analysis looks like. No download needed.'],
  sdk: ['Instrumentation guide', 'How to get a trace out of your own service.'],
};

const OPTIONS = [
  {
    id: 'url',
    title: 'Analyze a website',
    when: 'Start here. Paste any public page URL, on any platform. It checks what a visitor’s browser can observe in a page load. No account, API key, files or plugin.',
    can: ['How the page performed on mobile and desktop', 'Where the time went: server response, resource loading, rendering and main-thread work', 'A screenshot, the loading sequence and every request', 'A short, ranked list of what to check first, with the evidence for each'],
    cannot: ['See inside the server: no code, function or database query timing', 'Check local, private-network or login-protected pages'],
    cta: 'Analyze a website',
  },
  {
    id: 'upload',
    title: 'Investigate a trace',
    when: 'Advanced: you already have a trace (a timed record of one request) from OpenTelemetry or a tracing tool.',
    can: ['Waterfall, span tree and critical path', 'Self time with concurrency handled correctly', 'Insights on slow database and external calls, errors and gaps', 'Compare against another trace'],
    cannot: ['Collect traces for you: export one first (OTLP JSON or TraceDetective JSON)', 'Receive live telemetry from an agent'],
    cta: 'Investigate a trace',
  },
  {
    id: 'demo',
    title: 'Explore demo traces',
    when: 'You want to see what TraceDetective does before using your own data.',
    can: ['Four ready-made traces: healthy, slow database, slow external API, failing dependency', 'Every feature works on them, including compare and export'],
    cannot: ['Describe a real system: the demo traces are synthetic and labelled as such'],
    cta: 'Open the demos',
  },
] as const;

export function Analyze() {
  const { mode } = useParams();
  const current = MODES.find((m) => m.id === mode);
  const isGuide = mode === 'sdk';
  useDocumentTitle(mode === undefined ? 'Start analysis' : isGuide ? 'Instrumentation guide' : current ? current.label : 'Not found');
  if (mode !== undefined && !current && !isGuide) return <NotFound />;
  if (mode === undefined) return <StartAnalysis />;
  const [title, intro] = HEADERS[mode]!;
  return (
    <div>
      <PageHeader title={title}>{intro}</PageHeader>
      <nav aria-label="Analysis modes" className="mb-6 overflow-x-auto">
        <ul className="flex min-w-max gap-1 rounded-xl border border-line bg-surface p-1">
          {MODES.map((m) => (
            <li key={m.id}>
              <NavLink
                to={`/analyze/${m.id}`}
                aria-current={m.id === mode ? 'page' : undefined}
                className={`block rounded-lg px-4 py-2 text-sm font-semibold no-underline hover:no-underline ${
                  m.id === mode ? 'bg-violet text-navy' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {m.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {mode === 'demo' && <DemoMode />}
      {mode === 'upload' && <UploadMode />}
      {mode === 'url' && <UrlCheck />}
      {isGuide && <SdkMode />}
    </div>
  );
}

function StartAnalysis() {
  return (
    <div>
      <PageHeader title="Start analysis" actions={<Button variant="ghost" onClick={openTour}>Take the tour</Button>}>
        Pick what you have. Each option lists what it can and cannot tell you, so you know what to expect before you start.
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        {OPTIONS.map((o) => (
          <Card key={o.id} as="article" className="flex flex-col">
            <h2 className="text-lg font-semibold">{o.title}</h2>
            <p className="mt-1 text-sm text-muted">{o.when}</p>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-teal">It can</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {o.can.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-warn">It cannot</h3>
            <ul className="mt-1 flex-1 list-disc space-y-1 pl-5 text-sm">
              {o.cannot.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <ButtonLink to={`/analyze/${o.id}`} variant="primary" className="mt-5 self-start">
              {o.cta}
            </ButtonLink>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">
        Not sure? Start with Analyze a website. It needs only a URL. Trace investigation is for when your application already records traces.{' '}
        <Link to="/analyze/sdk">How to get a trace</Link>
      </p>
    </div>
  );
}

function DemoMode() {
  return (
    <div className="space-y-4">
      <p className="text-muted">These traces are synthetic. They were generated to show common patterns and are not measurements of a real system.</p>
      <div className="grid gap-4 md:grid-cols-2">
        {SAMPLES.map((s) => (
          <Card key={s.id} as="article">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold">{s.title}</h2>
              <SyntheticBadge synthetic />
            </div>
            <p className="mt-2 text-sm text-muted">{s.summary}</p>
            <ButtonLink to={`/trace/${sampleTraceId(s.id)}`} variant="primary" className="mt-4">
              Open trace
            </ButtonLink>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface Pending {
  text: string;
  source: TraceSource;
  bytes: number;
  result: ParseResult;
}

function UploadMode() {
  const { addFromText, traces, remove } = useTraces();
  const navigate = useNavigate();
  const [pending, setPending] = useState<Pending | null>(null);
  const [pasted, setPasted] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imports = traces.filter((t) => t.source.kind !== 'sample');

  const readFile = async (file: File) => {
    if (file.size > LIMITS.maxFileBytes) {
      setPending({ text: '', bytes: file.size, source: { kind: 'upload', fileName: file.name }, result: parseTraceText('', file.size) });
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      setPending({ text, bytes: file.size, source: { kind: 'upload', fileName: file.name }, result: parseTraceText(text, file.size) });
    } catch {
      setPending({ text: '', bytes: 0, source: { kind: 'upload', fileName: file.name }, result: { ok: false, errors: [{ code: 'read_failed', message: 'The file could not be read.' }] } });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void readFile(file);
  };

  const open = () => {
    if (!pending) return;
    const r = addFromText(pending.text, pending.source, pending.bytes);
    if (r.ok) navigate(`/trace/${r.id}`);
    else setPending({ ...pending, result: r });
  };

  const example = SAMPLES[0]!.data;

  return (
    <div className="space-y-6">
    <TraceIntro />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Import a JSON trace</h2>
          <p className="mt-1 text-sm text-muted">
            OpenTelemetry OTLP JSON or TraceDetective JSON schema 1.0, up to 2 MB and {LIMITS.maxSpans.toLocaleString('en-US')} spans. The file is read and analysed in this browser tab only.{' '}
            <Link to="/docs#schema">Schema reference</Link>
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center ${dragging ? 'border-cyan bg-cyan/5' : 'border-line'}`}
          >
            <p className="font-medium">Drag a .json file here</p>
            <p className="text-sm text-muted">or</p>
            <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? 'Reading…' : 'Choose file'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              aria-label="Trace JSON file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void readFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </Card>

        <Card>
          <label htmlFor="paste" className="text-lg font-semibold">
            Or paste JSON
          </label>
          <textarea
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder='{"schemaVersion": "1.0", "traceId": "…", "spans": [ … ]}  or  {"resourceSpans": [ … ]}'
            className="mt-2 w-full rounded-lg border border-line bg-navy p-3 font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => setPending({ text: pasted, bytes: new TextEncoder().encode(pasted).length, source: { kind: 'paste' }, result: parseTraceText(pasted) })}
            >
              Validate pasted JSON
            </Button>
            <Button onClick={() => setPasted(JSON.stringify(example, null, 2))}>Insert example</Button>
            <Button variant="ghost" onClick={() => downloadJson('tracedetective-example.json', example)}>
              Download example file
            </Button>
          </div>
        </Card>

        {pending && (
          <Card aria-labelledby="preview-h" className={pending.result.ok ? 'border-teal/50' : 'border-danger/60'}>
            <div aria-live="polite">
              {pending.result.ok ? (
                <>
                  <h2 id="preview-h" className="text-lg font-semibold text-teal">Trace is valid</h2>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted">Name</dt>
                    <dd>{pending.result.trace.name ?? '(unnamed)'}</dd>
                    <dt className="text-muted">Trace ID</dt>
                    <dd className="break-all font-mono text-xs">{pending.result.trace.traceId}</dd>
                    <dt className="text-muted">Spans</dt>
                    <dd>{pending.result.trace.spans.length}</dd>
                    <dt className="text-muted">Services</dt>
                    <dd>{new Set(pending.result.trace.spans.map((s) => s.service)).size}</dd>
                    <dt className="text-muted">Data</dt>
                    <dd><SyntheticBadge synthetic={pending.result.trace.synthetic} /></dd>
                  </dl>
                  {pending.result.warnings.length > 0 && (
                    <ul className="mt-3 list-disc pl-5 text-sm text-warn">
                      {pending.result.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                    </ul>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button variant="primary" onClick={open}>Analyze trace</Button>
                    <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 id="preview-h" className="text-lg font-semibold text-danger">This trace could not be imported</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {pending.result.errors.map((e, i) => <li key={i} className="break-words">{e.message}</li>)}
                  </ul>
                  <Button variant="ghost" className="mt-3" onClick={() => setPending(null)}>Dismiss</Button>
                </>
              )}
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-6">
        <Card>
          <h2 className="font-semibold">Before you import</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Remove secrets, tokens and personal data from attributes.</li>
            <li>Attribute keys that look sensitive (password, token, cookie, API key) are redacted automatically, but do not rely on that alone.</li>
            <li>Never upload application source code. Only trace data is needed.</li>
            <li>OpenTelemetry OTLP JSON (collector file exporter or Jaeger/Tempo OTLP export) is converted automatically. If a file holds several traces, the largest is opened and the others are listed in a warning.</li>
            <li>Every parent span must be in the file. Partial exports are rejected with the missing span named. <Link to="/analyze/sdk">How to export a trace</Link></li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold">Imported in this tab</h2>
          {imports.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing imported yet.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {imports.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link to={`/trace/${t.id}`} className="min-w-0 truncate">{t.label}</Link>
                  <Button variant="ghost" className="px-2 py-1" onClick={() => remove(t.id)} aria-label={`Remove ${t.label}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
    </div>
  );
}

const SAMPLE_FILE = 'samples/tracedetective-sample-slow-database.otlp.json';

/** Plain-language introduction: what a trace is, a picture, and how to get one. */
function TraceIntro() {
  const steps = [
    { label: 'Web server', service: 'frontend service', start: 0, ms: 40, color: 'var(--color-cyan)' },
    { label: 'Application code', service: 'checkout service', start: 40, ms: 120, color: 'var(--color-violet)' },
    { label: 'Database query', service: 'orders database', start: 70, ms: 650, color: 'var(--color-warn)' },
    { label: 'External API', service: 'payment provider', start: 730, ms: 90, color: 'var(--color-teal)' },
  ];
  const total = 830;
  const x = (ms: number) => 150 + (ms / total) * 460;
  return (
    <Card aria-labelledby="trace-intro-h">
      <h2 id="trace-intro-h" className="text-lg font-semibold">
        What is a trace?
      </h2>
      <p className="mt-2 max-w-3xl text-lg">
        A trace is a timed record of one request moving through an application and its services. It can show which measured steps took time.
      </p>
      <figure className="mt-4">
        <svg viewBox="0 0 640 170" className="w-full max-w-3xl" role="img" aria-labelledby="trace-fig-t trace-fig-d">
          <title id="trace-fig-t">Illustration of one request as a trace</title>
          <desc id="trace-fig-d">
            One page request takes 830 ms. The web server starts it, application code runs for 120 ms, a database query takes 650 ms, and an external API call takes 90 ms. The
            database query is where most of the time went.
          </desc>
          <rect x="150" y="8" width="460" height="22" rx="4" fill="var(--color-surface-2)" stroke="var(--color-line)" />
          <text x="10" y="24" fontSize="12" fill="var(--color-ink)">GET /checkout</text>
          <text x="604" y="23" fontSize="11" textAnchor="end" fill="var(--color-muted)">830 ms in total</text>
          {steps.map((st, i) => (
            <g key={st.label}>
              <text x="10" y={58 + i * 30} fontSize="12" fill="var(--color-ink)">
                {st.label}
              </text>
              <text x="10" y={70 + i * 30} fontSize="10" fill="var(--color-muted)">
                {st.service}
              </text>
              <rect x={x(st.start)} y={46 + i * 30} width={Math.max(4, x(st.start + st.ms) - x(st.start))} height="18" rx="3" fill={st.color} />
              <text x={x(st.start + st.ms) + 6 > 560 ? x(st.start) - 6 : x(st.start + st.ms) + 6} y={59 + i * 30} fontSize="11" fill="var(--color-ink)" textAnchor={x(st.start + st.ms) + 6 > 560 ? 'end' : 'start'}>
                {st.ms} ms
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="mt-1 text-xs text-muted">Illustration with made-up numbers: in this request, most of the time went to one database query.</figcaption>
      </figure>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink to={`/trace/${sampleTraceId('slow-database')}`} variant="primary">
          Open a synthetic sample
        </ButtonLink>
        <a
          href={`${import.meta.env.BASE_URL}${SAMPLE_FILE}`}
          download
          className="inline-flex items-center rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-cyan hover:no-underline"
        >
          Download sample trace (synthetic, OTLP JSON)
        </a>
      </div>
      <p className="mt-2 text-xs text-muted">Both are the same made-up “slow database query” request. They are labelled synthetic and are not measurements of a real system.</p>

      <div className="mt-5 grid gap-4 text-sm md:grid-cols-3">
        <div>
          <h3 className="font-semibold">File formats it reads</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            <li>
              <strong className="text-ink">OTLP/JSON</strong>: OpenTelemetry’s standard JSON, with a top-level <code>resourceSpans</code> list.
            </li>
            <li>
              <strong className="text-ink">Collector JSON Lines</strong>: the OpenTelemetry Collector file exporter writes one OTLP/JSON object per line. Upload the file as it is.
            </li>
            <li>
              <strong className="text-ink">Grafana Tempo</strong>: save the response of <code>/api/traces/&lt;trace id&gt;</code> or <code>/api/v2/traces/&lt;trace id&gt;</code>.
            </li>
          </ul>
          <Link to="/analyze/sdk" className="mt-1 inline-block">
            Step-by-step export guide
          </Link>
        </div>
        <div>
          <h3 className="font-semibold">Getting a trace</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            <li>
              Your application must record traces. Most sites and frameworks do not do this by default; add OpenTelemetry (SDKs and automatic instrumentation exist for Node.js,
              Python, Java, .NET, Go, PHP, Ruby and others) or turn on tracing in your monitoring tool.
            </li>
            <li>
              <strong className="text-ink">OpenTelemetry Collector</strong>: add the file exporter and upload the file it writes.
            </li>
            <li>
              <strong className="text-ink">Grafana Tempo</strong>: save the API response for one trace id.
            </li>
            <li>
              <strong className="text-ink">Jaeger, Zipkin or a commercial APM</strong>: their own export formats are not read directly. If they receive OpenTelemetry data,
              also send it to a Collector with the file exporter.
            </li>
          </ul>
          <p className="mt-2 text-muted">
            A trace is never needed for <Link to="/analyze/url">Analyze a website</Link>.
          </p>
        </div>
        <div>
          <h3 className="font-semibold">Privacy</h3>
          <p className="mt-1 text-muted">
            Imported traces are analysed in your browser and are not uploaded anywhere. They are kept in this tab’s session storage until you close the tab or remove them.
            Sensitive-looking attributes are redacted on import, but remove secrets and personal data first. Only the trace file is needed, never source code.
          </p>
        </div>
      </div>
    </Card>
  );
}

const COLLECTOR_CONFIG = `exporters:
  file:
    path: ./traces.jsonl   # one OTLP JSON request per line

service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [file]`;

function SdkMode() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Get a trace from your service</h2>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted">File import, no live ingestion</span>
        </div>
        <p className="mt-3 text-sm">
          TraceDetective reads trace files. It has no collector endpoint or agent, so nothing is sent from your servers to this site.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Instrument your service with OpenTelemetry. Official SDKs exist for most languages.</li>
          <li>Export the slow request as OTLP JSON, using one of the options below.</li>
          <li>Remove anything sensitive from attributes, then import the file on the <Link to="/analyze/upload">Investigate a trace</Link> tab.</li>
        </ol>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Export options</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>OpenTelemetry Collector file exporter.</strong> Writes OTLP JSON, one request per line. TraceDetective accepts that JSON Lines file directly
            and merges the lines. Keep the file under 2 MB, for example by exporting only while you reproduce the slow request.
          </li>
          <li>
            <strong>Grafana Tempo API.</strong> Responses from <code>/api/traces/&lt;traceID&gt;</code> (<code>batches</code>) and <code>/api/v2/traces/&lt;traceID&gt;</code>{' '}
            (<code>trace.resourceSpans</code>) are accepted.
          </li>
          <li>
            <strong>Any OTLP/JSON file</strong> with a top-level <code>resourceSpans</code> array, with hex or base64 IDs.
          </li>
          <li>
            <strong>Other tracers.</strong> Convert to the <Link to="/docs#schema">TraceDetective JSON schema</Link>, which needs only IDs, names, services, start times and durations.
          </li>
        </ul>
        <h3 className="mt-4 text-sm font-semibold">Collector configuration example</h3>
        <pre tabIndex={0} aria-label="Collector configuration example" className="mt-2 overflow-auto rounded-lg border border-line bg-navy p-3 text-xs leading-relaxed">
          <code>{COLLECTOR_CONFIG}</code>
        </pre>
      </Card>
    </div>
  );
}
