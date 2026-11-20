import { describe, expect, it } from 'vitest';
import { analyzeTrace, convertOtlp, parseTraceText } from '../src/core';
import sampleOtlp from '../public/samples/tracedetective-sample-slow-database.otlp.json';

/** Synthetic OTLP/JSON shaped like an OpenTelemetry Collector file exporter's output. */
const T = '5b8efff798038103d269b633813fc60c';
const ns = (ms: number) => String(BigInt(1_700_000_000_000) * 1_000_000n + BigInt(Math.round(ms * 1e6)));
const otlpSpan = (spanId: string, parent: string | undefined, name: string, startMs: number, endMs: number, extra: Record<string, unknown> = {}) => ({
  traceId: T,
  spanId,
  ...(parent ? { parentSpanId: parent } : {}),
  name,
  kind: 2,
  startTimeUnixNano: ns(startMs),
  endTimeUnixNano: ns(endMs),
  ...extra,
});
const resource = (service: string, spans: unknown[], key = 'scopeSpans') => ({
  resource: { attributes: [{ key: 'service.name', value: { stringValue: service } }] },
  [key]: [{ scope: { name: 'test' }, spans }],
});

const SAMPLE = {
  resourceSpans: [
    resource('frontend', [otlpSpan('eee19b7ec3c1b174', undefined, 'GET /checkout', 0, 500)]),
    resource('orders', [
      otlpSpan('aaa19b7ec3c1b174', 'eee19b7ec3c1b174', 'SELECT orders', 10, 410, {
        kind: 'SPAN_KIND_CLIENT',
        attributes: [
          { key: 'db.system', value: { stringValue: 'postgresql' } },
          { key: 'db.rows', value: { intValue: '42' } },
          { key: 'cache.hit', value: { boolValue: false } },
          { key: 'ratio', value: { doubleValue: 0.5 } },
          { key: 'tags', value: { arrayValue: { values: [{ stringValue: 'a' }, { intValue: 2 }] } } },
          { key: 'db.password', value: { stringValue: 'hunter2' } },
        ],
        status: { code: 'STATUS_CODE_ERROR', message: 'deadlock detected' },
        events: [{ name: 'exception', attributes: [{ key: 'exception.type', value: { stringValue: 'PgError' } }] }],
      }),
    ]),
  ],
};

