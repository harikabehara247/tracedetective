import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { buildTraceReport, formatMs } from '../../core';
import { Findings } from '../components/Findings';
import { ServiceTable } from '../components/ServiceTable';
import { SpanDetails } from '../components/SpanDetails';
import { EMPTY_FILTER, isFilterActive, Waterfall, type WaterfallFilter } from '../components/Waterfall';
import { useTraces } from '../store';
import { Button, ButtonLink, Card, PageHeader, Stat, SyntheticBadge, downloadJson, useDocumentTitle } from '../ui';

export function TraceView() {
  const { id } = useParams();
  const { get, remove } = useTraces();
  const loaded = get(id);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<WaterfallFilter>(EMPTY_FILTER);
  useDocumentTitle(loaded ? loaded.analysis.trace.name ?? 'Trace' : 'Trace not found');

  const analysis = loaded?.analysis;
  const selectedId = params.get('span') ?? analysis?.findings[0]?.spanIds[0] ?? analysis?.roots[0]?.span.spanId;
  const selectedNode = selectedId ? analysis?.nodes.get(selectedId) : undefined;

  const select = useCallback(
    (spanId: string) => {
      // Reveal the span if a collapsed ancestor hides it.
      const node = analysis?.nodes.get(spanId);
      if (node) {
        setCollapsed((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (let p = node.parent; p; p = p.parent) if (next.delete(p.span.spanId)) changed = true;
          return changed ? next : prev;
        });
      }
      setParams((p) => {
        const next = new URLSearchParams(p);
        next.set('span', spanId);
        return next;
      }, { replace: true });
    },
    [analysis, setParams],
  );

  const toggle = useCallback((spanId: string, expand?: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const shouldExpand = expand ?? next.has(spanId);
      if (shouldExpand) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  }, []);

  useEffect(() => {
    setCollapsed(new Set());
    setFilter(EMPTY_FILTER);
  }, [id]);

  const serviceNames = useMemo(() => analysis?.services.map((s) => s.service).sort() ?? [], [analysis]);

  if (!loaded || !analysis) {
    return (
      <div>
        <PageHeader title="Trace not found">
          This trace is not loaded. Imported traces live only in the browser tab you opened them in, so they disappear when that tab closes.
        </PageHeader>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/examples" variant="primary">Open a sample trace</ButtonLink>
          <ButtonLink to="/analyze/upload">Import a trace</ButtonLink>
        </div>
      </div>
    );
  }

  const t = analysis.trace;
  const exportJson = () => downloadJson(`tracedetective-report-${t.traceId}.json`, buildTraceReport(analysis, loaded.source));
  const criticalTop = [...analysis.ordered].sort((a, b) => b.criticalMs - a.criticalMs)[0];

  return (
    <div>
      <PageHeader
        title={t.name ?? `Trace ${t.traceId}`}
        actions={
          <>
            <Button onClick={exportJson}>Export JSON</Button>
            <ButtonLink to={`/reports?trace=${encodeURIComponent(loaded.id)}`}>Printable report</ButtonLink>
            <ButtonLink to={`/compare?current=${encodeURIComponent(loaded.id)}`} variant="primary">Compare</ButtonLink>
            {loaded.source.kind !== 'sample' && (
              <Button
                variant="ghost"
                onClick={() => {
                  remove(loaded.id);
                  navigate('/analyze/upload');
                }}
              >
                Remove import
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SyntheticBadge synthetic={t.synthetic} />
          <code className="text-xs">{t.traceId}</code>
        </div>
        {t.description && <p className="mt-2">{t.description}</p>}
      </PageHeader>

      {analysis.warnings.length > 0 && (
        <Card className="mb-6 border-warn/50">
          <h2 className="font-semibold text-warn">Validation warnings</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {analysis.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Duration" value={formatMs(analysis.durationMs)} hint="First span start to last span end" />
        <Stat label="Spans" value={analysis.ordered.length} hint={`${analysis.roots.length} root${analysis.roots.length === 1 ? '' : 's'}`} />
        <Stat label="Services" value={analysis.services.length} />
        <Stat label="Errors" value={analysis.errorCount} hint={analysis.errorCount ? 'Spans with error status' : 'No error spans'} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card aria-labelledby="timeline-h">
          <div className="mb-3 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="timeline-h" className="text-lg font-semibold">Timeline</h2>
              {criticalTop && (
                <p className="text-xs text-muted">
                  Largest critical-path contributor: <span className="text-ink">{criticalTop.span.name}</span> ({formatMs(criticalTop.criticalMs)})
                </p>
              )}
            </div>
            <div className="no-print flex flex-wrap items-end gap-3 text-sm" role="search" aria-label="Filter spans">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Search</span>
                <input
                  type="search"
                  value={filter.query}
                  onChange={(e) => setFilter({ ...filter, query: e.target.value })}
                  placeholder="Name, service or span ID"
                  className="w-52 rounded-lg border border-line bg-navy px-3 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">Service</span>
                <select value={filter.service} onChange={(e) => setFilter({ ...filter, service: e.target.value })} className="rounded-lg border border-line bg-navy px-3 py-1.5">
                  <option value="">All services</option>
                  {serviceNames.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 py-1.5">
                <input type="checkbox" checked={filter.errorsOnly} onChange={(e) => setFilter({ ...filter, errorsOnly: e.target.checked })} className="accent-violet" />
                Errors only
              </label>
              <label className="flex items-center gap-2 py-1.5">
                <input type="checkbox" checked={filter.criticalOnly} onChange={(e) => setFilter({ ...filter, criticalOnly: e.target.checked })} className="accent-violet" />
                Critical path only
              </label>
              {isFilterActive(filter) && <Button variant="ghost" onClick={() => setFilter(EMPTY_FILTER)}>Clear filters</Button>}
              {collapsed.size === 0 ? (
                analysis.ordered.some((n) => n.children.length && n.parent) && <Button variant="ghost" onClick={() => setCollapsed(new Set(analysis.ordered.filter((n) => n.children.length && n.parent).map((n) => n.span.spanId)))}>
                  Collapse all
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setCollapsed(new Set())}>
                  Expand all
                </Button>
              )}
            </div>
          </div>
          <Waterfall analysis={analysis} selectedId={selectedId} onSelect={select} collapsed={collapsed} onToggle={toggle} filter={filter} />
        </Card>

        <Card aria-labelledby="details-h" className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          <h2 id="details-h" className="mb-3 text-lg font-semibold">Span details</h2>
          <div aria-live="polite">
            <SpanDetails analysis={analysis} node={selectedNode} onSelect={select} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card aria-labelledby="insights-h">
          <h2 id="insights-h" className="text-lg font-semibold">Insights</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Rule-based observations from the spans in this trace. Each one is a lead to verify, not a proven root cause. <Link to="/docs#rules">How the rules work</Link>
          </p>
          <Findings findings={analysis.findings} onSelectSpan={select} />
        </Card>
        <Card aria-labelledby="services-h">
          <h2 id="services-h" className="mb-3 text-lg font-semibold">Time by service</h2>
          <ServiceTable analysis={analysis} />
        </Card>
      </div>
    </div>
  );
}
