import { z } from 'zod';
import type { AttributeValue, Span, TraceDocument, ValidationIssue } from './types';
import { convertOtlp, looksLikeOtlp, unwrapOtlp } from './otlp';

export const LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxSpans: 10_000,
  maxStringLength: 512,
  maxAttributeValueLength: 1024,
  maxAttributes: 64,
} as const;

/** Traces longer than this almost always mean mixed time units. */
const MAX_PLAUSIBLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Attribute keys whose values are replaced before anything is rendered or exported. */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_.]?key|session|credential|private[-_.]?key/i;

const idString = z
  .string()
  .trim()
  .min(1, 'must not be empty')
  .max(128, 'must be at most 128 characters')
  .regex(/^[A-Za-z0-9._:\-]+$/, 'may contain only letters, digits, ".", "_", ":" and "-"');

const label = z.string().trim().min(1, 'must not be empty').max(LIMITS.maxStringLength);

const finiteNumber = z.number().refine(Number.isFinite, 'must be a finite number');

const attributeValue = z.union([z.string(), finiteNumber, z.boolean()]);

const spanSchema = z.object({
  traceId: idString,
  spanId: idString,
  parentSpanId: idString.nullish(),
  name: label,
  service: label,
  kind: z.enum(['server', 'client', 'internal', 'producer', 'consumer']).default('internal'),
  startTimeMs: finiteNumber,
  durationMs: finiteNumber.refine((v) => v >= 0, 'must not be negative (negative durations are rejected)'),
  status: z.enum(['ok', 'error', 'unset']).default('unset'),
  attributes: z
    .record(z.string().max(128), attributeValue)
    .default({})
    .refine((a) => Object.keys(a).length <= LIMITS.maxAttributes, `at most ${LIMITS.maxAttributes} attributes per span`),
});

export const traceDocumentSchema = z.object({
  schemaVersion: z.literal('1.0', { message: 'schemaVersion must be "1.0"' }),
  traceId: idString,
  name: z.string().max(LIMITS.maxStringLength).optional(),
  description: z.string().max(2000).optional(),
  synthetic: z.boolean().default(false),
  spans: z
    .array(spanSchema)
    .min(1, 'a trace needs at least one span')
    .max(LIMITS.maxSpans, `at most ${LIMITS.maxSpans} spans are supported`),
});

export type ParseResult =
  | { ok: true; trace: TraceDocument; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[] };