describe('OTLP/JSON import', () => {
  it('converts spans, services, nanosecond times, enums and attributes', () => {
    const r = convertOtlp(SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.document as { spans: Record<string, unknown>[]; name: string; synthetic: boolean };
    expect(d.synthetic).toBe(false);
    expect(d.name).toBe('frontend · GET /checkout');
    const db = d.spans.find((s) => s.name === 'SELECT orders')!;
    expect(db.service).toBe('orders');
    expect(db.kind).toBe('client');
    expect(db.status).toBe('error');
    expect(db.durationMs).toBeCloseTo(400, 6);
    expect(db.startTimeMs).toBeCloseTo(1_700_000_000_010, 3);
    expect(db.parentSpanId).toBe('eee19b7ec3c1b174');
    const attrs = db.attributes as Record<string, unknown>;
    expect(attrs['db.rows']).toBe(42);
    expect(attrs['cache.hit']).toBe(false);
    expect(attrs.ratio).toBe(0.5);
    expect(attrs.tags).toBe('["a",2]');
    expect(attrs['exception.type']).toBe('PgError');
    expect(attrs['error.message']).toBe('deadlock detected');
  });

  it('is accepted by parseTraceText, validated, redacted and analysed', () => {
    const r = parseTraceText(JSON.stringify(SAMPLE));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trace.spans).toHaveLength(2);
    expect(r.trace.spans.find((s) => s.name === 'SELECT orders')!.attributes['db.password']).toBe('[redacted]');
    const a = analyzeTrace(r.trace);
    expect(a.durationMs).toBeCloseTo(500, 6);
    expect(a.findings.some((f) => f.ruleId === 'slow-database')).toBe(true);
  });

  it('converts base64 IDs (generic protobuf JSON) to hex', () => {
    const hexToB64 = (h: string) => btoa(String.fromCharCode(...h.match(/../g)!.map((x) => parseInt(x, 16))));
    const r = convertOtlp({ resourceSpans: [resource('svc', [{ ...otlpSpan('eee19b7ec3c1b174', undefined, 'root', 0, 1), traceId: hexToB64(T), spanId: hexToB64('eee19b7ec3c1b174') }])] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.document as { traceId: string; spans: { spanId: string }[] };
    expect(d.traceId).toBe(T);
    expect(d.spans[0]!.spanId).toBe('eee19b7ec3c1b174');
  });

  it('supports the legacy instrumentationLibrarySpans key and numeric nanoseconds', () => {
    const s = { ...otlpSpan('eee19b7ec3c1b174', undefined, 'root', 0, 0), startTimeUnixNano: 1_000_000, endTimeUnixNano: 3_000_000 };
    const r = convertOtlp({ resourceSpans: [resource('legacy', [s], 'instrumentationLibrarySpans')] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.document as { spans: { durationMs: number }[] }).spans[0]!.durationMs).toBe(2);
  });

  it('picks the largest trace when a file holds several, and warns', () => {
    const other = { ...otlpSpan('bbb19b7ec3c1b174', undefined, 'other', 0, 5), traceId: 'ffffffffffffffffffffffffffffffff' };
    const r = convertOtlp({ resourceSpans: [...SAMPLE.resourceSpans, resource('x', [other])] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.document as { traceId: string }).traceId).toBe(T);
    expect(r.warnings.map((w) => w.code)).toContain('otlp_multiple_traces');
  });

  it('skips spans with missing IDs or end before start, and fails clearly when none remain', () => {
    const bad = [
      { ...otlpSpan('eee19b7ec3c1b174', undefined, 'root', 0, 10), spanId: '' },
      otlpSpan('ccc19b7ec3c1b174', undefined, 'backwards', 10, 5),
    ];
    const r = convertOtlp({ resourceSpans: [resource('svc', bad)] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.code).toBe('otlp_empty');
    expect(r.errors[0]!.message).toMatch(/2 span/);
    const mixed = convertOtlp({ resourceSpans: [resource('svc', [...bad, otlpSpan('ddd19b7ec3c1b174', undefined, 'ok', 0, 1)])] });
    expect(mixed.ok && mixed.warnings.map((w) => w.code)).toContain('otlp_skipped');
  });

  it('keeps OTLP structural problems as validation errors (missing parent)', () => {
    const r = parseTraceText(JSON.stringify({ resourceSpans: [resource('svc', [otlpSpan('aaa19b7ec3c1b174', '0000000000000bad', 'orphan', 0, 1)])] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.code)).toContain('missing_parent');
  });

  it('caps attributes at 64 per span and truncates very long names', () => {
    const attrs = Array.from({ length: 80 }, (_, i) => ({ key: `k${i}`, value: { intValue: i } }));
    const r = parseTraceText(JSON.stringify({ resourceSpans: [resource('svc', [otlpSpan('aaa19b7ec3c1b174', undefined, 'n'.repeat(2000), 0, 1, { attributes: attrs })])] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.trace.spans[0]!.attributes)).toHaveLength(64);
    expect(r.trace.spans[0]!.name.length).toBeLessThanOrEqual(512);
    expect(r.warnings.map((w) => w.code)).toContain('otlp_attributes_dropped');
  });
});

describe('OTLP container formats', () => {
  it('accepts Collector file exporter JSON Lines and merges the lines', () => {
    const [a, b] = SAMPLE.resourceSpans;
    const text = `${JSON.stringify({ resourceSpans: [a] })}\n${JSON.stringify({ resourceSpans: [b] })}\n`;
    const r = parseTraceText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.trace.spans).toHaveLength(2);
  });
  it('still reports invalid JSON when lines are not OTLP', () => {
    const r = parseTraceText('{"a":1}\n{"b":2}');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.code).toBe('invalid_json');
  });
  it('accepts Tempo v1 (batches) and v2 (trace.resourceSpans) responses', () => {
    expect(parseTraceText(JSON.stringify({ batches: SAMPLE.resourceSpans })).ok).toBe(true);
    expect(parseTraceText(JSON.stringify({ trace: { resourceSpans: SAMPLE.resourceSpans } })).ok).toBe(true);
  });

  it('keeps the downloadable sample labelled synthetic, and ordinary imports not', () => {
    const sample = parseTraceText(JSON.stringify(sampleOtlp));
    expect(sample.ok && sample.trace.synthetic).toBe(true);
    const plain = parseTraceText(JSON.stringify(SAMPLE));
    expect(plain.ok && plain.trace.synthetic).toBe(false);
  });
});
