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
  { id: 'url', label: 'Check website URL' },
  { id: 'upload', label: 'Upload trace' },
  { id: 'demo', label: 'Explore demo' },
] as const;

const OPTIONS = [
  {
    id: 'url',
    title: 'Check website URL',
    when: 'You have a public website or API endpoint and want to know how fast it responds.',
    can: ['HTTP status, final URL and redirects', 'Server response time and page-load metrics (LCP, CLS, TBT)', 'Real-user Chrome data when Google has it', 'Response times from your own browser, repeated 5 times'],
    cannot: ['See inside the server: no database, query or function timing', 'Check local, private-network or login-protected pages'],
    cta: 'Check a URL',
  },
  {
    id: 'upload',
    title: 'Upload trace',
    when: 'You have a distributed trace from OpenTelemetry or another tracer.',
    can: ['Waterfall, span tree and critical path', 'Self time with concurrency handled correctly', 'Insights on slow database and external calls, errors and gaps', 'Compare against another trace'],
    cannot: ['Collect traces for you: export one first (OTLP JSON or TraceDetective JSON)', 'Receive live telemetry from an agent'],
    cta: 'Import a trace',
  },
  {
    id: 'demo',
    title: 'Explore demo',
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
  return (
    <div>
      <PageHeader title={isGuide ? 'Instrumentation guide' : 'Start analysis'}>
        {isGuide ? 'How to get a trace out of your own service.' : 'Each mode says exactly what it can and cannot tell you.'}
      </PageHeader>
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
        Not sure? Slow page in the browser: start with the URL check. Slow API and you can see your service: upload a trace.{' '}
        <Link to="/analyze/sdk">How to export a trace</Link>
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
          <li>Remove anything sensitive from attributes, then import the file on the <Link to="/analyze/upload">Upload trace</Link> tab.</li>
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
