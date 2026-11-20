import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildComparisonReport, compareTraces, formatMs, formatSignedMs, formatSignedPct, safeImageData, type MatchedSpan, type PsiSummary } from '../../core';
import { TraceSelect } from '../components/TraceSelect';
import { sampleTraceId, useTraces } from '../store';
import { Button, Card, PageHeader, Stat, StatusBadge, downloadJson, useDocumentTitle } from '../ui';
import { readWebsiteReports, type SavedWebsiteReport } from '../website/savedReports';

type SortKey = 'delta' | 'pct' | 'name';

export function Compare() {
  useDocumentTitle('Compare');
  const { get } = useTraces();
  const [params, setParams] = useSearchParams();
  const baselineId = params.get('baseline') ?? sampleTraceId('healthy-order');
  const currentId = params.get('current') ?? sampleTraceId('slow-database');
  const siteAId = params.get('siteA');
  const siteBId = params.get('siteB');
  const savedSites = useMemo(() => readWebsiteReports(), []);
  const siteA = savedSites.find((report) => report.id === siteAId);
  const siteB = savedSites.find((report) => report.id === siteBId);
  const baseline = get(baselineId);
  const current = get(currentId);
  const [sort, setSort] = useState<SortKey>('delta');
  const [changedOnly, setChangedOnly] = useState(false);

  const set = (key: 'baseline' | 'current', v: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set(key, v);
      return n;
    }, { replace: true });

  const cmp = useMemo(() => (baseline && current ? compareTraces(baseline.analysis, current.analysis) : null), [baseline, current]);

  const rows = useMemo(() => {
    if (!cmp) return [];
    const list = changedOnly ? cmp.matched.filter((m) => m.deltaMs !== 0 || m.statusChanged) : [...cmp.matched];
    const pctKey = (m: MatchedSpan) => (m.deltaPct === null ? Infinity : Math.abs(m.deltaPct));
    if (sort === 'delta') list.sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs));
    if (sort === 'pct') list.sort((a, b) => pctKey(b) - pctKey(a));
    if (sort === 'name') list.sort((a, b) => a.label.localeCompare(b.label));
    return list;
  }, [cmp, sort, changedOnly]);

  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.deltaMs)));

  if (siteAId || siteBId) return <WebsiteRunComparison baseline={siteA} current={siteB} />;

  return (
    <div>
      <PageHeader
        title="Compare traces"
        actions={
          cmp && baseline && current ? (
            <Button
              onClick={() =>
                downloadJson(
                  `tracedetective-compare-${baseline.analysis.trace.traceId}-vs-${current.analysis.trace.traceId}.json`,
                  buildComparisonReport(baseline.analysis, current.analysis, cmp),
                )
              }
            >
              Export comparison JSON
            </Button>
          ) : undefined
        }
      >
        This page compares uploaded application traces. To compare website checks, select two saved runs in Reports; URL analyses are kept in this browser session.
      </PageHeader>

      <Card className="mb-6 border-cyan/40 bg-cyan/5">
        <p className="text-sm"><strong>Comparing a website load?</strong> <Link to="/reports" className="font-semibold text-cyan">Select two website runs in Reports →</Link> Compare mobile and desktop together with screenshots and measured delays.</p>
      </Card>

      <Card className="mb-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <TraceSelect id="baseline" label="Baseline" value={baselineId} onChange={(v) => set('baseline', v)} />
          <Button
            className="self-start md:self-end"
            onClick={() =>
              setParams((p) => {
                const n = new URLSearchParams(p);
                n.set('baseline', currentId);
                n.set('current', baselineId);
                return n;
              }, { replace: true })
            }
            aria-label="Swap baseline and current"
          >
            ⇄ Swap
          </Button>
          <TraceSelect id="current" label="Current" value={currentId} onChange={(v) => set('current', v)} />
        </div>
      </Card>

      {!cmp || !baseline || !current ? (
        <Card>
          <p className="text-muted">Select two traces to compare. You can use the built-in samples or <Link to="/analyze/upload">import your own</Link>.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {baselineId === currentId && (
            <p className="rounded-lg border border-warn/50 bg-warn/5 p-3 text-sm text-warn">Both sides are the same trace, so every delta is zero.</p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Baseline" value={formatMs(cmp.baselineDurationMs)} hint={baseline.analysis.trace.name} />
            <Stat label="Current" value={formatMs(cmp.currentDurationMs)} hint={current.analysis.trace.name} />
            <Stat label="Change" value={formatSignedMs(cmp.deltaMs)} hint={formatSignedPct(cmp.deltaPct)} />
            <Stat label="New errors" value={cmp.newErrors.length} hint={`${cmp.added.length} added · ${cmp.removed.length} removed spans`} />
          </div>

          <Card aria-labelledby="caveats-h" className="border-warn/40">
            <h2 id="caveats-h" className="font-semibold text-warn">Read this before drawing conclusions</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {cmp.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </Card>

          <Card aria-labelledby="matched-h">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 id="matched-h" className="text-lg font-semibold">Matched spans ({cmp.matched.length})</h2>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">Sort by</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-line bg-navy px-3 py-1.5">
                    <option value="delta">Largest change (ms)</option>
                    <option value="pct">Largest change (%)</option>
                    <option value="name">Name</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 py-1.5">
                  <input type="checkbox" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} className="accent-violet" />
                  Changed only
                </label>
              </div>
            </div>
            <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Matched spans (scrollable)">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Duration of each matched span in the baseline and current trace</caption>
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Span</th>
                    <th scope="col" className="py-2 pr-3 text-right">Baseline</th>
                    <th scope="col" className="py-2 pr-3 text-right">Current</th>
                    <th scope="col" className="py-2 pr-3 text-right">Change</th>
                    <th scope="col" className="w-40 py-2 pr-3"><span className="sr-only">Change bar</span></th>
                    <th scope="col" className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {rows.map((m) => (
                    <tr key={m.signature} className="border-t border-line">
                      <th scope="row" className="py-2 pr-3 font-normal" style={{ paddingLeft: `${Math.min(m.current.depth, 8) * 10}px` }}>
                        <Link to={`/trace/${current.id}?span=${encodeURIComponent(m.current.span.spanId)}`}>{m.label}</Link>
                      </th>
                      <td className="py-2 pr-3 text-right">{formatMs(m.baselineMs)}</td>
                      <td className="py-2 pr-3 text-right">{formatMs(m.currentMs)}</td>
                      <td className={`py-2 pr-3 text-right ${m.deltaMs > 0 ? 'text-danger' : m.deltaMs < 0 ? 'text-teal' : 'text-muted'}`}>
                        {formatSignedMs(m.deltaMs)}
                        <div className="text-xs">{formatSignedPct(m.deltaPct)}</div>
                      </td>
                      <td className="py-2 pr-3" aria-hidden="true">
                        <div className="relative h-2 rounded bg-surface-2">
                          <div
                            className={`absolute top-0 h-2 rounded ${m.deltaMs >= 0 ? 'left-1/2 bg-danger/80' : 'right-1/2 bg-teal/80'}`}
                            style={{ width: `${(Math.abs(m.deltaMs) / maxAbs) * 50}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2">
                        {m.statusChanged ? (
                          <span className="flex items-center gap-1 text-xs">
                            <StatusBadge status={m.baseline.span.status} /> → <StatusBadge status={m.current.span.status} />
                          </span>
                        ) : (
                          <StatusBadge status={m.current.span.status} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="py-4 text-center text-muted">No matched spans changed.</p>}
            </div>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <SpanList title="Only in current (added)" items={cmp.added} empty="No spans were added." />
            <SpanList title="Only in baseline (removed)" items={cmp.removed} empty="No spans are missing." />
          </div>
        </div>
      )}
    </div>
  );
}

function WebsiteRunComparison({ baseline, current }: { baseline?: SavedWebsiteReport; current?: SavedWebsiteReport }) {
  useDocumentTitle('Compare website reports');
  if (!baseline || !current) {
    return (
      <div className="space-y-4">
        <PageHeader title="Website comparison unavailable" actions={<Link to="/reports" className="text-cyan">Back to Reports</Link>}>
          One or both saved reports are missing from this browser session. Return to Reports and choose two completed website runs.
        </PageHeader>
        <Card><p className="text-sm text-muted">Website reports stay in the current browser tab session and are cleared when that session ends.</p></Card>
      </div>
    );
  }
  const devices = ['mobile', 'desktop'] as const;
  const summary = (report: SavedWebsiteReport, device: (typeof devices)[number]): PsiSummary | null => {
    const result = report.results[device];
    return result?.ok ? result.summary : null;
  };
  const diffs = devices.map((device) => {
    const a = summary(baseline, device);
    const b = summary(current, device);
    return { device, a, b };
  });
  const lcpMax = Math.max(1, ...diffs.flatMap(({ a, b }) => [a?.lcpMs ?? 0, b?.lcpMs ?? 0]));
  const score = (psi: PsiSummary | null) => psi?.performanceScore === undefined ? '—' : String(Math.round(psi.performanceScore * 100));
  const lcp = (psi: PsiSummary | null) => psi?.lcpMs === undefined ? '—' : formatMs(psi.lcpMs);
  return (
    <div className="space-y-5">
      <PageHeader title="Compare website reports" actions={<Link to="/reports" className="text-cyan">All saved reports →</Link>}>
        Compare two completed URL checks from this browser session. A smaller LCP and a higher performance score indicate a faster result in that lab run.
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        {[baseline, current].map((report, index) => (
          <Card key={report.id} className={index === 1 ? 'border-violet/50' : 'border-cyan/40'}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{index === 0 ? 'Run A' : 'Run B'}</p>
            <h2 className="mt-1 break-all font-mono text-sm font-semibold">{report.url}</h2>
            <p className="mt-1 text-xs text-muted">{new Date(report.finishedAt).toLocaleString()}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {devices.map((device) => {
                const psi = summary(report, device);
                return (
                  <div key={device} className="rounded-xl border border-line bg-navy/60 p-3">
                    <div className="flex items-center justify-between text-xs font-semibold capitalize"><span>{device}</span><span>Score {score(psi)}</span></div>
                    {psi?.screenshot ? <img className="mt-2 max-h-36 w-full rounded-lg border border-line object-contain object-top" src={safeImageData(psi.screenshot.data)} alt={`${device} screenshot from ${report.url}`} /> : <p className="mt-2 rounded-lg border border-line p-3 text-xs text-muted">No screenshot returned.</p>}
                    <p className="mt-2 text-xs">Largest content appeared · <strong>{lcp(psi)}</strong></p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-label={`${device} LCP ${lcp(psi)}`}><div className={`h-full rounded-full ${device === 'mobile' ? 'bg-warn' : 'bg-cyan'}`} style={{ width: `${Math.max(1, ((psi?.lcpMs ?? 0) / lcpMax) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="text-lg font-bold">What changed between runs</h2>
        <p className="mt-1 text-sm text-muted">Positive LCP change means Run B took longer. These are separate Google lab runs, so network and test variation can affect the difference.</p>
        <div className="mt-3 overflow-x-auto" role="region" aria-label="Website report metrics comparison" tabIndex={0}>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Device / metric</th><th className="py-2 text-right">Run A</th><th className="py-2 text-right">Run B</th><th className="py-2 text-right">Change</th></tr></thead>
            <tbody>
              {diffs.flatMap(({ device, a, b }) => [
                { label: `${device} · Largest Contentful Paint`, av: a?.lcpMs, bv: b?.lcpMs, format: (value?: number) => value === undefined ? '—' : formatMs(value) },
                { label: `${device} · Performance score`, av: a?.performanceScore === undefined ? undefined : Math.round(a.performanceScore * 100), bv: b?.performanceScore === undefined ? undefined : Math.round(b.performanceScore * 100), format: (value?: number) => value === undefined ? '—' : String(value) },
                { label: `${device} · Server response`, av: a?.serverResponseMs, bv: b?.serverResponseMs, format: (value?: number) => value === undefined ? '—' : formatMs(value) },
              ].map((row) => {
                const diff = row.av === undefined || row.bv === undefined ? undefined : row.bv - row.av;
                const isScore = row.label.endsWith('Performance score');
                const color = diff === undefined ? 'text-muted' : (isScore ? diff > 0 : diff < 0) ? 'text-teal' : diff === 0 ? 'text-muted' : 'text-danger';
                return <tr key={row.label} className="border-t border-line/60"><th className="py-2 font-medium capitalize">{row.label}</th><td className="py-2 text-right tabular-nums">{row.format(row.av)}</td><td className="py-2 text-right tabular-nums">{row.format(row.bv)}</td><td className={`py-2 text-right tabular-nums ${color}`}>{diff === undefined ? '—' : `${diff > 0 ? '+' : ''}${row.format(diff)}`}</td></tr>;
              }))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted">This comparison shows measured differences only. A URL test cannot identify private server code, API handlers or database queries.</p>
    </div>
  );
}

function SpanList({ title, items, empty }: { title: string; items: { span: { spanId: string; service: string; name: string; durationMs: number; status: 'ok' | 'error' | 'unset' } }[]; empty: string }) {
  return (
    <Card>
      <h2 className="font-semibold">{title} ({items.length})</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {items.map((n) => (
            <li key={n.span.spanId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-1">
              <span>{n.span.service} · {n.span.name}</span>
              <span className="flex items-center gap-2 tabular-nums">
                {formatMs(n.span.durationMs)} <StatusBadge status={n.span.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
