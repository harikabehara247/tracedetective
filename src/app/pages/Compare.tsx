import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { buildComparisonReport, compareTraces, formatMs, formatSignedMs, formatSignedPct, type MatchedSpan } from '../../core';
import { TraceSelect } from '../components/TraceSelect';
import { sampleTraceId, useTraces } from '../store';
import { Button, Card, PageHeader, Stat, StatusBadge, downloadJson, useDocumentTitle } from '../ui';

type SortKey = 'delta' | 'pct' | 'name';

export function Compare() {
  useDocumentTitle('Compare');
  const { get } = useTraces();
  const [params, setParams] = useSearchParams();
  const baselineId = params.get('baseline') ?? sampleTraceId('healthy-order');
  const currentId = params.get('current') ?? sampleTraceId('slow-database');
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
        Match spans between a baseline and a current trace of the same request, then see what got slower, what appeared and what started failing.
      </PageHeader>

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
            <div className="relative overflow-x-auto">
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
