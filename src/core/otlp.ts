import type { AttributeValue, ValidationIssue } from './types';

/**
 * Converts OpenTelemetry OTLP/JSON (ExportTraceServiceRequest) into the TraceDetective
 * schema. Follows the OTLP JSON encoding: hex trace/span IDs, nanosecond timestamps as
 * strings or numbers, integer or string enums, lowerCamelCase keys. Base64 IDs (from
 * generic protobuf JSON encoders) are converted to hex.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const KIND: Record<string, string> = {
  '0': 'internal', '1': 'internal', '2': 'server', '3': 'client', '4': 'producer', '5': 'consumer',
  SPAN_KIND_UNSPECIFIED: 'internal', SPAN_KIND_INTERNAL: 'internal', SPAN_KIND_SERVER: 'server',
  SPAN_KIND_CLIENT: 'client', SPAN_KIND_PRODUCER: 'producer', SPAN_KIND_CONSUMER: 'consumer',
};
const STATUS: Record<string, string> = {
  '0': 'unset', '1': 'ok', '2': 'error', STATUS_CODE_UNSET: 'unset', STATUS_CODE_OK: 'ok', STATUS_CODE_ERROR: 'error',
};

/** Accepts OTLP/JSON, Tempo v1 (`batches`) and Tempo v2 (`trace.resourceSpans`) responses. */
export function unwrapOtlp(json: unknown): unknown[] | undefined {
  const o = obj(json);
  if (Array.isArray(o.resourceSpans)) return o.resourceSpans;
  if (Array.isArray(o.batches)) return o.batches;
  const t = obj(o.trace);
  if (Array.isArray(t.resourceSpans)) return t.resourceSpans;
  return undefined;
}

export function looksLikeOtlp(json: unknown): boolean {
  return unwrapOtlp(json) !== undefined || (!!json && typeof json === 'object' && 'resourceSpans' in (json as Json));
}

function normalizeId(id: unknown, bytes: number): string | undefined {
  if (typeof id !== 'string' || id === '') return undefined;
  if (new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(id)) return id.toLowerCase();
  // Base64 of the raw bytes.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(id)) {
    try {
      const bin = atob(id);
      if (bin.length === bytes) return [...bin].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall through */
    }
  }
  return id;
}

