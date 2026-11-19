import { useMemo, useRef, type KeyboardEvent } from 'react';
import { formatMs, type CriticalSegment, type SpanNode, type TraceAnalysis } from '../../core';

const PALETTE = ['#a779ff', '#5ad8ff', '#68e4da', '#ff9ecf', '#ffc66b', '#8fa8ff', '#b8f08a'];

export function serviceColors(a: TraceAnalysis): Map<string, string> {
  const names = [...new Set(a.ordered.map((n) => n.span.service))];
  return new Map(names.map((s, i) => [s, PALETTE[i % PALETTE.length]!]));
}

export interface WaterfallFilter {
  query: string;
  service: string;
  errorsOnly: boolean;
  criticalOnly: boolean;
}

export const EMPTY_FILTER: WaterfallFilter = { query: '', service: '', errorsOnly: false, criticalOnly: false };

export function isFilterActive(f: WaterfallFilter): boolean {
  return f.query.trim() !== '' || f.service !== '' || f.errorsOnly || f.criticalOnly;
}

export function matchesFilter(n: SpanNode, f: WaterfallFilter): boolean {
  const q = f.query.trim().toLowerCase();
  if (q && !`${n.span.name} ${n.span.service} ${n.span.spanId}`.toLowerCase().includes(q)) return false;
  if (f.service && n.span.service !== f.service) return false;
  if (f.errorsOnly && n.span.status !== 'error') return false;
  if (f.criticalOnly && n.criticalMs <= 0) return false;
  return true;
}

interface Row {
  node: SpanNode;
  match: boolean;
}

/** Rows to show: DFS order, honouring collapsed spans; with a filter, matches plus their ancestors. */
export function visibleRows(a: TraceAnalysis, collapsed: Set<string>, filter: WaterfallFilter): Row[] {
  const active = isFilterActive(filter);
  const keep = new Set<SpanNode>();
  const matched = new Set<SpanNode>();
  if (active) {
    for (const n of a.ordered) {
      if (!matchesFilter(n, filter)) continue;
      matched.add(n);
      for (let p: SpanNode | undefined = n; p; p = p.parent) keep.add(p);
    }
  }
  const rows: Row[] = [];
  const hiddenUnder = (n: SpanNode) => {
    for (let p = n.parent; p; p = p.parent) if (collapsed.has(p.span.spanId)) return true;
    return false;
  };
  for (const n of a.ordered) {
    if (hiddenUnder(n)) continue;
    if (active && !keep.has(n)) continue;
    rows.push({ node: n, match: !active || matched.has(n) });
  }
  return rows;
}

interface Props {
  analysis: TraceAnalysis;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  collapsed: Set<string>;
  onToggle: (id: string, expand?: boolean) => void;
  filter: WaterfallFilter;
}

