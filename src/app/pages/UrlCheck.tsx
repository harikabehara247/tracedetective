import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  TOOL,
  explainPsiError,
  normalizeUrl,
  parsePsi,
  psiRequestUrl,
  runBrowserProbe,
  urlFindings,
  type ProbeSample,
  type ProbeSummary,
  type PsiError,
  type PsiSummary,
  type Strategy,
  type UrlFinding,
} from '../../core';
import { Button, Card, SeverityBadge, downloadJson } from '../ui';

const PSI_TIMEOUT_MS = 90_000;
const PROBE_COUNT = 5;
const PROBE_TIMEOUT_MS = 10_000;

type PsiState = { state: 'off' } | { state: 'running' } | { state: 'ok'; summary: PsiSummary } | { state: 'error'; error: PsiError } | { state: 'cancelled' };
type ProbeState = { state: 'off' } | { state: 'running'; samples: ProbeSample[] } | { state: 'ok'; summary: ProbeSummary } | { state: 'cancelled' };

interface Run {
  url: string;
  host: string;
  notes: string[];
  strategy: Strategy;
  startedAt: Date;
  finishedAt?: Date;
  psi: PsiState;
  probe: ProbeState;
}

const fmtMs = (ms: number | undefined) => (ms === undefined ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const fmtBytes = (b: number | undefined) => (b === undefined ? '—' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`);

export function UrlCheck() {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [usePsi, setUsePsi] = useState(true);
  const [useProbe, setUseProbe] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [run, setRun] = useState<Run | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const resultsRef = useRef<HTMLHeadingElement>(null);

  const running = !!run && (run.psi.state === 'running' || run.probe.state === 'running');

  useEffect(() => {
    if (!running || !run) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - run.startedAt.getTime()) / 1000)), 500);
    return () => clearInterval(t);
  }, [running, run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const update = (patch: Partial<Run>) => setRun((r) => (r ? { ...r, ...patch } : r));

  const start = async (e: FormEvent) => {
    e.preventDefault();
    const n = normalizeUrl(input);
    if (!n.ok) {
      setInputError(n.error);
      return;
    }
    if (!usePsi && !useProbe) {
      setInputError('Choose at least one measurement method.');
      return;
    }
    setInputError(null);
    setInput(n.url);
    setElapsed(0);
    cancelledRef.current = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const probeAllowed = useProbe && n.url.startsWith('https:');
    setRun({
      url: n.url,
      host: n.host,
      notes: n.notes,
      strategy,
      startedAt: new Date(),
      psi: usePsi ? { state: 'running' } : { state: 'off' },
      probe: probeAllowed ? { state: 'running', samples: [] } : { state: 'off' },
    });

    const psiTask = usePsi
      ? (async () => {
          const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), PSI_TIMEOUT_MS);
          try {
            const res = await fetch(psiRequestUrl(n.url, strategy, apiKey), { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
            const body: unknown = await res.json().catch(() => null);
            if (!res.ok) update({ psi: { state: 'error', error: explainPsiError(res.status, body) } });
            else update({ psi: { state: 'ok', summary: parsePsi(body) } });
          } catch (err) {
            if (cancelledRef.current) update({ psi: { state: 'cancelled' } });
            else {
              const reason = ctrl.signal.reason as { name?: string } | undefined;
              update({ psi: { state: 'error', error: explainPsiError(null, null, reason?.name === 'TimeoutError' ? reason : err) } });
            }
          } finally {
            clearTimeout(timer);
          }
        })()
      : Promise.resolve();

    const probeTask = probeAllowed
      ? (async () => {
          const samples: ProbeSample[] = [];
          const summary = await runBrowserProbe(n.url, PROBE_COUNT, PROBE_TIMEOUT_MS, undefined, (s) => {
            samples.push(s);
            if (!cancelledRef.current) update({ probe: { state: 'running', samples: [...samples] } });
          });
          update({ probe: cancelledRef.current ? { state: 'cancelled' } : { state: 'ok', summary } });
        })()
      : Promise.resolve();

    await Promise.allSettled([psiTask, probeTask]);
    update({ finishedAt: new Date() });
    requestAnimationFrame(() => resultsRef.current?.focus());
  };

  const cancel = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  };

  return (
    <div className="space-y-6">
      <Card className="max-w-4xl">
        <h2 className="text-lg font-semibold">Check a website or API URL</h2>
        <p className="mt-1 text-sm text-muted">
          Measures what is visible from outside: HTTP status, redirects, server response time and page-load metrics. It cannot see inside your
          service, so it never reports database, query or function timing. For that, <Link to="/analyze/upload">import a trace</Link>.
        </p>
        <form onSubmit={start} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="url-input" className="text-sm font-semibold">
              URL
            </label>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <input
                id="url-input"
                type="url"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://example.com or example.com/api/health"
                aria-invalid={!!inputError}
                aria-describedby={inputError ? 'url-error' : 'url-help'}
                disabled={running}
                className="min-w-0 flex-1 rounded-lg border border-line bg-navy px-3 py-2 text-sm"
              />
              {running ? (
                <Button onClick={cancel}>Cancel</Button>
              ) : (
                <Button type="submit" variant="primary">
                  Run check
                </Button>
              )}
            </div>
            {inputError ? (
              <p id="url-error" role="alert" className="mt-1 text-sm text-danger">
                {inputError}
              </p>
            ) : (
              <p id="url-help" className="mt-1 text-xs text-muted">
                Public http(s) addresses only. Local, private-network and internal addresses are refused, and so are URLs whose query string looks like it holds a secret.
              </p>
            )}
          </div>

          <fieldset className="grid gap-3 md:grid-cols-2" disabled={running}>
            <legend className="sr-only">Measurement methods</legend>
            <label className="flex gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" checked={usePsi} onChange={(e) => setUsePsi(e.target.checked)} className="mt-1" />
              <span className="text-sm">
                <span className="font-semibold">Google PageSpeed Insights</span>
                <span className="block text-muted">
                  Google’s servers load the page in a test browser (Lighthouse) and add real-user Chrome data when it exists. <strong>Sends the URL to Google.</strong> Takes 15–60 s.
                </span>
              </span>
            </label>
            <label className="flex gap-3 rounded-xl border border-line p-3">
              <input type="checkbox" checked={useProbe} onChange={(e) => setUseProbe(e.target.checked)} className="mt-1" />
              <span className="text-sm">
                <span className="font-semibold">Browser probe ({PROBE_COUNT} requests)</span>
                <span className="block text-muted">
                  Your own browser requests the URL {PROBE_COUNT} times and times each response from your network. No cookies are sent. Status codes are not visible to the page.
                </span>
              </span>
            </label>
          </fieldset>

          {usePsi && (
            <div className="grid gap-3 md:grid-cols-2">
              <fieldset disabled={running}>
                <legend className="text-sm font-semibold">Test device</legend>
                <div className="mt-1 flex gap-4 text-sm">
                  {(['mobile', 'desktop'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2">
                      <input type="radio" name="strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} />
                      {s === 'mobile' ? 'Mobile (slow 4G, mid-range phone)' : 'Desktop'}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="psi-key" className="text-sm font-semibold">
                  PageSpeed API key <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="psi-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={running}
                  aria-describedby="psi-key-help"
                  className="mt-1 w-full rounded-lg border border-line bg-navy px-3 py-2 text-sm"
                />
                <p id="psi-key-help" className="mt-1 text-xs text-muted">
                  The shared free quota is often used up. A{' '}
                  <a href="https://developers.google.com/speed/docs/insights/v5/get-started#APIKey" target="_blank" rel="noopener noreferrer">
                    free key from Google
                  </a>{' '}
                  avoids that. It is sent only to Google with this request and is never saved.
                </p>
              </div>
            </div>
          )}
        </form>
      </Card>

      {run && <Results run={run} elapsed={elapsed} running={running} headingRef={resultsRef} />}
    </div>
  );
}

function Results({ run, elapsed, running, headingRef }: { run: Run; elapsed: number; running: boolean; headingRef: React.RefObject<HTMLHeadingElement | null> }) {
  const psi = run.psi.state === 'ok' ? run.psi.summary : null;
  const probe = run.probe.state === 'ok' ? run.probe.summary : null;
  const findings: UrlFinding[] = running ? [] : urlFindings(psi, probe);
  const breakdown = probe?.samples.find((s) => s.breakdown)?.breakdown;
  const httpOnly = run.url.startsWith('http:');

  const exportReport = () => {
    downloadJson(`tracedetective-url-${run.host}-${run.startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, {
      kind: 'url-check',
      provenance: {
        tool: TOOL,
        generatedAt: new Date().toISOString(),
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        browserUserAgent: navigator.userAgent,
        dataNotice: 'External measurements of a public URL. They describe what a client sees and cannot show server-internal causes.',
      },
      input: { url: run.url, notes: run.notes, strategy: run.strategy },
      pageSpeedInsights: run.psi.state === 'ok' ? run.psi.summary : run.psi,
      browserProbe: run.probe.state === 'ok' ? run.probe.summary : run.probe,
      findings,
    });
  };

  return (
    <section aria-labelledby="url-results-h" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="url-results-h" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          Results for <span className="break-all font-mono text-base">{run.url}</span>
        </h2>
        {!running && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportReport}>Export JSON</Button>
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(run.url)}&form_factor=${run.strategy}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-muted no-underline hover:bg-surface-2 hover:text-ink hover:no-underline"
            >
              Open full PageSpeed report ↗
            </a>
          </div>
        )}
      </div>

      {run.notes.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted">
          {run.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div aria-live="polite" className="text-sm">
        {running ? (
          <p className="flex items-center gap-2 text-cyan">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-cyan" aria-hidden="true" />
            Measuring… {elapsed} s elapsed.
            {run.psi.state === 'running' && ' PageSpeed Insights usually takes 15–60 s.'}
            {run.probe.state === 'running' && ` Browser probe ${run.probe.samples.length}/${PROBE_COUNT}.`}
          </p>
        ) : (
          <p className="text-muted">Finished at {(run.finishedAt ?? new Date()).toLocaleString()}.</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold">PageSpeed Insights</h3>
          <PsiPanel state={run.psi} />
        </Card>
        <Card>
          <h3 className="font-semibold">Browser probe</h3>
          <ProbePanel state={run.probe} httpOnly={httpOnly} />
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold">Connection timing (DNS, TCP, TLS)</h3>
        {breakdown ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
            {(
              [
                ['DNS', breakdown.dnsMs],
                ['TCP connect', breakdown.connectMs],
                ['TLS', breakdown.tlsMs],
                ['Waiting (TTFB)', breakdown.waitMs],
                ['Download', breakdown.downloadMs],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-muted">{k}</dt>
                <dd className="tabular-nums">{fmtMs(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Not available. Browsers only expose DNS, connection and TLS timing for another site when that site sends a <code>Timing-Allow-Origin</code> header,
            and PageSpeed Insights does not report them separately. The probe’s first request usually includes this setup; later requests reuse the connection.
          </p>
        )}
      </Card>

      {!running && (
        <Card>
          <h3 className="font-semibold">Findings</h3>
          {findings.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No measurements completed, so there is nothing to report.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {findings.map((f) => (
                <li key={f.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <h4 className="font-semibold">{f.title}</h4>
                    <span className="text-xs text-muted">Source: {f.source}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Evidence</p>
                  <ul className="list-disc pl-5 text-sm">
                    {f.evidence.map((e) => (
                      <li key={e} className="break-words">{e}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Check next</p>
                  <ul className="list-disc pl-5 text-sm">
                    {f.verifyNext.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <h3 className="font-semibold">Methodology</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            <strong className="text-ink">PageSpeed Insights</strong>: Google runs Lighthouse from its own data centres with {run.strategy === 'mobile' ? 'simulated slow 4G and a mid-range phone CPU' : 'a desktop profile'}. Server response time,
            HTTP status and redirects come from that test browser’s main document request. Field data comes from the Chrome UX Report (real Chrome users, 28-day
            window, 75th percentile) and is only shown when Google has enough traffic for the URL or the whole site.
          </li>
          <li>
            <strong className="text-ink">Browser probe</strong>: {PROBE_COUNT} sequential <code>GET</code> requests from this browser with <code>mode: no-cors</code>, no cookies,
            no referrer and caching disabled. Each time is from sending the request until the response finishes, measured with <code>performance.now()</code>. Times include your
            network, Wi-Fi and location. The response is opaque, so status codes and redirects cannot be read. DNS, TCP and TLS times are shown only when the site sends a <code>Timing-Allow-Origin</code> header.
          </li>
          <li>Thresholds: server response 600 ms (Lighthouse), LCP 2.5 s, CLS 0.1 and TBT 200 ms (Core Web Vitals “good”), page weight 1.6 MB.</li>
          <li>One run is one sample. Repeat at different times before drawing conclusions, and confirm causes with server-side logs or traces.</li>
        </ul>
      </Card>
    </section>
  );
}

function PsiPanel({ state }: { state: PsiState }) {
  if (state.state === 'off') return <p className="mt-2 text-sm text-muted">Not selected for this run.</p>;
  if (state.state === 'running') return <p className="mt-2 text-sm text-muted">Waiting for Google… (times out after 90 s)</p>;
  if (state.state === 'cancelled') return <p className="mt-2 text-sm text-muted">Cancelled.</p>;
  if (state.state === 'error')
    return (
      <div role="alert" className="mt-2 text-sm">
        <p className="font-semibold text-danger">Measurement failed</p>
        <p className="mt-1">{state.error.message}</p>
      </div>
    );
  const p = state.summary;
  const rows: [string, string][] = [
    ['HTTP status', p.mainDocument?.statusCode !== undefined ? String(p.mainDocument.statusCode) : '—'],
    ['Final URL', p.finalUrl || '—'],
    ['Redirects', p.redirects.length > 1 ? p.redirects.map((r) => r.url).join(' → ') : 'None'],
    ['Protocol', p.mainDocument?.protocol ?? '—'],
    ['Server response time', fmtMs(p.serverResponseMs)],
    ['First Contentful Paint', fmtMs(p.fcpMs)],
    ['Largest Contentful Paint', fmtMs(p.lcpMs)],
    ['Total Blocking Time', fmtMs(p.tbtMs)],
    ['Cumulative Layout Shift', p.cls === undefined ? '—' : p.cls.toFixed(3)],
    ['Page weight', p.totalBytes === undefined ? '—' : `${fmtBytes(p.totalBytes)}${p.requestCount ? ` in ${p.requestCount} request${p.requestCount === 1 ? '' : 's'}` : ''}`],
    ['Performance score', p.performanceScore === undefined ? '—' : `${Math.round(p.performanceScore * 100)} / 100`],
    ['Tested', `${p.fetchTime ? new Date(p.fetchTime).toLocaleString() : '—'} · Lighthouse ${p.lighthouseVersion || '?'} · ${p.formFactor || '?'}`],
  ];
  return (
    <>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-words tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-4 text-sm font-semibold">Real-user data</h4>
      {p.field ? (
        <ul className="mt-1 text-sm">
          <li className="text-muted">Scope: {p.field.scope === 'url' ? 'this URL' : 'whole origin (not enough data for this URL)'}</li>
          {p.field.metrics.map((m) => (
            <li key={m.key}>
              {m.label}: <span className="tabular-nums">{m.unit === 'ms' ? fmtMs(m.percentile) : m.percentile.toFixed(2)}</span>{' '}
              <span className="text-muted">({m.category.toLowerCase().replace(/_/g, ' ')})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted">Not available. Google has too little Chrome traffic data for this URL and site.</p>
      )}
      {p.runWarnings.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-xs text-warn">
          {p.runWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProbePanel({ state, httpOnly }: { state: ProbeState; httpOnly: boolean }) {
  if (state.state === 'off')
    return <p className="mt-2 text-sm text-muted">{httpOnly ? 'Skipped: browsers block http:// requests from an https:// page.' : 'Not selected for this run.'}</p>;
  if (state.state === 'cancelled') return <p className="mt-2 text-sm text-muted">Cancelled.</p>;
  const samples = state.state === 'running' ? state.samples : state.summary.samples;
  const s = state.state === 'ok' ? state.summary : null;
  return (
    <>
      {s && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Successful</dt>
          <dd>
            {s.successful} of {s.samples.length}
          </dd>
          <dt className="text-muted">First request</dt>
          <dd className="tabular-nums">{fmtMs(s.firstMs)}</dd>
          <dt className="text-muted">Median (all)</dt>
          <dd className="tabular-nums">{fmtMs(s.medianMs)}</dd>
          <dt className="text-muted">Median of repeats</dt>
          <dd className="tabular-nums">{fmtMs(s.repeatMedianMs)}</dd>
          <dt className="text-muted">Range</dt>
          <dd className="tabular-nums">
            {fmtMs(s.minMs)} – {fmtMs(s.maxMs)}
          </dd>
          <dt className="text-muted">HTTP status</dt>
          <dd className="text-muted">Not visible to the browser (opaque response)</dd>
        </dl>
      )}
      <ol className="mt-3 space-y-1 text-sm">
        {samples.map((x) => (
          <li key={x.attempt} className="flex flex-wrap gap-x-2">
            <span className="text-muted">#{x.attempt}</span>
            {x.ok ? <span className="tabular-nums">{fmtMs(x.totalMs)}</span> : <span className="text-danger">{x.error}</span>}
          </li>
        ))}
      </ol>
    </>
  );
}
