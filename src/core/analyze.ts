import { runDiagnostics } from './diagnostics';
import { clip, exclusiveTime, roundMs, type Interval } from './timing';
import type { CriticalSegment, ServiceSummary, SpanNode, TraceAnalysis, TraceDocument, ValidationIssue } from './types';

/** Build a rooted span forest. Assumes the document passed `validateTrace`. */
export function buildForest(trace: TraceDocument): { roots: SpanNode[]; nodes: Map<string, SpanNode>; traceStartMs: number } {
  const traceStartMs = Math.min(...trace.spans.map((s) => s.startTimeMs));
  const nodes = new Map<string, SpanNode>();
  for (const span of trace.spans) {
    const startMs = span.startTimeMs - traceStartMs;
    nodes.set(span.spanId, {
      span,
      children: [],
      depth: 0,
      startMs,
      endMs: startMs + span.durationMs,
      selfMs: 0,
      criticalMs: 0,
    });
  }
  const roots: SpanNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.span.parentSpanId ? nodes.get(node.span.parentSpanId) : undefined;
    if (parent) {
      node.parent = parent;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const byStart = (a: SpanNode, b: SpanNode) => a.startMs - b.startMs || b.endMs - a.endMs || a.span.spanId.localeCompare(b.span.spanId);
  roots.sort(byStart);
  // Iterative traversal so very deep traces cannot overflow the stack.
  const stack = [...roots];
  while (stack.length) {
    const node = stack.pop()!;
    node.children.sort(byStart);
    for (const child of node.children) {
      child.depth = node.depth + 1;
      stack.push(child);
    }
    node.selfMs = roundMs(
      exclusiveTime(
        { start: node.startMs, end: node.endMs },
        node.children.map((c) => ({ start: c.startMs, end: c.endMs })),
      ),
    );
  }
  return { roots, nodes, traceStartMs };
}

/** Depth-first order: parents before children, siblings by start time. */
export function flatten(roots: SpanNode[]): SpanNode[] {
  const out: SpanNode[] = [];
  const stack = [...roots].reverse();
  while (stack.length) {
    const node = stack.pop()!;
    out.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]!);
  }
  return out;
}

interface CpFrame {
  id: string;
  start: number;
  cursor: number;
  kids: { node: SpanNode; iv: Interval }[];
}

function frame(id: string, children: SpanNode[], bounds: Interval): CpFrame {
  const kids = children
    .map((node) => ({ node, iv: clip({ start: node.startMs, end: node.endMs }, bounds.start, bounds.end) }))
    .filter((k): k is { node: SpanNode; iv: Interval } => k.iv !== null);
  return { id, start: bounds.start, cursor: bounds.end, kids };
}

/**
 * Critical path: walk backwards from the end of a span. At each cursor, the child that
 * finishes last (before the cursor) is the one the parent was waiting on; descend into it
 * and continue from its start. Gaps not covered by such a child are the parent's own time.
 * Children are clipped to parent bounds, so segments always sum to the root duration.
 * Uses an explicit stack so very deep traces cannot overflow the call stack.
 */
function criticalSegments(id: string, children: SpanNode[], bounds: Interval, out: CriticalSegment[]): void {
  const stack: CpFrame[] = [frame(id, children, bounds)];
  while (stack.length) {
    const f = stack[stack.length - 1]!;
    if (f.cursor > f.start) {
      let best: { node: SpanNode; iv: Interval } | undefined;
      let bestEnd = -Infinity;
      for (const k of f.kids) {
        if (k.iv.start >= f.cursor) continue;
        const e = Math.min(k.iv.end, f.cursor);
        // Prefer the child finishing last; break ties by the earlier (longer) child.
        if (e > bestEnd || (e === bestEnd && best && k.iv.start < best.iv.start)) {
          best = k;
          bestEnd = e;
        }
      }
      if (best) {
        if (bestEnd < f.cursor) out.push({ spanId: f.id, startMs: bestEnd, endMs: f.cursor });
        f.cursor = best.iv.start;
        stack.push(frame(best.node.span.spanId, best.node.children, { start: best.iv.start, end: bestEnd }));
        continue;
      }
      out.push({ spanId: f.id, startMs: f.start, endMs: f.cursor });
    }
    stack.pop();
  }
}

export const TRACE_WINDOW_ID = '__trace_window__';

export function computeCriticalPath(roots: SpanNode[]): CriticalSegment[] {
  if (roots.length === 0) return [];
  const out: CriticalSegment[] = [];
  if (roots.length === 1) {
    const root = roots[0]!;
    criticalSegments(root.span.spanId, root.children, { start: root.startMs, end: root.endMs }, out);
  } else {
    // Several roots: treat the whole trace window as a virtual parent.
    const end = Math.max(...roots.map((r) => r.endMs));
    const start = Math.min(...roots.map((r) => r.startMs));
    criticalSegments(TRACE_WINDOW_ID, roots, { start, end }, out);
  }
  return out
    .map((s) => ({ ...s, startMs: roundMs(s.startMs), endMs: roundMs(s.endMs) }))
    .filter((s) => s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
}

function summarizeServices(ordered: SpanNode[]): ServiceSummary[] {
  const map = new Map<string, ServiceSummary>();
  for (const n of ordered) {
    const s = map.get(n.span.service) ?? { service: n.span.service, spanCount: 0, selfMs: 0, criticalMs: 0, errorCount: 0 };
    s.spanCount++;
    s.selfMs = roundMs(s.selfMs + n.selfMs);
    s.criticalMs = roundMs(s.criticalMs + n.criticalMs);
    if (n.span.status === 'error') s.errorCount++;
    map.set(s.service, s);
  }
  return [...map.values()].sort((a, b) => b.criticalMs - a.criticalMs || b.selfMs - a.selfMs);
}

export function analyzeTrace(trace: TraceDocument, warnings: ValidationIssue[] = []): TraceAnalysis {
  const { roots, nodes, traceStartMs } = buildForest(trace);
  const ordered = flatten(roots);
  const criticalPath = computeCriticalPath(roots);
  for (const seg of criticalPath) {
    const node = nodes.get(seg.spanId);
    if (node) node.criticalMs = roundMs(node.criticalMs + (seg.endMs - seg.startMs));
  }
  const durationMs = roundMs(Math.max(...ordered.map((n) => n.endMs)) - Math.min(...ordered.map((n) => n.startMs)));
  const analysis: TraceAnalysis = {
    trace,
    roots,
    nodes,
    ordered,
    durationMs,
    traceStartMs,
    criticalPath,
    services: summarizeServices(ordered),
    errorCount: ordered.filter((n) => n.span.status === 'error').length,
    warnings,
    findings: [],
  };
  analysis.findings = runDiagnostics(analysis);
  return analysis;
}