export function Waterfall({ analysis, selectedId, onSelect, collapsed, onToggle, filter }: Props) {
  const colors = useMemo(() => serviceColors(analysis), [analysis]);
  const rows = useMemo(() => visibleRows(analysis, collapsed, filter), [analysis, collapsed, filter]);
  const critical = useMemo(() => {
    const m = new Map<string, CriticalSegment[]>();
    for (const s of analysis.criticalPath) m.set(s.spanId, [...(m.get(s.spanId) ?? []), s]);
    return m;
  }, [analysis]);
  const treeRef = useRef<HTMLDivElement>(null);
  const total = analysis.durationMs || 1;
  const pct = (ms: number) => `${(ms / total) * 100}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * analysis.durationMs);

  const focusRow = (id: string) => {
    onSelect(id);
    requestAnimationFrame(() => treeRef.current?.querySelector<HTMLElement>(`[data-span-id="${CSS.escape(id)}"]`)?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = rows.findIndex((r) => r.node.span.spanId === selectedId);
    const current = rows[index]?.node;
    const go = (i: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (r) focusRow(r.node.span.spanId);
    };
    switch (e.key) {
      case 'ArrowDown':
        go(index + 1);
        break;
      case 'ArrowUp':
        go(index <= 0 ? 0 : index - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(rows.length - 1);
        break;
      case 'ArrowRight':
        if (!current || current.children.length === 0) return;
        if (collapsed.has(current.span.spanId)) onToggle(current.span.spanId, true);
        else go(index + 1);
        break;
      case 'ArrowLeft':
        if (!current) return;
        if (current.children.length > 0 && !collapsed.has(current.span.spanId)) onToggle(current.span.spanId, false);
        else if (current.parent) focusRow(current.parent.span.spanId);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-line p-6 text-center text-muted">No spans match the current filters.</p>;
  }

  const tabbableId = rows.some((r) => r.node.span.spanId === selectedId) ? selectedId : rows[0]!.node.span.spanId;

  return (
    <div className="relative overflow-x-auto">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[minmax(200px,38%)_1fr] border-b border-line pb-1 text-xs text-muted" aria-hidden="true">
          <div>Service · operation</div>
          <div className="relative h-4">
            {ticks.map((t, i) => (
              <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums first:translate-x-0 last:-translate-x-full" style={{ left: pct(t) }}>
                {formatMs(t)}
              </span>
            ))}
          </div>
        </div>
        <div ref={treeRef} role="tree" aria-label="Span hierarchy and timeline" onKeyDown={onKeyDown} className="py-1">
          {rows.map(({ node, match }) => {
            const id = node.span.spanId;
            const selected = id === selectedId;
            const hasKids = node.children.length > 0;
            const isCollapsed = collapsed.has(id);
            const color = colors.get(node.span.service)!;
            const isError = node.span.status === 'error';
            return (
              <div
                key={id}
                role="treeitem"
                data-span-id={id}
                aria-level={node.depth + 1}
                aria-selected={selected}
                aria-expanded={hasKids ? !isCollapsed : undefined}
                aria-label={`${node.span.service} ${node.span.name}, ${formatMs(node.span.durationMs)}, starts at ${formatMs(node.startMs)}${isError ? ', error' : ''}${node.criticalMs > 0 ? `, ${formatMs(node.criticalMs)} on critical path` : ''}`}
                tabIndex={id === tabbableId ? 0 : -1}
                onClick={() => onSelect(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(id);
                  }
                }}
                className={`grid cursor-pointer grid-cols-[minmax(200px,38%)_1fr] items-center rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                  selected ? 'bg-violet/15 ring-1 ring-violet/60' : 'hover:bg-surface-2'
                } ${match ? '' : 'opacity-50'}`}
              >
                <div className="flex min-w-0 items-center gap-1 py-1.5 pr-2" style={{ paddingLeft: `${Math.min(node.depth, 12) * 14 + 4}px` }}>
                  {hasKids ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden="true"
                      className="w-4 shrink-0 text-muted hover:text-ink"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(id);
                      }}
                    >
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                  <span className="truncate">
                    <span className="text-muted">{node.span.service}</span> <span className="font-medium">{node.span.name}</span>
                  </span>
                  {isError && (
                    <span className="ml-1 shrink-0 rounded border border-danger/60 px-1 text-[10px] font-bold text-danger" aria-hidden="true">
                      ERR
                    </span>
                  )}
                </div>
                <div className="relative h-7">
                  <div
                    className={`absolute top-1.5 h-4 min-w-[2px] rounded ${isError ? 'ring-2 ring-danger' : ''}`}
                    style={{ left: pct(node.startMs), width: pct(node.span.durationMs), background: `${color}66`, borderLeft: `2px solid ${color}` }}
                  />
                  {(critical.get(id) ?? []).map((seg, i) => (
                    <div
                      key={i}
                      className="absolute top-[22px] h-1 rounded-full bg-cyan"
                      style={{ left: pct(seg.startMs), width: pct(seg.endMs - seg.startMs) }}
                      aria-hidden="true"
                    />
                  ))}
                  <span
                    className="absolute top-1.5 whitespace-nowrap px-1 text-xs leading-4 tabular-nums text-ink"
                    style={
                      node.startMs + node.span.durationMs > total * 0.8
                        ? node.startMs > total * 0.35
                          ? { right: `calc(100% - ${pct(node.startMs)})` }
                          : { right: pct(total - node.startMs - node.span.durationMs) }
                        : { left: pct(node.startMs + node.span.durationMs) }
                    }
                  >
                    {formatMs(node.span.durationMs)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1 w-5 rounded-full bg-cyan" aria-hidden="true" /> Critical path
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded border border-danger/60 px-1 text-[10px] font-bold text-danger">ERR</span> Error status
          </span>
          <span>Keyboard: ↑ ↓ move · → expand · ← collapse or go to parent</span>
        </p>
      </div>
    </div>
  );
}