function nanosToMs(v: unknown): number | undefined {
  try {
    if (typeof v === 'string' && /^\d+$/.test(v)) {
      const n = BigInt(v);
      return Number(n / 1000n) / 1000;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return v / 1e6;
  } catch {
    /* ignore */
  }
  return undefined;
}

function anyValue(v: unknown): AttributeValue | undefined {
  const o = obj(v);
  if ('stringValue' in o) return String(o.stringValue);
  if ('boolValue' in o) return Boolean(o.boolValue);
  if ('intValue' in o) {
    const n = Number(o.intValue);
    return Number.isFinite(n) ? n : String(o.intValue);
  }
  if ('doubleValue' in o) {
    const n = Number(o.doubleValue);
    return Number.isFinite(n) ? n : String(o.doubleValue);
  }
  if ('arrayValue' in o) return JSON.stringify(arr(obj(o.arrayValue).values).map(anyValue));
  if ('kvlistValue' in o) return JSON.stringify(Object.fromEntries(arr(obj(o.kvlistValue).values).map((kv) => [String(obj(kv).key), anyValue(obj(kv).value)])));
  if ('bytesValue' in o) return String(o.bytesValue);
  return undefined;
}

const MAX_ATTRS = 64;
const MAX_LABEL = 512;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function attributes(list: unknown): Record<string, AttributeValue> {
  const out: Record<string, AttributeValue> = {};
  for (const kv of arr(list)) {
    const k = obj(kv).key;
    if (typeof k !== 'string' || k === '' || k.length > 128) continue;
    const v = anyValue(obj(kv).value);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export type OtlpResult = { ok: true; document: unknown; warnings: ValidationIssue[] } | { ok: false; errors: ValidationIssue[] };

export function convertOtlp(json: unknown, options: { traceId?: string } = {}): OtlpResult {
  const spans: Json[] = [];
  const warnings: ValidationIssue[] = [];
  let skipped = 0;
  let droppedAttrs = 0;
  for (const rs of unwrapOtlp(json) ?? []) {
    const resAttrs = attributes(obj(obj(rs).resource).attributes);
    const service = typeof resAttrs['service.name'] === 'string' && (resAttrs['service.name'] as string).trim() ? (resAttrs['service.name'] as string) : 'unknown_service';
    const scopes = [...arr(obj(rs).scopeSpans), ...arr(obj(rs).instrumentationLibrarySpans)];
    for (const ss of scopes) {
      for (const raw of arr(obj(ss).spans)) {
        const s = obj(raw);
        const start = nanosToMs(s.startTimeUnixNano);
        const end = nanosToMs(s.endTimeUnixNano);
        const traceId = normalizeId(s.traceId, 16);
        const spanId = normalizeId(s.spanId, 8);
        if (start === undefined || end === undefined || end < start || !traceId || !spanId) {
          skipped++;
          continue;
        }
        const attrs = attributes(s.attributes);
        for (const ev of arr(s.events)) {
          const e = obj(ev);
          if (e.name === 'exception') {
            const ea = attributes(e.attributes);
            for (const k of ['exception.type', 'exception.message']) if (ea[k] !== undefined && attrs[k] === undefined) attrs[k] = ea[k]!;
          }
        }
        const status = obj(s.status);
        if (typeof status.message === 'string' && status.message && attrs['error.message'] === undefined) attrs['error.message'] = status.message;
        const keys = Object.keys(attrs);
        if (keys.length > MAX_ATTRS) {
          droppedAttrs += keys.length - MAX_ATTRS;
          for (const k of keys.slice(MAX_ATTRS)) delete attrs[k];
        }
        const parent = normalizeId(s.parentSpanId, 8);
        spans.push({
          traceId,
          spanId,
          ...(parent ? { parentSpanId: parent } : {}),
          name: typeof s.name === 'string' && s.name.trim() ? clip(s.name, MAX_LABEL) : '(unnamed span)',
          service: clip(service, MAX_LABEL),
          kind: KIND[String(s.kind ?? 0)] ?? 'internal',
          startTimeMs: start,
          durationMs: end - start,
          status: STATUS[String(status.code ?? 0)] ?? 'unset',
          attributes: attrs,
        });
      }
    }
  }
  if (spans.length === 0) {
    return { ok: false, errors: [{ code: 'otlp_empty', message: skipped ? `No usable spans: ${skipped} span(s) were missing IDs or had invalid timestamps.` : 'The OTLP file contains no spans.' }] };
  }
  if (droppedAttrs) warnings.push({ code: 'otlp_attributes_dropped', message: `${droppedAttrs} attribute(s) beyond the ${MAX_ATTRS}-per-span limit were dropped.` });
  if (skipped) warnings.push({ code: 'otlp_skipped', message: `${skipped} span(s) without IDs or valid timestamps were skipped.` });
  const ids = [...new Set(spans.map((s) => s.traceId as string))];
  let traceId = options.traceId ?? ids[0]!;
  if (ids.length > 1 && !options.traceId) {
    // Pick the trace with the most spans and say so.
    const counts = ids.map((id) => [id, spans.filter((s) => s.traceId === id).length] as const).sort((a, b) => b[1] - a[1]);
    traceId = counts[0]![0];
    warnings.push({ code: 'otlp_multiple_traces', message: `The file contains ${ids.length} traces. Showing ${traceId} (${counts[0]![1]} spans); export one trace per file to analyse the others.` });
  }
  const selected = spans.filter((s) => s.traceId === traceId);
  const root = selected.find((s) => !s.parentSpanId);
  return {
    ok: true,
    warnings,
    document: {
      schemaVersion: '1.0',
      traceId,
      name: clip(root ? `${root.service} · ${root.name}` : `Trace ${traceId}`, MAX_LABEL),
      description: 'Imported from OpenTelemetry OTLP JSON.',
      synthetic: false,
      spans: selected,
    },
  };
}
