import { roundMs } from './timing';
import type { SpanNode, TraceAnalysis } from './types';

export interface MatchedSpan {
  signature: string;
  label: string;
  baseline: SpanNode;
  current: SpanNode;
  baselineMs: number;
  currentMs: number;
  deltaMs: number;
  /** Fractional change; null when the baseline is 0 ms and the current is not. */
  deltaPct: number | null;
  baselineSelfMs: number;
  currentSelfMs: number;
  statusChanged: boolean;
}

export interface Comparison {
  baselineDurationMs: number;
  currentDurationMs: number;
  deltaMs: number;
  deltaPct: number | null;
  matched: MatchedSpan[];
  added: SpanNode[];
  removed: SpanNode[];
  newErrors: SpanNode[];
  resolvedErrors: SpanNode[];
  caveats: string[];
}

export function percentChange(baseline: number, current: number): number | null {
  if (baseline === 0) return current === 0 ? 0 : null;
  return (current - baseline) / baseline;
}

/**
 * Signature = ancestry path of service::name pairs plus the occurrence index among
 * same-named siblings. Matching by path (not by spanId) works across traces, and the
 * occurrence index keeps repeated calls (retries, loops) apart.
 */
export function spanSignatures(a: TraceAnalysis): Map<string, SpanNode> {
  const out = new Map<string, SpanNode>();
  const sigOf = new Map<SpanNode, string>();
  const rootCounts = new Map<string, number>();
  const assign = (node: SpanNode, prefix: string, counts: Map<string, number>) => {
    const base = `${node.span.service}::${node.span.name}`;
    const index = counts.get(base) ?? 0;
    counts.set(base, index + 1);
    const sig = `${prefix}/${base}#${index}`;
    sigOf.set(node, sig);
    out.set(sig, node);
  };
  for (const node of a.ordered) {
    if (!node.parent) assign(node, '', rootCounts);
  }
  for (const node of a.ordered) {
    const counts = new Map<string, number>();
    for (const child of node.children) assign(child, sigOf.get(node)!, counts);
  }
  return out;
}

export function compareTraces(baseline: TraceAnalysis, current: TraceAnalysis): Comparison {
  const b = spanSignatures(baseline);
  const c = spanSignatures(current);
  const matched: MatchedSpan[] = [];
  const removed: SpanNode[] = [];
  for (const [sig, bn] of b) {
    const cn = c.get(sig);
    if (!cn) {
      removed.push(bn);
      continue;
    }
    matched.push({
      signature: sig,
      label: `${cn.span.service} · ${cn.span.name}`,
      baseline: bn,
      current: cn,
      baselineMs: bn.span.durationMs,
      currentMs: cn.span.durationMs,
      deltaMs: roundMs(cn.span.durationMs - bn.span.durationMs),
      deltaPct: percentChange(bn.span.durationMs, cn.span.durationMs),
      baselineSelfMs: bn.selfMs,
      currentSelfMs: cn.selfMs,
      statusChanged: bn.span.status !== cn.span.status,
    });
  }
  const added = [...c].filter(([sig]) => !b.has(sig)).map(([, n]) => n);
  const newErrors = current.ordered.filter((n) => {
    if (n.span.status !== 'error') return false;
    const m = matched.find((x) => x.current === n);
    return !m || m.baseline.span.status !== 'error';
  });
  const resolvedErrors = matched.filter((m) => m.baseline.span.status === 'error' && m.current.span.status !== 'error').map((m) => m.baseline);

  const caveats = [
    'A comparison of two single traces shows what differed in these two requests. It does not prove what caused the difference.',
  ];
  const rootName = (a: TraceAnalysis) => a.roots.map((r) => `${r.span.service}::${r.span.name}`).join(',');
  if (rootName(baseline) !== rootName(current)) {
    caveats.push('The two traces have different root operations, so they may not be equivalent requests.');
  }
  if (added.length + removed.length > 0) {
    caveats.push(`${added.length} span${added.length === 1 ? '' : 's'} only appear in the current trace and ${removed.length} only in the baseline; their time is not part of the matched deltas.`);
  }
  if (baseline.trace.synthetic || current.trace.synthetic) {
    caveats.push('At least one trace is synthetic sample data, not a measurement of a real system.');
  }

  matched.sort((x, y) => Math.abs(y.deltaMs) - Math.abs(x.deltaMs));
  return {
    baselineDurationMs: baseline.durationMs,
    currentDurationMs: current.durationMs,
    deltaMs: roundMs(current.durationMs - baseline.durationMs),
    deltaPct: percentChange(baseline.durationMs, current.durationMs),
    matched,
    added,
    removed,
    newErrors,
    resolvedErrors,
    caveats,
  };
}