function sanitizeAttributes(attrs: Record<string, AttributeValue>): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && value.length > LIMITS.maxAttributeValueLength) {
      out[key] = `${value.slice(0, LIMITS.maxAttributeValueLength)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Structural checks Zod cannot express: duplicates, missing parents, cycles, trace IDs. */
export function checkStructure(doc: TraceDocument): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const byId = new Map<string, Span>();

  for (const span of doc.spans) {
    if (byId.has(span.spanId)) {
      errors.push({ code: 'duplicate_span_id', spanId: span.spanId, message: `Duplicate spanId "${span.spanId}".` });
    } else {
      byId.set(span.spanId, span);
    }
    if (span.traceId !== doc.traceId) {
      errors.push({
        code: 'trace_id_mismatch',
        spanId: span.spanId,
        message: `Span "${span.spanId}" has traceId "${span.traceId}" but the document traceId is "${doc.traceId}".`,
      });
    }
    if (span.parentSpanId === span.spanId) {
      errors.push({ code: 'self_parent', spanId: span.spanId, message: `Span "${span.spanId}" lists itself as its parent.` });
    }
  }

  for (const span of doc.spans) {
    if (span.parentSpanId && span.parentSpanId !== span.spanId && !byId.has(span.parentSpanId)) {
      errors.push({
        code: 'missing_parent',
        spanId: span.spanId,
        message: `Span "${span.spanId}" references parent "${span.parentSpanId}", which is not in the trace.`,
      });
    }
  }

  // Cycle detection: follow parent links with a visited set per walk.
  const state = new Map<string, 'visiting' | 'done'>();
  const reported = new Set<string>();
  for (const start of byId.keys()) {
    const path: string[] = [];
    let current: string | undefined = start;
    while (current && byId.has(current) && state.get(current) !== 'done') {
      if (state.get(current) === 'visiting') {
        const cycle = path.slice(path.indexOf(current));
        const key = [...cycle].sort().join(',');
        if (!reported.has(key) && cycle.length > 1) {
          reported.add(key);
          errors.push({
            code: 'cycle',
            spanId: current,
            message: `Parent links form a cycle: ${[...cycle, current].join(' → ')}.`,
          });
        }
        break;
      }
      state.set(current, 'visiting');
      path.push(current);
      const parent: string | undefined = byId.get(current)?.parentSpanId ?? undefined;
      current = parent === current ? undefined : parent;
    }
    for (const id of path) state.set(id, 'done');
  }

  // Warnings: clock skew (child outside parent) and multiple roots.
  if (errors.length === 0) {
    const roots = doc.spans.filter((s) => !s.parentSpanId);
    if (roots.length > 1) {
      warnings.push({
        code: 'multiple_roots',
        message: `The trace has ${roots.length} root spans; they are shown side by side and the critical path covers the whole trace window.`,
      });
    }
    const start = Math.min(...doc.spans.map((s) => s.startTimeMs));
    const end = Math.max(...doc.spans.map((s) => s.startTimeMs + s.durationMs));
    if (end - start > MAX_PLAUSIBLE_WINDOW_MS) {
      warnings.push({
        code: 'implausible_window',
        message: `The trace spans ${((end - start) / 3_600_000).toFixed(1)} hours. Check that every timestamp uses milliseconds; mixed units (seconds, microseconds, nanoseconds) produce windows like this.`,
      });
    }
    for (const span of doc.spans) {
      const parent = span.parentSpanId ? byId.get(span.parentSpanId) : undefined;
      if (!parent) continue;
      const pEnd = parent.startTimeMs + parent.durationMs;
      const cEnd = span.startTimeMs + span.durationMs;
      if (span.startTimeMs < parent.startTimeMs - 0.001 || cEnd > pEnd + 0.001) {
        warnings.push({
          code: 'child_outside_parent',
          spanId: span.spanId,
          message: `Span "${span.spanId}" extends outside its parent "${parent.spanId}". This can mean clock skew or async work; timing outside the parent is clipped for self-time and critical-path math.`,
        });
      }
    }
  }

  return { errors, warnings };
}

function formatPath(path: PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

/** Validate an already-parsed JSON value. */
export function validateTrace(input: unknown): ParseResult {
  const result = traceDocumentSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues.slice(0, 25).map((issue) => ({
      code: 'schema',
      path: formatPath(issue.path),
      message: `${formatPath(issue.path) || 'document'}: ${issue.message}`,
    }));
    if (result.error.issues.length > 25) {
      errors.push({ code: 'schema', path: '', message: `…and ${result.error.issues.length - 25} more problems.` });
    }
    return { ok: false, errors };
  }
  const doc: TraceDocument = {
    ...result.data,
    spans: result.data.spans.map((s) => {
      const span: Span = {
        traceId: s.traceId,
        spanId: s.spanId,
        name: s.name,
        service: s.service,
        kind: s.kind,
        startTimeMs: s.startTimeMs,
        durationMs: s.durationMs,
        status: s.status,
        attributes: sanitizeAttributes(s.attributes),
      };
      if (s.parentSpanId) span.parentSpanId = s.parentSpanId;
      return span;
    }),
  };
  const { errors, warnings } = checkStructure(doc);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, trace: doc, warnings };
}

/** OpenTelemetry Collector file exporter output: one OTLP JSON request per line. Merged into one request. */
function parseOtlpJsonLines(text: string): unknown | undefined {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return undefined;
  const resourceSpans: unknown[] = [];
  for (const line of lines) {
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      return undefined;
    }
    const rs = unwrapOtlp(v);
    if (!rs) return undefined;
    resourceSpans.push(...rs);
  }
  return { resourceSpans };
}

/** Parse raw text (e.g. an uploaded file). Never evaluates the content. */
export function parseTraceText(text: string, byteLength = new TextEncoder().encode(text).length): ParseResult {
  if (byteLength > LIMITS.maxFileBytes) {
    return {
      ok: false,
      errors: [{ code: 'too_large', message: `File is ${(byteLength / 1024 / 1024).toFixed(2)} MB; the limit is 2 MB.` }],
    };
  }
  if (text.trim() === '') {
    return { ok: false, errors: [{ code: 'empty', message: 'The file is empty.' }] };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const lines = parseOtlpJsonLines(text);
    if (!lines) return { ok: false, errors: [{ code: 'invalid_json', message: `Not valid JSON: ${(e as Error).message}` }] };
    json = lines;
  }
  if (looksLikeOtlp(json)) {
    const converted = convertOtlp(json);
    if (!converted.ok) return converted;
    const result = validateTrace(converted.document);
    return result.ok ? { ...result, warnings: [...converted.warnings, ...result.warnings] } : result;
  }
  return validateTrace(json);
}
