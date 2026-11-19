import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  TOOL,
  normalizeUrl,
  rateFieldCategory,
  rateMetric,
  runBrowserProbe,
  runPageSpeed,
  urlFindings,
  type PageSpeedResult,
  type ProbeSample,
  type ProbeSummary,
  type PsiSummary,
  type RatedMetric,
  type Rating,
  type Strategy,
  type UrlFinding,
} from '../../core';
import { SITE } from '../config';
import { Button, Card, SeverityBadge, downloadJson } from '../ui';

const PSI_TIMEOUT_MS = 90_000;
const PROBE_COUNT = 5;
const PROBE_TIMEOUT_MS = 10_000;

type PsiState = { state: 'running' } | { state: 'done'; result: PageSpeedResult } | { state: 'cancelled' };
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
const pageSpeedSiteUrl = (url: string, strategy: Strategy) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;

export function UrlCheck() {
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('mobile');
  const [useProbe, setUseProbe] = useState(false);
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

  const probeTask = async (url: string) => {
    const samples: ProbeSample[] = [];
    update({ probe: { state: 'running', samples: [] } });
    const summary = await runBrowserProbe(url, PROBE_COUNT, PROBE_TIMEOUT_MS, undefined, (s) => {
      samples.push(s);
      if (!cancelledRef.current) update({ probe: { state: 'running', samples: [...samples] } });
    });
    update({ probe: cancelledRef.current ? { state: 'cancelled' } : { state: 'ok', summary } });
  };

  const start = async (e?: FormEvent) => {
    e?.preventDefault();
    const n = normalizeUrl(input);
    if (!n.ok) {
      setInputError(n.error);
      return;
    }
    setInputError(null);
    setInput(n.url);
    setElapsed(0);
    cancelledRef.current = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const probeAllowed = useProbe && n.url.startsWith('https:');
    setRun({ url: n.url, host: n.host, notes: n.notes, strategy, startedAt: new Date(), psi: { state: 'running' }, probe: probeAllowed ? { state: 'running', samples: [] } : { state: 'off' } });

    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), PSI_TIMEOUT_MS);
    const psiTask = runPageSpeed(n.url, strategy, { proxyUrl: SITE.psiProxyUrl || undefined, signal: ctrl.signal })
      .then((result) => update({ psi: cancelledRef.current ? { state: 'cancelled' } : { state: 'done', result } }))
      .finally(() => clearTimeout(timer));

    await Promise.allSettled([psiTask, probeAllowed ? probeTask(n.url) : Promise.resolve()]);
    update({ finishedAt: new Date() });
    requestAnimationFrame(() => resultsRef.current?.focus());
  };

  const cancel = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  };

  const runProbeOnly = async () => {
    if (!run || !run.url.startsWith('https:')) return;
    cancelledRef.current = false;
    await probeTask(run.url);
    update({ finishedAt: new Date() });
  };

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl">
        <h2 className="text-xl font-semibold">Analyze a website</h2>
        <p className="mt-1 text-sm text-muted">
          Enter a public web address. TraceDetective runs Google’s PageSpeed Insights test and shows how the page loads in a lab test and, when Google has
          enough visits, for real Chrome users. No account or setup needed.
        </p>
        <form onSubmit={start} className="mt-4 space-y-3" noValidate>
          <label htmlFor="url-input" className="sr-only">
            Website URL
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="url-input"
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com"
              aria-invalid={!!inputError}
              aria-describedby={inputError ? 'url-error' : 'url-help'}
              disabled={running}
              className="min-w-0 flex-1 rounded-lg border border-line bg-navy px-3 py-3 text-base"
            />
            {running ? (
              <Button onClick={cancel} className="py-3">
                Cancel
              </Button>
            ) : (
              <Button type="submit" variant="primary" className="py-3 text-base">
                Analyze Website
              </Button>
            )}
          </div>
          {inputError ? (
            <p id="url-error" role="alert" className="text-sm text-danger">
              {inputError}
            </p>
          ) : (
            <p id="url-help" className="text-xs text-muted">
              Public websites only. The address is sent to Google PageSpeed Insights{SITE.psiProxyUrl ? ' through the TraceDetective analysis service' : ''}. Nothing else
              about you is sent. <Link to="/docs#privacy">Privacy</Link>
            </p>
          )}

          <details className="rounded-xl border border-line px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">Advanced options</summary>
            <fieldset className="mt-3" disabled={running}>
              <legend className="font-semibold">Test device</legend>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                {(['mobile', 'desktop'] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2">
                    <input type="radio" name="strategy" value={s} checked={strategy === s} onChange={() => setStrategy(s)} />
                    {s === 'mobile' ? 'Mobile (default: mid-range phone, slow 4G)' : 'Desktop'}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mt-4 flex gap-3">
              <input type="checkbox" checked={useProbe} onChange={(e) => setUseProbe(e.target.checked)} disabled={running} className="mt-1" />
              <span>
                <span className="font-semibold">Also time the site from my browser ({PROBE_COUNT} requests)</span>
                <span className="mt-1 block text-muted">
                  Your browser requests the address {PROBE_COUNT} times and measures how long each answer takes from your network. Browsers keep other sites’
                  responses private (CORS), so this check cannot see status codes, redirects or page content, and shows DNS and connection times only if
                  the site allows it. Some sites or extensions block it. No cookies are sent.
                </span>
              </span>
            </label>
          </details>
        </form>
      </Card>

      {run && <Results run={run} elapsed={elapsed} running={running} headingRef={resultsRef} onRetry={() => void start()} onProbe={() => void runProbeOnly()} />}
    </div>
  );
}

