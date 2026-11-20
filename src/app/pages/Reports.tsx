import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildFindings, buildTraceReport, describeSource, formatMs, formatPct, TOOL } from '../../core';
import { Findings } from '../components/Findings';
import { ServiceTable } from '../components/ServiceTable';
import { TraceSelect } from '../components/TraceSelect';
import { sampleTraceId, useTraces } from '../store';
import { Button, ButtonLink, Card, PageHeader, Stat, SyntheticBadge, downloadJson, useDocumentTitle } from '../ui';
import { DeviceComparison, DiagnosisStart, Findings as WebsiteFindings, LcpSection, Metrics, Preview, TimeBreakdown, Waterfall } from '../website/Report';
import { readWebsiteReports, type SavedWebsiteReport } from '../website/savedReports';

export function Reports() {
  useDocumentTitle('Reports');
  const { get } = useTraces();
  const [params, setParams] = useSearchParams();
  const traceId = params.get('trace') ?? sampleTraceId('slow-database');
  const loaded = get(traceId);
  const websiteId = params.get('website');
  const [websiteReports, setWebsiteReports] = useState(() => readWebsiteReports());
  useEffect(() => {
    const refresh = window.setInterval(() => setWebsiteReports(readWebsiteReports()), 1200);
    return () => window.clearInterval(refresh);
  }, []);
  const selectedWebsite = websiteReports.find((report) => report.id === websiteId);
  const generatedAt = useMemo(() => new Date(), [traceId]);

  const pathRows = useMemo(() => {
    if (!loaded) return [];
    const a = loaded.analysis;
    return [...a.ordered].filter((n) => n.criticalMs > 0).sort((x, y) => y.criticalMs - x.criticalMs).slice(0, 10);
  }, [loaded]);

  if (websiteId) {
    return selectedWebsite ? <SavedWebsiteReportView report={selectedWebsite} /> : (
      <div className="space-y-4">
        <PageHeader title="Website report not found" actions={<ButtonLink to="/reports">All reports</ButtonLink>}>
          This result may have been cleared when the browser session ended or when its temporary storage was full.
        </PageHeader>
        <Card><ButtonLink to="/analyze/url" variant="primary">Analyze a website</ButtonLink></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        actions={
          loaded ? (
            <>
              <Button variant="primary" onClick={() => window.print()}>Print or save as PDF</Button>
              <Button onClick={() => downloadJson(`tracedetective-report-${loaded.analysis.trace.traceId}.json`, buildTraceReport(loaded.analysis, loaded.source, generatedAt))}>
                Export JSON
              </Button>
            </>
          ) : undefined
        }
      >
        Website checks and uploaded trace reports. Website analyses are saved only in this browser tab’s session; they are not uploaded.
      </PageHeader>

      <WebsiteReportList reports={websiteReports} />

      <div className="no-print mb-6 max-w-xl">
        <TraceSelect
          id="report-trace"
          label="Trace"
          value={traceId}
          onChange={(v) => setParams((p) => {
            const n = new URLSearchParams(p);
            n.set('trace', v);
            return n;
          }, { replace: true })}
        />
      </div>

      {!loaded ? (
        <Card><p className="text-muted">Select a trace to build a report.</p></Card>
      ) : (
        <article className="space-y-6" aria-label="Trace report">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{loaded.analysis.trace.name ?? loaded.analysis.trace.traceId}</h2>
                <p className="mt-1 font-mono text-xs text-muted">{loaded.analysis.trace.traceId}</p>
              </div>
              <SyntheticBadge synthetic={loaded.analysis.trace.synthetic} />
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm md:grid-cols-[auto_1fr]">
              <dt className="text-muted">Source</dt>
              <dd>{describeSource(loaded.source)}</dd>
              <dt className="text-muted">Data</dt>
              <dd>{loaded.analysis.trace.synthetic ? 'Synthetic sample data. These numbers are not measurements of a real system.' : 'User-supplied trace.'}</dd>
              <dt className="text-muted">Generated</dt>
              <dd>{generatedAt.toLocaleString()} by {TOOL.name} {TOOL.version}</dd>
              <dt className="text-muted">Processing</dt>
              <dd>Analysed locally in the browser. No trace data was uploaded.</dd>
            </dl>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Duration" value={formatMs(loaded.analysis.durationMs)} />
            <Stat label="Spans" value={loaded.analysis.ordered.length} />
            <Stat label="Services" value={loaded.analysis.services.length} />
            <Stat label="Errors" value={loaded.analysis.errorCount} />
          </div>

          <Card>
            <h2 className="text-lg font-semibold">Findings</h2>
            <p className="mb-4 mt-1 text-sm text-muted">Rule-based hypotheses from the spans in this trace. Verify each one before acting on it.</p>
            <Findings findings={loaded.analysis.findings} printable />
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Top critical-path contributors</h2>
            <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Spans (scrollable)">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Span</th>
                    <th scope="col" className="py-2 pr-3 text-right">Duration</th>
                    <th scope="col" className="py-2 pr-3 text-right">On critical path</th>
                    <th scope="col" className="py-2 text-right">Share</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {pathRows.map((n) => (
                    <tr key={n.span.spanId} className="border-t border-line">
                      <th scope="row" className="py-2 pr-3 font-normal">{n.span.service} · {n.span.name}</th>
                      <td className="py-2 pr-3 text-right">{formatMs(n.span.durationMs)}</td>
                      <td className="py-2 pr-3 text-right">{formatMs(n.criticalMs)}</td>
                      <td className="py-2 text-right">{formatPct(n.criticalMs / (loaded.analysis.durationMs || 1))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-semibold">Time by service</h2>
            <ServiceTable analysis={loaded.analysis} />
          </Card>

          <p className="text-xs text-muted">
            Remove secrets and personal data before sharing this report. Method and limitations: <Link to="/docs#rules">how the rules work</Link>.
          </p>
        </article>
      )}
    </div>
  );
}

function WebsiteReportList({ reports }: { reports: SavedWebsiteReport[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const compareHref = `/compare?siteA=${encodeURIComponent(selected[0] ?? '')}&siteB=${encodeURIComponent(selected[1] ?? '')}`;
  return (
    <section aria-labelledby="saved-site-reports" className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="saved-site-reports" className="text-xl font-bold">Website analyses from this session</h2>
          <p className="mt-1 text-sm text-muted">Switch between Analyze, Compare and Reports without losing these results. Up to five recent runs stay in this browser tab session only.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.length === 2 && <ButtonLink to={compareHref} variant="secondary">Compare selected website runs</ButtonLink>}
          <ButtonLink to="/analyze/url" variant="primary">Analyze another website</ButtonLink>
        </div>
      </div>
      {reports.length === 0 ? (
        <Card><p className="text-sm text-muted">No website analyses saved yet. Start a URL check and its completed results will appear here automatically.</p></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {reports.map((report) => {
            const devices = (['mobile', 'desktop'] as const).filter((device) => !!report.results[device]);
            return (
              <li key={report.id}>
                <Card className="h-full">
                  <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan">
                    <input type="checkbox" checked={selected.includes(report.id)} disabled={!selected.includes(report.id) && selected.length >= 2} onChange={(event) => setSelected((current) => event.target.checked ? [...current, report.id].slice(-2) : current.filter((id) => id !== report.id))} className="accent-cyan" />
                    Select to compare
                  </label>
                  <p className="break-all font-mono text-sm font-semibold">{report.url}</p>
                  <p className="mt-1 text-xs text-muted">{devices.map((device) => device[0]!.toUpperCase() + device.slice(1)).join(' + ')} · {new Date(report.finishedAt).toLocaleString()}</p>
                  <div className="mt-3"><ButtonLink to={`/reports?website=${encodeURIComponent(report.id)}`} variant="secondary">Open saved report</ButtonLink></div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SavedWebsiteReportView({ report }: { report: SavedWebsiteReport }) {
  const successes = (['mobile', 'desktop'] as const).flatMap((strategy) => {
    const result = report.results[strategy];
    return result?.ok ? [{ strategy, summary: result.summary }] : [];
  });
  const errors = (['mobile', 'desktop'] as const).flatMap((strategy) => {
    const result = report.results[strategy];
    return result && !result.ok ? [{ strategy, message: result.error.message }] : [];
  });
  const exportData = {
    kind: 'website-analysis',
    version: 1,
    generatedAt: new Date().toISOString(),
    url: report.url,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    deviceResults: report.results,
    storage: 'This report is stored in this browser tab session only.',
    limits: 'External PageSpeed measurements do not reveal application code, internal APIs or database queries.',
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Saved website report" actions={
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/reports">All reports</ButtonLink>
          <Button onClick={() => downloadJson(`tracedetective-${report.host}-${report.startedAt.slice(0, 10)}.json`, exportData)}>Export JSON</Button>
          <Button variant="primary" onClick={() => window.print()}>Print or save as PDF</Button>
        </div>
      }>
        This analysis stays in this browser tab’s session. You can move between the product pages and return here; ending the session clears its saved reports.
      </PageHeader>
      <Card>
        <h2 className="break-all font-mono text-base font-semibold">{report.url}</h2>
        <p className="mt-1 text-sm text-muted">Completed {new Date(report.finishedAt).toLocaleString()} · {successes.length} successful lab run{successes.length === 1 ? '' : 's'}.</p>
      </Card>
      {errors.map(({ strategy, message }) => <Card key={strategy} className="border-warn/60"><h2 className="font-semibold capitalize">{strategy} test did not complete</h2><p className="mt-1 text-sm">{message}</p></Card>)}
      {successes.length === 2 && <DeviceComparison mobile={successes.find((x) => x.strategy === 'mobile')!.summary} desktop={successes.find((x) => x.strategy === 'desktop')!.summary} />}
      {successes.map(({ strategy, summary }) => {
        const findings = buildFindings(summary, null, { platform: report.params.platform || undefined });
        const reportUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(report.url)}&form_factor=${strategy}`;
        return (
          <article key={strategy} className="space-y-4" aria-labelledby={`saved-${strategy}-title`}>
            <h2 id={`saved-${strategy}-title`} className="text-xl font-bold capitalize">{strategy} diagnosis</h2>
            <DiagnosisStart psi={summary} strategy={strategy} findings={findings} />
            <Preview psi={summary} strategy={strategy} />
            <TimeBreakdown psi={summary} findings={findings} strategy={strategy} />
            <LcpSection psi={summary} strategy={strategy} />
            <Waterfall psi={summary} strategy={strategy} />
            <WebsiteFindings findings={findings} reportUrl={reportUrl} strategy={strategy} />
            <Metrics psi={summary} strategy={strategy} />
          </article>
        );
      })}
      <Card className="border-cyan/40 bg-cyan/5"><h2 className="font-semibold">What to do with this report</h2><p className="mt-1 text-sm">Start with the colored delay stage above, open its request evidence, then work through the ranked checks. The measurements point to where to investigate; verify the change in your own code and test again.</p></Card>
    </div>
  );
}
