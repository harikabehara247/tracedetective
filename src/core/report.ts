import type { Comparison } from './compare';
import type { TraceAnalysis } from './types';

export const TOOL = { name: 'TraceDetective', version: '0.4.0' } as const;

export type TraceSource =
  | { kind: 'sample'; sampleId: string }
  | { kind: 'upload'; fileName: string }
  | { kind: 'paste' };

export function describeSource(source: TraceSource): string {
  switch (source.kind) {
    case 'sample':
      return `Built-in synthetic sample "${source.sampleId}"`;
    case 'upload':
      return `Imported file "${source.fileName}" (processed locally in the browser)`;
    case 'paste':
      return 'Pasted JSON (processed locally in the browser)';
  }
}

export function buildTraceReport(a: TraceAnalysis, source: TraceSource, now = new Date()) {
  return {
    provenance: {
      tool: TOOL.name,
      toolVersion: TOOL.version,
      generatedAt: now.toISOString(),
      source: describeSource(source),
      synthetic: a.trace.synthetic,
      dataNotice: a.trace.synthetic
        ? 'Synthetic sample data. These numbers are not measurements of a real system.'
        : 'User-supplied trace. Findings are rule-based hypotheses derived only from the spans in this file.',
      schemaVersion: a.trace.schemaVersion,
      processing: 'All analysis ran locally in the browser. No trace data was uploaded.',
    },
    trace: {
      traceId: a.trace.traceId,
      name: a.trace.name ?? null,
      durationMs: a.durationMs,
      spanCount: a.ordered.length,
      serviceCount: a.services.length,
      errorCount: a.errorCount,
    },
    criticalPath: a.criticalPath,
    services: a.services,
    findings: a.findings,
    warnings: a.warnings,
    spans: a.ordered.map((n) => ({
      spanId: n.span.spanId,
      parentSpanId: n.span.parentSpanId ?? null,
      service: n.span.service,
      name: n.span.name,
      kind: n.span.kind,
      status: n.span.status,
      relativeStartMs: n.startMs,
      durationMs: n.span.durationMs,
      selfMs: n.selfMs,
      criticalPathMs: n.criticalMs,
    })),
  };
}

export function buildComparisonReport(baseline: TraceAnalysis, current: TraceAnalysis, cmp: Comparison, now = new Date()) {
  return {
    provenance: {
      tool: TOOL.name,
      toolVersion: TOOL.version,
      generatedAt: now.toISOString(),
      synthetic: baseline.trace.synthetic || current.trace.synthetic,
      processing: 'All analysis ran locally in the browser. No trace data was uploaded.',
    },
    baseline: { traceId: baseline.trace.traceId, name: baseline.trace.name ?? null, durationMs: cmp.baselineDurationMs },
    current: { traceId: current.trace.traceId, name: current.trace.name ?? null, durationMs: cmp.currentDurationMs },
    deltaMs: cmp.deltaMs,
    deltaPct: cmp.deltaPct,
    matched: cmp.matched.map((m) => ({
      span: m.label,
      signature: m.signature,
      baselineMs: m.baselineMs,
      currentMs: m.currentMs,
      deltaMs: m.deltaMs,
      deltaPct: m.deltaPct,
      baselineStatus: m.baseline.span.status,
      currentStatus: m.current.span.status,
    })),
    added: cmp.added.map((n) => ({ service: n.span.service, name: n.span.name, durationMs: n.span.durationMs })),
    removed: cmp.removed.map((n) => ({ service: n.span.service, name: n.span.name, durationMs: n.span.durationMs })),
    newErrors: cmp.newErrors.map((n) => ({ service: n.span.service, name: n.span.name })),
    caveats: cmp.caveats,
  };
}
