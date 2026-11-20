import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TOOL, buildFindings, detectPlatform, normalizeUrl, runBrowserProbe, runPageSpeed, type PageSpeedResult, type ProbeSample, type Strategy } from '../../core';
import { SITE } from '../config';
import { Button, Card, downloadJson } from '../ui';
import { UrlForm, parseCheckParams, reportPath, type CheckParams } from '../website/UrlForm';
import { readWebsiteReports, saveWebsiteReport } from '../website/savedReports';
import {
  Boundary,
  DiagnosisStart,
  DeviceComparison,
  Findings,
  InterpretationGuide,
  LcpSection,
  TimeBreakdown,
  Methodology,
  Metrics,
  Preview,
  ProbeSection,
  PsiErrorCard,
  Summary,
  Verdict,
  Waterfall,
  pageSpeedSiteUrl,
  type ProbeState,
} from '../website/Report';

const PSI_TIMEOUT_MS = 90_000;
const PROBE_COUNT = 5;
const PROBE_TIMEOUT_MS = 10_000;

type PsiState = { state: 'running' } | { state: 'done'; result: PageSpeedResult } | { state: 'cancelled' };

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

type Runs = Partial<Record<Strategy, Run>>;

export function UrlCheck() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const params = useMemo(() => parseCheckParams(search), [search]);
  const nonce = search.get('run') ?? '';
  const [runs, setRuns] = useState<Runs>({});
  const [elapsed, setElapsed] = useState(0);
  const [inputError, setInputError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const startedKey = useRef('');
  const resultsRef = useRef<HTMLHeadingElement>(null);

  const requestedDevice: Strategy = params?.device ?? 'mobile';
  const requestedRun = runs[requestedDevice];
  const otherRun = runs[requestedDevice === 'mobile' ? 'desktop' : 'mobile'];
  const requestedFailed = requestedRun?.psi.state === 'done' && !requestedRun.psi.result.ok;
  const run = params?.compare && requestedFailed && otherRun?.psi.state === 'done' && otherRun.psi.result.ok ? otherRun : requestedRun;
  const device: Strategy = run?.strategy ?? requestedDevice;
  const runDevices: Strategy[] = params?.compare ? ['mobile', 'desktop'] : [device];
  const running = runDevices.some((strategy) => {
    const current = runs[strategy];
    return !!current && (current.psi.state === 'running' || current.probe.state === 'running');
  });

  useEffect(() => {
    if (!running || !run) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - run.startedAt.getTime()) / 1000)), 500);
    return () => clearInterval(t);
  }, [running, run]);

  useEffect(() => {
    if (!params) return;
    const strategies: Strategy[] = params.compare ? ['mobile', 'desktop'] : [params.device];
    const completed = strategies.map((strategy) => runs[strategy]).filter((item): item is Run => !!item && item.psi.state === 'done');
    if (completed.length !== strategies.length || completed.length === 0) return;
    const first = completed[0]!;
    const reportId = `${first.url}|${first.startedAt.getTime()}`;
    saveWebsiteReport({
      id: reportId,
      url: first.url,
      host: first.host,
      notes: first.notes,
      startedAt: first.startedAt.toISOString(),
      finishedAt: new Date(Math.max(...completed.map((item) => (item.finishedAt ?? new Date()).getTime()))).toISOString(),
      params,
      results: Object.fromEntries(completed.map((item) => [item.strategy, item.psi.state === 'done' ? item.psi.result : undefined])),
    });
  }, [runs, params]);

  const update = (strategy: Strategy, patch: Partial<Run>) => setRuns((rs) => (rs[strategy] ? { ...rs, [strategy]: { ...rs[strategy]!, ...patch } } : rs));

  const probeTask = async (strategy: Strategy, url: string) => {
    const samples: ProbeSample[] = [];
    update(strategy, { probe: { state: 'running', samples: [] } });
    const summary = await runBrowserProbe(url, PROBE_COUNT, PROBE_TIMEOUT_MS, undefined, (s) => {
      samples.push(s);
      if (!cancelledRef.current) update(strategy, { probe: { state: 'running', samples: [...samples] } });
    });
    update(strategy, { probe: cancelledRef.current ? { state: 'cancelled' } : { state: 'ok', summary } });
  };

  const start = async (p: CheckParams, fresh = false) => {
    const n = normalizeUrl(p.url);
    if (!n.ok) {
      setInputError(n.error);
      return;
    }
    setInputError(null);
    setElapsed(0);
    cancelledRef.current = false;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const strategies: Strategy[] = p.compare ? ['mobile', 'desktop'] : [p.device];
    const probeAllowed = p.probe && n.url.startsWith('https:');
    const startedAt = new Date();
    setRuns((rs) => {
      // A different address clears old results. A comparison starts both device runs together.
      const keep = Object.fromEntries(Object.entries(rs).filter(([k, r]) => !strategies.includes(k as Strategy) && r?.url === n.url)) as Runs;
      for (const strategy of strategies) {
        keep[strategy] = { url: n.url, host: n.host, notes: n.notes, strategy, startedAt, psi: { state: 'running' }, probe: probeAllowed && strategy === p.device ? { state: 'running', samples: [] } : { state: 'off' } };
      }
      return keep;
    });
    const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), PSI_TIMEOUT_MS);
    const completedResults: Partial<Record<Strategy, PageSpeedResult>> = {};
    const psiTasks = strategies.map(async (strategy) => {
      try {
        const result = await runPageSpeed(n.url, strategy, { proxyUrl: SITE.psiProxyUrl || undefined, signal: ctrl.signal, fresh });
        completedResults[strategy] = result;
        update(strategy, { psi: cancelledRef.current ? { state: 'cancelled' } : { state: 'done', result } });
      } finally {
        update(strategy, { finishedAt: new Date() });
      }
    });
    await Promise.allSettled([...psiTasks, probeAllowed ? probeTask(p.device, n.url) : Promise.resolve()]);
    clearTimeout(timer);
    if (!cancelledRef.current && Object.keys(completedResults).length > 0) {
      saveWebsiteReport({
        id: `${n.url}|${startedAt.getTime()}`,
        url: n.url,
        host: n.host,
        notes: n.notes,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        params: p,
        results: completedResults,
      });
    }
    requestAnimationFrame(() => resultsRef.current?.focus());
  };

  // The address is the source of truth: opening /analyze/url?url=…&device=… runs the check.
  useEffect(() => {
    if (!params) return;
    const key = `${params.url}|${params.device}|${params.compare}|${params.probe}|${nonce}`;
    if (startedKey.current === key) return;
    const existing = runs[params.device];
    startedKey.current = key;
    const norm = normalizeUrl(params.url);
    if (!nonce && existing && norm.ok && existing.url === norm.url && existing.psi.state !== 'running') return;
    void start(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, nonce]);

  const cancel = () => {
    cancelledRef.current = true;
    abortRef.current?.abort();
  };

  const go = (p: CheckParams, replaceNonce = true) => navigate(`${reportPath(p)}${replaceNonce ? `&run=${Date.now().toString(36)}` : ''}`);

  const selectDevice = (next: Strategy) => {
    if (!params || next === device) return;
    if (runs[next]?.psi.state === 'done') navigate(reportPath({ ...params, device: next }));
    else go({ ...params, device: next });
  };

  const compareDevices = () => {
    if (params) go({ ...params, compare: true });
  };

  return (
    <div className="space-y-6">
      <Card className="max-w-3xl">
        <h2 className="sr-only">Website to check</h2>
        <div>
          <UrlForm initial={params ?? undefined} running={running} onCancel={cancel} />
        </div>
        {inputError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {inputError}
          </p>
        )}
      </Card>

      {run && params && (
        <Results
          key={`${run.url}-${device}`}
          run={run}
          runs={runs}
          params={params}
          elapsed={elapsed}
          running={running}
          headingRef={resultsRef}
          onFresh={() => void start(params, true)}
          onRetry={() => void start(params)}
          onProbe={() => {
            cancelledRef.current = false;
            void probeTask(device, run.url).then(() => update(device, { finishedAt: new Date() }));
          }}
          onSelectDevice={selectDevice}
          onCompareDevices={compareDevices}
          shareUrl={`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${reportPath(params)}`}
        />
      )}

      {!params && <Boundary />}
    </div>
  );
}

