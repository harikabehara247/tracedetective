/** Canonical TraceDetective data model. All times are milliseconds. */

export type SpanStatus = 'ok' | 'error' | 'unset';
export type SpanKind = 'server' | 'client' | 'internal' | 'producer' | 'consumer';
export type AttributeValue = string | number | boolean;

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  kind: SpanKind;
  /** Start time in ms. Absolute (epoch) or relative; only differences matter. */
  startTimeMs: number;
  durationMs: number;
  status: SpanStatus;
  attributes: Record<string, AttributeValue>;
}

export interface TraceDocument {
  schemaVersion: '1.0';
  traceId: string;
  name?: string;
  description?: string;
  /** True when the trace was generated rather than captured from a real system. */
  synthetic: boolean;
  spans: Span[];
}

/** Span plus derived structure and timing, relative to the trace start. */
export interface SpanNode {
  span: Span;
  parent?: SpanNode;
  children: SpanNode[];
  depth: number;
  /** Start relative to the trace start. */
  startMs: number;
  endMs: number;
  /** Duration minus the union of direct-child intervals clipped to this span. */
  selfMs: number;
  /** Time this span contributes to the critical path. */
  criticalMs: number;
}

export interface CriticalSegment {
  spanId: string;
  startMs: number;
  endMs: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
  spanId?: string;
  path?: string;
}

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Evidence {
  spanId?: string;
  label: string;
  value: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  severity: Severity;
  title: string;
  observation: string;
  evidence: Evidence[];
  possibleExplanations: string[];
  verifyNext: string[];
  caveat: string;
  spanIds: string[];
}

export interface TraceAnalysis {
  trace: TraceDocument;
  roots: SpanNode[];
  nodes: Map<string, SpanNode>;
  /** Spans in depth-first order (parents before children, siblings by start). */
  ordered: SpanNode[];
  durationMs: number;
  traceStartMs: number;
  criticalPath: CriticalSegment[];
  services: ServiceSummary[];
  errorCount: number;
  warnings: ValidationIssue[];
  findings: Finding[];
}

export interface ServiceSummary {
  service: string;
  spanCount: number;
  selfMs: number;
  criticalMs: number;
  errorCount: number;
}
