import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildTraceReport, describeSource, formatMs, formatPct, TOOL } from '../../core';
import { Findings } from '../components/Findings';
import { ServiceTable } from '../components/ServiceTable';
import { TraceSelect } from '../components/TraceSelect';
import { sampleTraceId, useTraces } from '../store';
import { Button, Card, PageHeader, Stat, SyntheticBadge, downloadJson, useDocumentTitle } from '../ui';

export function Reports() {
  useDocumentTitle('Report');
  const { get } = useTraces();
  const [params, setParams] = useSearchParams();
  const traceId = params.get('trace') ?? sampleTraceId('slow-database');
  const loaded = get(traceId);
  const generatedAt = useMemo(() => new Date(), [traceId]);

  const pathRows = useMemo(() => {
    if (!loaded) return [];
    const a = loaded.analysis;
    return [...a.ordered].filter((n) => n.criticalMs > 0).sort((x, y) => y.criticalMs - x.criticalMs).slice(0, 10);
  }, [loaded]);

  return (
    <div>
      <PageHeader
        title="Report"
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
        A printable summary of one trace with its evidence and provenance. Use your browser’s print dialog to save it as a PDF.
      </PageHeader>

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