function Results({
  run,
  runs,
  params,
  elapsed,
  running,
  headingRef,
  onFresh,
  onRetry,
  onProbe,
  onSelectDevice,
  onCompareDevices,
  shareUrl,
}: {
  run: Run;
  runs: Runs;
  params: CheckParams;
  elapsed: number;
  running: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onFresh: () => void;
  onRetry: () => void;
  onProbe: () => void;
  onSelectDevice: (strategy: Strategy) => void;
  onCompareDevices: () => void;
  shareUrl: string;
}) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const result = run.psi.state === 'done' ? run.psi.result : null;
  const psi = result?.ok ? result.summary : null;
  const probe = run.probe.state === 'ok' ? run.probe.summary : null;
  const findings = useMemo(() => (running ? [] : buildFindings(psi, probe, { platform: params.platform || undefined })), [running, psi, probe, params.platform]);
  const mobile = runs.mobile?.psi.state === 'done' && runs.mobile.psi.result.ok ? runs.mobile.psi.result.summary : null;
  const desktop = runs.desktop?.psi.state === 'done' && runs.desktop.psi.result.ok ? runs.desktop.psi.result.summary : null;
  const pendingDevices = params.compare ? (['mobile', 'desktop'] as const).filter((strategy) => runs[strategy]?.psi.state === 'running') : run.psi.state === 'running' ? [run.strategy] : [];
  const fullReport = pageSpeedSiteUrl(run.url, run.strategy);
  const savedReportId = `${run.url}|${run.startedAt.getTime()}`;
  const reportSaved = !running && readWebsiteReports().some((saved) => saved.id === savedReportId);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied('copied');
    } catch {
      setCopied('failed');
    }
  };

  const exportReport = () => {
    const platform = psi ? detectPlatform(psi.requests ?? []) : null;
    downloadJson(`tracedetective-website-${run.host}-${run.strategy}-${run.startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`, {
      kind: 'website-analysis',
      reportVersion: 2,
      provenance: {
        tool: TOOL,
        generatedAt: new Date().toISOString(),
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        browserUserAgent: navigator.userAgent,
        measuredBy: result ? (result.via === 'proxy' ? 'Google PageSpeed Insights via the TraceDetective analysis service' : 'Google PageSpeed Insights') : null,
        cachedResult: result?.ok ? result.cached : false,
        lighthouseVersion: psi?.lighthouseVersion,
        dataNotice: 'External measurements of a public URL. They describe what a browser sees and cannot show server-internal causes (code, database).',
        shareLink: shareUrl,
      },
      input: { url: run.url, notes: run.notes, device: run.strategy, platformSelected: params.platform || null },
      platform,
      labData: psi
        ? {
            description: 'Lighthouse: one simulated page load in Google’s test environment.',
            finalUrl: psi.finalUrl,
            httpStatus: psi.mainDocument?.statusCode,
            redirects: psi.redirects,
            performanceScore: psi.performanceScore,
            serverResponseMs: psi.serverResponseMs,
            ttfbMs: psi.ttfbMs,
            fcpMs: psi.fcpMs,
            lcpMs: psi.lcpMs,
            tbtMs: psi.tbtMs,
            cls: psi.cls,
            speedIndexMs: psi.speedIndexMs,
            totalBytes: psi.totalBytes,
            requestCount: psi.requestCount,
            lcp: psi.lcp,
            requests: psi.requests,
            pageSpeedChecks: psi.insights,
            runWarnings: psi.runWarnings,
          }
        : null,
      fieldData: psi?.field
        ? { description: 'Chrome UX Report: 75th percentile of real Chrome users over the last 28 days.', scope: psi.field.scope, overall: psi.field.overall, metrics: psi.field.metrics }
        : null,
      pageSpeedError: result && !result.ok ? result.error : null,
      browserProbe: probe ?? (run.probe.state === 'off' ? 'not run' : run.probe),
      findings,
      ...(params.compare ? { deviceResults: { mobile, desktop } } : {}),
    });
  };

  return (
    <section aria-labelledby="url-results-h" className="space-y-6">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <h2 id="url-results-h" ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            Report for <span className="break-all font-mono text-base">{run.url}</span>
          </h2>
          <div aria-live="polite" className="mt-1 text-sm">
            {running ? (
              <p className="flex items-center gap-2 text-cyan">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-cyan" aria-hidden="true" />
                {pendingDevices.length > 0 ? `Google is running fresh ${pendingDevices.join(' and ')} lab tests… ${elapsed} s elapsed (can take up to 90 s)` : 'The lab report is ready; finishing the optional browser timing check…'}
              </p>
            ) : (
              <p className="text-muted">
                {run.strategy === 'mobile' ? 'Mobile' : 'Desktop'} test · finished {(run.finishedAt ?? new Date()).toLocaleString()}
                {result?.ok && result.cached ? ' · result reused from the last 15 minutes' : ''}
              </p>
            )}
          </div>
        </div>
        {!running && (
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="primary" onClick={onFresh}>
              {params.compare ? 'Run both tests again' : 'Run a fresh test'}
            </Button>
            {reportSaved ? (
              <Link to={`/reports?website=${encodeURIComponent(savedReportId)}`} className="inline-flex items-center rounded-lg border border-cyan/60 bg-cyan/10 px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-cyan hover:no-underline">Open in Reports</Link>
            ) : <span role="status" className="self-center text-xs text-warn">This browser could not keep a session copy. Export the report before leaving.</span>}
            {!params.compare && <Button onClick={onCompareDevices}>Compare mobile + desktop</Button>}
            <Button onClick={() => void copyLink()}>Copy share link</Button>
            <Button onClick={exportReport}>Export Report</Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print or save as PDF
            </Button>
          </div>
        )}
        {running && (
          <p className="no-print text-sm text-cyan">This run continues if you open another section. When both tests finish, its results will appear in <Link to="/reports" className="font-semibold underline">Reports</Link>.</p>
        )}
      </div>
      {!running && !params.compare && (
        <div className="rounded-xl border border-line bg-surface-2/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Test device</p>
              <p className="text-xs text-muted">Switch the detailed report, or use the side-by-side comparison above. Each column is its own Lighthouse run.</p>
            </div>
            <div role="group" aria-label="Choose report device" className="flex gap-1 rounded-lg border border-line p-1">
              {(['mobile', 'desktop'] as const).map((option) => {
                const isActive = run.strategy === option;
                const done = runs[option]?.psi.state === 'done';
                return (
                  <button key={option} type="button" aria-pressed={isActive} onClick={() => onSelectDevice(option)} className={`rounded-md px-4 py-2 text-sm font-semibold capitalize ${isActive ? 'bg-violet text-navy' : 'text-muted hover:text-ink'}`}>
                    {option}{done && !isActive ? ' · ready' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {copied !== 'idle' && (
        <p role="status" className="no-print text-sm">
          {copied === 'copied' ? 'Link copied. Opening it runs the same check (results are reused for 15 minutes).' : 'Copy failed. Copy this link:'}{' '}
          {copied === 'failed' && <input readOnly value={shareUrl} aria-label="Share link" className="w-full rounded border border-line bg-navy px-2 py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />}
        </p>
      )}

      {run.notes.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted">
          {run.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {result && !result.ok && <PsiErrorCard url={run.url} strategy={run.strategy} result={result} canProbe={run.probe.state === 'off' && run.url.startsWith('https:')} onRetry={onRetry} onProbe={onProbe} />}
      {params.compare && (['mobile', 'desktop'] as const).map((strategy) => {
        const failed = runs[strategy]?.psi;
        if (strategy === run.strategy || failed?.state !== 'done' || failed.result.ok) return null;
        return <Card key={strategy} className="border-warn/60"><h3 className="font-semibold capitalize">{strategy} test needs attention</h3><p className="mt-1 text-sm">{failed.result.error.message}</p><Button className="mt-3" onClick={onRetry}>Try both tests again</Button></Card>;
      })}
      {run.psi.state === 'cancelled' && <p className="text-sm text-muted">Cancelled.</p>}

      {psi && !running && (
        <>
          {!params.compare && <Card><Verdict psi={psi} findings={findings} /></Card>}
          {!params.compare && <Summary psi={psi} selectedPlatform={params.platform} />}
          <InterpretationGuide />
          {mobile && desktop ? (
            <>
              <DeviceComparison mobile={mobile} desktop={desktop} />
              <DiagnosisStart psi={mobile} strategy="mobile" findings={buildFindings(mobile, null, { platform: params.platform || undefined })} />
              <DiagnosisStart psi={desktop} strategy="desktop" findings={buildFindings(desktop, null, { platform: params.platform || undefined })} />
              <div className="grid items-start gap-4 lg:grid-cols-2">
                <DetailedDeviceReport psi={mobile} strategy="mobile" findings={buildFindings(mobile, null, { platform: params.platform || undefined })} reportUrl={pageSpeedSiteUrl(run.url, 'mobile')} />
                <DetailedDeviceReport psi={desktop} strategy="desktop" findings={buildFindings(desktop, null, { platform: params.platform || undefined })} reportUrl={pageSpeedSiteUrl(run.url, 'desktop')} />
              </div>
            </>
          ) : (
            <>
              <DiagnosisStart psi={psi} strategy={run.strategy} findings={findings} />
              <Preview psi={psi} strategy={run.strategy} />
              <TimeBreakdown psi={psi} findings={findings} strategy={run.strategy} />
              <LcpSection psi={psi} strategy={run.strategy} />
              <Waterfall psi={psi} strategy={run.strategy} />
              <Findings findings={findings} reportUrl={fullReport} strategy={run.strategy} />
              <Metrics psi={psi} strategy={run.strategy} />
            </>
          )}
        </>
      )}

      {run.probe.state !== 'off' && <ProbeSection state={run.probe} count={PROBE_COUNT} />}
      {!psi && !running && probe && findings.length > 0 && <Findings findings={findings} reportUrl={fullReport} />}

      {!running && (psi || probe) && (
        <>
          <p className="text-sm">
            <a href={fullReport} target="_blank" rel="noopener noreferrer">
              Full report on PageSpeed Insights ↗
            </a>
          </p>
          <Boundary />
          <Methodology strategy={run.strategy} probeCount={PROBE_COUNT} />
        </>
      )}
    </section>
  );
}

function DetailedDeviceReport({ psi, strategy, findings, reportUrl }: { psi: NonNullable<Extract<PageSpeedResult, { ok: true }>['summary']>; strategy: Strategy; findings: ReturnType<typeof buildFindings>; reportUrl: string }) {
  return (
    <section aria-labelledby={`detailed-${strategy}-title`} className="min-w-0 space-y-4">
      <h3 id={`detailed-${strategy}-title`} className="text-lg font-bold capitalize">{strategy} evidence and fixes</h3>
      <TimeBreakdown psi={psi} findings={findings} strategy={strategy} />
      <LcpSection psi={psi} strategy={strategy} />
      <Waterfall psi={psi} strategy={strategy} />
      <Findings findings={findings} reportUrl={reportUrl} strategy={strategy} />
      <Metrics psi={psi} strategy={strategy} />
    </section>
  );
}
