import { useRef, useState, type DragEvent } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { LIMITS, parseTraceText, type ParseResult, type TraceSource } from '../../core';
import { SAMPLES } from '../../fixtures';
import { sampleTraceId, useTraces } from '../store';
import { Button, ButtonLink, Card, PageHeader, SyntheticBadge, downloadJson, useDocumentTitle } from '../ui';
import { NotFound } from './NotFound';
import { CONVERT_SNIPPET } from '../otlpSnippet';

const MODES = [
  { id: 'demo', label: 'Explore demo' },
  { id: 'upload', label: 'Upload trace' },
  { id: 'url', label: 'Check URL' },
  { id: 'sdk', label: 'SDK guide' },
] as const;

export function Analyze() {
  const { mode = 'demo' } = useParams();
  const current = MODES.find((m) => m.id === mode);
  useDocumentTitle(current ? `Analyze · ${current.label}` : 'Not found');
  if (!current) return <NotFound />;
  return (
    <div>
      <PageHeader title="Analyze">Choose how to bring in data. Each mode says exactly what it can and cannot tell you.</PageHeader>
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
      {mode === 'url' && <UrlMode />}
      {mode === 'sdk' && <SdkMode />}
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
            TraceDetective JSON schema 1.0, up to 2 MB and {LIMITS.maxSpans.toLocaleString('en-US')} spans. The file is read and analysed in this browser tab only.{' '}
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
            placeholder='{"schemaVersion": "1.0", "traceId": "…", "spans": [ … ]}'
            className="mt-2 w-full rounded-lg border border-line bg-navy p-3 font-mono text-xs"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={pasted.trim() === ''}
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
            <li>OpenTelemetry OTLP JSON is not supported yet. See the <Link to="/analyze/sdk">SDK guide</Link> for converting it.</li>
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

function UrlMode() {
  return (
    <Card className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">URL check</h2>
        <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted">Planned, not available yet</span>
      </div>
      <p className="mt-3 text-sm">
        A URL check would measure only what is visible from the outside: HTTP status, total response time and redirects. It cannot see inside your
        service, so it could never report database or function-level timing.
      </p>
      <p className="mt-3 text-sm">
        Doing this safely needs a server-side checker with protection against server-side request forgery (blocking private, loopback and link-local
        addresses at every redirect), strict timeouts and size limits, and rate limiting. That service does not exist yet, so this release shows no
        URL results rather than unreliable ones.
      </p>
      <p className="mt-3 text-sm text-muted">
        To investigate a slow endpoint today, capture a trace with OpenTelemetry and import it. <Link to="/analyze/sdk">See the SDK guide</Link>.
      </p>
    </Card>
  );
}



function SdkMode() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Connect instrumentation</h2>
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted">Guide only, no live ingestion</span>
        </div>
        <p className="mt-3 text-sm">
          TraceDetective does not receive live telemetry. There is no collector endpoint, agent or SDK to install. The supported path today is:
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Instrument your service with OpenTelemetry (official SDKs exist for most languages).</li>
          <li>Export one trace from your tracing backend or collector as OTLP JSON.</li>
          <li>Convert it to the TraceDetective schema with a small script, such as the one below, on your own machine.</li>
          <li>Import the converted file on the <Link to="/analyze/upload">Upload</Link> tab.</li>
        </ol>
        <p className="mt-3 text-sm text-muted">Native OTLP JSON import is planned once a parser and test fixtures are in place.</p>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Example converter</h2>
        <p className="mt-1 text-sm text-muted">Review it before running. It reads a file you already have and makes no network calls.</p>
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-line bg-navy p-3 text-xs leading-relaxed">
          <code>{CONVERT_SNIPPET}</code>
        </pre>
      </Card>
    </div>
  );
}