function Results({
  run,
  elapsed,
  running,
  headingRef,
  onRetry,
  onProbe,
}: {
  run: Run;
  elapsed: number;
  running: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onRetry: () => void;
  onProbe: () => void;
}) {
  const result = run.psi.state === 'done' ? run.psi.result : null;
  const psi = result?.ok ? result.summary : null;
  const probe = run.probe.state === 'ok' ? run.probe.summary : null;
  const findings: UrlFinding[] = running ? [] : urlFindings(psi, probe);

  const exportReport = () => {
    downloadJson(`tracedetective-website-${run.host}-${run.startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, {
      kind: 'website-analysis',
      provenance: {
        tool: TOOL,
        generatedAt: new Date().toISOString(),
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        browserUserAgent: navigator.userAgent,
        measuredBy: result ? (result.via === 'proxy' ? 'Google PageSpeed Insights via the TraceDetective analysis service' : 'Google PageSpeed Insights') : null,
        cachedResult: result?.ok ? result.cached : false,
        dataNotice: 'External measurements of a public URL. They describe what a visitor sees and cannot show server-internal causes.',
      },
      input: { url: run.url, notes: run.notes, device: run.strategy },
      labData: psi
        ? {
            description: 'Lighthouse: one simulated page load in Google’s test environment.',
            finalUrl: psi.finalUrl,
            httpStatus: psi.mainDocument?.statusCode,
            protocol: psi.mainDocument?.protocol,
            redirects: psi.redirects,
            serverResponseMs: psi.serverResponseMs,
            fcpMs: psi.fcpMs,
            lcpMs: psi.lcpMs,
            tbtMs: psi.tbtMs,
            cls: psi.cls,
            speedIndexMs: psi.speedIndexMs,
            totalBytes: psi.totalBytes,
            requestCount: psi.requestCount,
            performanceScore: psi.performanceScore,
            lighthouseVersion: psi.lighthouseVersion,
            testedAt: psi.fetchTime,
            warnings: psi.runWarnings,
          }
        : null,
      fieldData: psi?.field
        ? { description: 'Chrome UX Report: 75th percentile of real Chrome users over the last 28 days.', scope: psi.field.scope, overall: psi.field.overall, metrics: psi.field.metrics }
        : null,
      pageSpeedError: result && !result.ok ? result.error : null,
      browserProbe: probe ?? (run.probe.state === 'off' ? 'not run' : run.probe),
      findings,
    });
  };

  return (
    <section aria-labelledby="url-results-h" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="url-results-h" ref={headingRef} tabIndex={-1} className="min-w-0 text-xl font-bold outline-none">
          Results for <span className="break-all font-mono text-base">{run.url}</span>
        </h2>
        {!running && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={exportReport}>
              Export Report
            </Button>
            <a
              href={pageSpeedSiteUrl(run.url, run.strategy)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-muted no-underline hover:bg-surface-2 hover:text-ink hover:no-underline"
            >
              Full report on PageSpeed Insights ↗
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
            {run.psi.state === 'running' ? `Loading the page in Google’s test browser… ${elapsed} s (usually 15–60 s)` : 'Finishing the browser timing check…'}
            {run.probe.state === 'running' && ` · Browser timing ${run.probe.samples.length}/${PROBE_COUNT}`}
          </p>
        ) : (
          <p className="text-muted">
            {run.strategy === 'mobile' ? 'Mobile' : 'Desktop'} test · finished {(run.finishedAt ?? new Date()).toLocaleString()}
            {result?.ok && result.cached ? ' · reused a result from the last 15 minutes' : ''}
          </p>
        )}
      </div>

      {result && !result.ok && <PsiErrorCard run={run} result={result} onRetry={onRetry} onProbe={onProbe} />}
      {run.psi.state === 'cancelled' && <p className="text-sm text-muted">Cancelled.</p>}

      {psi && (
        <>
          <Overview psi={psi} />
          <LabSection psi={psi} strategy={run.strategy} />
          <FieldSection psi={psi} />
        </>
      )}

      {run.probe.state !== 'off' && <ProbeSection state={run.probe} />}

      {!running && findings.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold">Findings</h3>
          <p className="mt-1 text-sm text-muted">Shown only when a measured value crosses a published threshold. Each finding says which measurement it comes from.</p>
          <ul className="mt-3 space-y-4">
            {findings.map((f) => (
              <li key={f.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <h4 className="font-semibold">{f.title}</h4>
                  <SourceTag source={f.source} />
                </div>
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Evidence</p>
                <ul className="list-disc pl-5 text-sm">
                  {f.evidence.map((e) => (
                    <li key={e} className="break-words">
                      {e}
                    </li>
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
        </Card>
      )}

      {!running && (psi || probe) && <Methodology strategy={run.strategy} />}
    </section>
  );
}

function SourceTag({ source }: { source: UrlFinding['source'] }) {
  const style = source === 'Lighthouse lab test' ? 'border-violet/60 text-violet' : source === 'Chrome real-user data' ? 'border-teal/60 text-teal' : 'border-cyan/60 text-cyan';
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>{source}</span>;
}

function PsiErrorCard({ run, result, onRetry, onProbe }: { run: Run; result: Extract<PageSpeedResult, { ok: false }>; onRetry: () => void; onProbe: () => void }) {
  const { error } = result;
  const titles: Record<string, string> = {
    quota: 'The lab test is unavailable right now',
    rate_limited: 'Please wait a moment',
    busy: 'The analysis service is busy',
    invalid: 'This address cannot be analysed',
    lighthouse: 'Google could not load this page',
    timeout: 'The test took too long',
    network: 'The analysis service could not be reached',
    unknown: 'The analysis did not complete',
  };
  const retryable = error.kind !== 'invalid';
  const canProbe = run.probe.state === 'off' && run.url.startsWith('https:');
  return (
    <Card className="border-warn/60">
      <div role="alert">
        <h3 className="text-lg font-semibold text-warn">{titles[error.kind] ?? titles.unknown}</h3>
        <p className="mt-2 text-sm">{error.message}</p>
        <p className="mt-2 text-sm text-muted">No lab or real-user results are shown, because none were measured.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {retryable && <Button onClick={onRetry}>Try again</Button>}
        <a
          href={pageSpeedSiteUrl(run.url, run.strategy)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-cyan hover:no-underline"
        >
          Open on PageSpeed Insights ↗
        </a>
        {canProbe && (
          <Button variant="ghost" onClick={onProbe}>
            Time it from my browser instead
          </Button>
        )}
      </div>
    </Card>
  );
}

function Overview({ psi }: { psi: PsiSummary }) {
  const status = psi.mainDocument?.statusCode;
  const redirects = Math.max(0, psi.redirects.length - 1);
  return (
    <Card>
      <h3 className="text-lg font-semibold">Overview</h3>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <Fact label="HTTP status" value={status === undefined ? '—' : String(status)} tone={status !== undefined && status >= 400 ? 'poor' : undefined} />
        <Fact label="Redirects" value={redirects === 0 ? 'None' : String(redirects)} tone={redirects > 1 ? 'needs-improvement' : undefined} />
        <Fact label="Server response" value={fmtMs(psi.serverResponseMs)} tone={psi.serverResponseMs === undefined ? undefined : rateMetric('serverResponse', psi.serverResponseMs)} />
        <Fact label="Performance score" value={psi.performanceScore === undefined ? '—' : `${Math.round(psi.performanceScore * 100)} / 100`} />
      </dl>
      <p className="mt-3 break-all text-xs text-muted">
        Final address: {psi.finalUrl || '—'}
        {psi.mainDocument?.protocol ? ` · ${psi.mainDocument.protocol}` : ''}
        {psi.redirects.length > 1 ? ` · ${psi.redirects.map((r) => r.url).join(' → ')}` : ''}
      </p>
    </Card>
  );
}

const ratingText: Record<Rating, string> = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor' };
const ratingStyle: Record<Rating, string> = { good: 'text-teal', 'needs-improvement': 'text-warn', poor: 'text-danger' };

function Fact({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: Rating; hint?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      {tone && <dd className={`text-xs font-semibold ${ratingStyle[tone]}`}>{ratingText[tone]}</dd>}
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function LabSection({ psi, strategy }: { psi: PsiSummary; strategy: Strategy }) {
  const metric = (label: string, key: RatedMetric, v: number | undefined, isScore = false) => (
    <Fact key={label} label={label} value={v === undefined ? '—' : isScore ? v.toFixed(3) : fmtMs(v)} tone={v === undefined ? undefined : rateMetric(key, v)} />
  );
  return (
    <Card aria-labelledby="lab-h">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="lab-h" className="text-lg font-semibold">
          Lab test
        </h3>
        <span className="rounded-full border border-violet/60 px-2 py-0.5 text-xs font-semibold text-violet">Lighthouse · simulated</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        One page load in Google’s test environment, {strategy === 'mobile' ? 'as a mid-range phone on a slow 4G connection' : 'as a desktop computer'}. Useful for finding
        causes and comparing changes. It is not what your visitors experience on average.
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
        {metric('First Contentful Paint', 'fcp', psi.fcpMs)}
        {metric('Largest Contentful Paint', 'lcp', psi.lcpMs)}
        {metric('Total Blocking Time', 'tbt', psi.tbtMs)}
        {metric('Cumulative Layout Shift', 'cls', psi.cls, true)}
        {metric('Speed Index', 'speedIndex', psi.speedIndexMs)}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Page weight {fmtBytes(psi.totalBytes)}
        {psi.requestCount ? ` in ${psi.requestCount} request${psi.requestCount === 1 ? '' : 's'}` : ''} · Lighthouse {psi.lighthouseVersion || '?'}
        {psi.fetchTime ? ` · tested ${new Date(psi.fetchTime).toLocaleString()}` : ''}
      </p>
      {psi.runWarnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-warn">
          {psi.runWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FieldSection({ psi }: { psi: PsiSummary }) {
  return (
    <Card aria-labelledby="field-h">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="field-h" className="text-lg font-semibold">
          Real users
        </h3>
        <span className="rounded-full border border-teal/60 px-2 py-0.5 text-xs font-semibold text-teal">Chrome UX Report · last 28 days</span>
      </div>
      {psi.field ? (
        <>
          <p className="mt-1 text-sm text-muted">
            What real Chrome users experienced {psi.field.scope === 'url' ? 'on this page' : 'across the whole site (this page has too few visits on its own)'}. Each value
            is the 75th percentile: 3 out of 4 visits were at least this fast.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
            {psi.field.metrics.map((m) => (
              <Fact key={m.key} label={m.label.replace(' (p75)', '')} value={m.unit === 'ms' ? fmtMs(m.percentile) : m.percentile.toFixed(2)} tone={rateFieldCategory(m.category)} />
            ))}
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Not available. Google publishes real-user data only for pages and sites with enough Chrome visits. The lab test above is still valid; it just cannot say
          what real visitors experience.
        </p>
      )}
    </Card>
  );
}

function ProbeSection({ state }: { state: ProbeState }) {
  if (state.state === 'off') return null;
  const samples = state.state === 'running' ? state.samples : state.state === 'ok' ? state.summary.samples : [];
  const s = state.state === 'ok' ? state.summary : null;
  const breakdown = s?.samples.find((x) => x.breakdown)?.breakdown;
  return (
    <Card aria-labelledby="probe-h">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id="probe-h" className="text-lg font-semibold">
          From your browser
        </h3>
        <span className="rounded-full border border-cyan/60 px-2 py-0.5 text-xs font-semibold text-cyan">Browser probe · your network</span>
      </div>
      {state.state === 'cancelled' ? (
        <p className="mt-2 text-sm text-muted">Cancelled.</p>
      ) : (
        <>
          {s && (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label="Successful" value={`${s.successful} of ${s.samples.length}`} />
              <Fact label="First request" value={fmtMs(s.firstMs)} hint="includes connection setup" />
              <Fact label="Median of repeats" value={fmtMs(s.repeatMedianMs)} />
              <Fact label="Range" value={`${fmtMs(s.minMs)} – ${fmtMs(s.maxMs)}`} />
            </dl>
          )}
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {samples.map((x) => (
              <li key={x.attempt}>
                <span className="text-muted">#{x.attempt}</span> {x.ok ? <span className="tabular-nums">{fmtMs(x.totalMs)}</span> : <span className="text-danger">{x.error}</span>}
              </li>
            ))}
          </ol>
          <h4 className="mt-4 text-sm font-semibold">Connection timing (DNS, TCP, TLS)</h4>
          {breakdown ? (
            <p className="mt-1 text-sm tabular-nums">
              DNS {fmtMs(breakdown.dnsMs)} · connect {fmtMs(breakdown.connectMs)} · TLS {fmtMs(breakdown.tlsMs)} · waiting {fmtMs(breakdown.waitMs)} · download {fmtMs(breakdown.downloadMs)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Not available. Browsers only share these times for another site when that site sends a <code>Timing-Allow-Origin</code> header. Status codes are never
              visible to this check.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function Methodology({ strategy }: { strategy: Strategy }) {
  return (
    <details className="rounded-2xl border border-line bg-surface p-5 text-sm">
      <summary className="cursor-pointer font-semibold">How these numbers were measured</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
        <li>
          <strong className="text-ink">Lab test</strong>: Google PageSpeed Insights runs Lighthouse from Google’s data centres
          {strategy === 'mobile' ? ', emulating a mid-range phone on slow 4G' : ' with a desktop profile'}. HTTP status, redirects and server response time come from
          that test browser’s request for the page. One run is one sample.
        </li>
        <li>
          <strong className="text-ink">Real users</strong>: the Chrome UX Report, collected from Chrome users who opted in, over a rolling 28-day window, reported at the
          75th percentile. Shown only when Google has enough data.
        </li>
        <li>
          <strong className="text-ink">Browser probe</strong> (optional): {PROBE_COUNT} sequential <code>GET</code> requests from your browser with <code>mode: no-cors</code>,
          no cookies, no referrer and caching disabled, timed with <code>performance.now()</code>. Results include your own network. DNS, TCP and TLS times are shown only
          when the site sends a <code>Timing-Allow-Origin</code> header.
        </li>
        <li>Ratings use the Core Web Vitals boundaries (LCP 2.5 s / 4 s, CLS 0.1 / 0.25, INP 200 / 500 ms) and Lighthouse boundaries for lab-only metrics.</li>
        <li>An outside test cannot see inside the server. Confirm causes with server logs or traces; you can analyse traces on the <Link to="/analyze/upload">Upload trace</Link> page.</li>
      </ul>
    </details>
  );
}
