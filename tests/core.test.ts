import { describe, expect, it } from 'vitest';
import {
  analyzeTrace,
  buildTraceReport,
  compareTraces,
  exclusiveTime,
  mergeIntervals,
  parseTraceText,
  percentChange,
  unionLength,
  validateTrace,
  TRACE_WINDOW_ID,
  type TraceAnalysis,
} from '../src/core';
import { SAMPLES } from '../src/fixtures';
import { doc, MALFORMED, span, VALID_MINIMAL } from './fixtures/malformed';

function analyzed(input: unknown): TraceAnalysis {
  const r = validateTrace(input);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return analyzeTrace(r.trace, r.warnings);
}

const sample = (id: string) => analyzed(SAMPLES.find((s) => s.id === id)!.data);

describe('interval math', () => {
  it('merges overlapping and touching intervals', () => {
    expect(mergeIntervals([{ start: 5, end: 8 }, { start: 0, end: 3 }, { start: 2, end: 5 }])).toEqual([{ start: 0, end: 8 }]);
  });
  it('counts overlap once in union length', () => {
    expect(unionLength([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 20, end: 25 }])).toBe(20);
  });
  it('computes exclusive time with concurrent children', () => {
    // Parent 0-100; children 10-60 and 30-80 overlap → union 10-80 = 70ms; self = 30ms.
    expect(exclusiveTime({ start: 0, end: 100 }, [{ start: 10, end: 60 }, { start: 30, end: 80 }])).toBe(30);
  });
  it('clips children that extend outside the parent', () => {
    expect(exclusiveTime({ start: 0, end: 100 }, [{ start: -20, end: 10 }, { start: 90, end: 150 }])).toBe(80);
  });
  it('never returns negative self time', () => {
    expect(exclusiveTime({ start: 0, end: 10 }, [{ start: 0, end: 10 }, { start: 0, end: 10 }])).toBe(0);
  });
});

describe('validation', () => {
  it('accepts a minimal valid trace', () => {
    expect(validateTrace(VALID_MINIMAL).ok).toBe(true);
  });
  it.each(Object.entries(MALFORMED))('rejects %s', (_name, input) => {
    const r = validateTrace(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
  it('names the problem for structural errors', () => {
    const codes = (input: unknown) => {
      const r = validateTrace(input);
      return r.ok ? [] : r.errors.map((e) => e.code);
    };
    expect(codes(MALFORMED.duplicateIds)).toContain('duplicate_span_id');
    expect(codes(MALFORMED.missingParent)).toContain('missing_parent');
    expect(codes(MALFORMED.cycle)).toContain('cycle');
    expect(codes(MALFORMED.selfParent)).toContain('self_parent');
    expect(codes(MALFORMED.traceMismatch)).toContain('trace_id_mismatch');
  });
  it('rejects invalid JSON, empty text, oversized files and OTLP with clear messages', () => {
    const code = (text: string, bytes?: number) => {
      const r = parseTraceText(text, bytes);
      return r.ok ? 'ok' : r.errors[0]!.code;
    };
    expect(code('{not json')).toBe('invalid_json');
    expect(code('   ')).toBe('empty');
    expect(code('{}', 3 * 1024 * 1024)).toBe('too_large');
    expect(code(JSON.stringify({ resourceSpans: [] }))).toBe('unsupported_format');
    expect(code(JSON.stringify(VALID_MINIMAL))).toBe('ok');
  });
  it('redacts sensitive attribute values and truncates long strings', () => {
    const r = validateTrace(doc([span({ attributes: { 'http.request.header.authorization': 'Bearer abc', api_key: 'k', note: 'x'.repeat(2000) } })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const attrs = r.trace.spans[0]!.attributes;
    expect(attrs['http.request.header.authorization']).toBe('[redacted]');
    expect(attrs['api_key']).toBe('[redacted]');
    expect(String(attrs['note']).length).toBeLessThanOrEqual(1025);
  });
  it('warns, but does not fail, on clock skew and multiple roots', () => {
    const r = validateTrace(
      doc([span(), span({ spanId: 'b', parentSpanId: 'a', startTimeMs: 5, durationMs: 20 }), span({ spanId: 'c', startTimeMs: 50 })]),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code).sort()).toEqual(['child_outside_parent', 'multiple_roots']);
  });
  it('accepts zero-duration spans', () => {
    expect(validateTrace(doc([span({ durationMs: 0 })])).ok).toBe(true);
  });
});

describe('span forest and timing', () => {
  it('builds hierarchy with depths and start-ordered children', () => {
    const a = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'late', parentSpanId: 'r', startTimeMs: 50, durationMs: 10 }),
        span({ spanId: 'early', parentSpanId: 'r', startTimeMs: 10, durationMs: 10 }),
        span({ spanId: 'g', parentSpanId: 'early', startTimeMs: 12, durationMs: 2 }),
      ]),
    );
    expect(a.ordered.map((n) => n.span.spanId)).toEqual(['r', 'early', 'g', 'late']);
    expect(a.nodes.get('g')!.depth).toBe(2);
    expect(a.nodes.get('r')!.selfMs).toBe(80);
  });
  it('uses times relative to the trace start, whatever the epoch', () => {
    const a = analyzed(doc([span({ startTimeMs: 1_795_000_000_000, durationMs: 40 })]));
    expect(a.nodes.get('a')!.startMs).toBe(0);
    expect(a.durationMs).toBe(40);
  });
  it('handles a deep chain without stack overflow', () => {
    const spans = Array.from({ length: 3000 }, (_, i) =>
      span({ spanId: `s${i}`, parentSpanId: i ? `s${i - 1}` : undefined, startTimeMs: i, durationMs: 6000 - 2 * i }),
    );
    const a = analyzed(doc(spans));
    expect(a.ordered).toHaveLength(3000);
    expect(a.nodes.get('s2999')!.depth).toBe(2999);
  });
});

describe('critical path', () => {
  it('handles 5,000 sequential children under one root (wide trace)', () => {
    const spans = [
      span({ spanId: 'root', durationMs: 10_000 }),
      ...Array.from({ length: 5000 }, (_, i) => span({ spanId: `c${i}`, parentSpanId: 'root', startTimeMs: i * 2, durationMs: 2 })),
    ];
    const a = analyzed(doc(spans));
    expect(a.ordered).toHaveLength(5001);
    expect(a.nodes.get('root')!.selfMs).toBe(0);
    expect(a.criticalPath.reduce((s, x) => s + x.endMs - x.startMs, 0)).toBeCloseTo(10_000, 6);
  });
  it('handles a 9,000-deep chain in tree, critical path and diagnostics', () => {
    const spans = Array.from({ length: 9000 }, (_, i) =>
      span({ spanId: `d${i}`, parentSpanId: i ? `d${i - 1}` : undefined, startTimeMs: i, durationMs: 20_000 - 2 * i }),
    );
    const a = analyzed(doc(spans));
    expect(a.criticalPath.reduce((s, x) => s + x.endMs - x.startMs, 0)).toBeCloseTo(20_000, 6);
  });
  it('gives zero-duration spans zero self and critical time, never NaN', () => {
    const a = analyzed(doc([span({ spanId: 'r', durationMs: 0 }), span({ spanId: 'c', parentSpanId: 'r', durationMs: 0 })]));
    for (const n of a.ordered) {
      expect(n.selfMs).toBe(0);
      expect(Number.isNaN(n.criticalMs)).toBe(false);
    }
    expect(a.findings.every((f) => !/NaN/.test(JSON.stringify(f)))).toBe(true);
  });
  it('follows the last-finishing child among concurrent children', () => {
    // root 0-100; A 10-50 and B 20-90 run concurrently. Walking back from 100: root's own
    // time 90-100, then B (finishes last) 20-90, then A covers 10-20, then root 0-10.
    const a = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'A', parentSpanId: 'r', startTimeMs: 10, durationMs: 40 }),
        span({ spanId: 'B', parentSpanId: 'r', startTimeMs: 20, durationMs: 70 }),
      ]),
    );
    expect(a.criticalPath).toEqual([
      { spanId: 'r', startMs: 0, endMs: 10 },
      { spanId: 'A', startMs: 10, endMs: 20 },
      { spanId: 'B', startMs: 20, endMs: 90 },
      { spanId: 'r', startMs: 90, endMs: 100 },
    ]);
    expect(a.nodes.get('B')!.criticalMs).toBe(70);
    expect(a.nodes.get('A')!.criticalMs).toBe(10);
  });
  it('covers sequential children fully', () => {
    const a = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'A', parentSpanId: 'r', startTimeMs: 0, durationMs: 40 }),
        span({ spanId: 'B', parentSpanId: 'r', startTimeMs: 40, durationMs: 60 }),
      ]),
    );
    expect(a.nodes.get('A')!.criticalMs).toBe(40);
    expect(a.nodes.get('B')!.criticalMs).toBe(60);
    expect(a.nodes.get('r')!.criticalMs).toBe(0);
  });
  it('sums to the trace duration for every sample', () => {
    for (const s of SAMPLES) {
      const a = analyzed(s.data);
      const total = a.criticalPath.reduce((sum, seg) => sum + seg.endMs - seg.startMs, 0);
      expect(total).toBeCloseTo(a.durationMs, 6);
      // Segments are contiguous and non-overlapping.
      a.criticalPath.forEach((seg, i) => {
        if (i > 0) expect(seg.startMs).toBeCloseTo(a.criticalPath[i - 1]!.endMs, 6);
      });
    }
  });
  it('clips children that overrun their parent', () => {
    const a = analyzed(
      doc([span({ spanId: 'r', durationMs: 50 }), span({ spanId: 'c', parentSpanId: 'r', startTimeMs: 10, durationMs: 100 })]),
    );
    expect(a.nodes.get('c')!.criticalMs).toBe(40);
    expect(a.nodes.get('r')!.criticalMs).toBe(10);
  });
  it('spans the whole window for multiple roots, including gaps', () => {
    const a = analyzed(doc([span({ spanId: 'r1', durationMs: 10 }), span({ spanId: 'r2', startTimeMs: 30, durationMs: 10 })]));
    expect(a.durationMs).toBe(40);
    expect(a.criticalPath.find((s) => s.spanId === TRACE_WINDOW_ID)).toEqual({ spanId: TRACE_WINDOW_ID, startMs: 10, endMs: 30 });
  });
});

describe('diagnostics on samples', () => {
  it('healthy trace reports no dominant bottleneck', () => {
    const a = sample('healthy-order');
    expect(a.durationMs).toBe(448);
    expect(a.findings.map((f) => f.ruleId)).toEqual(['no-dominant-bottleneck']);
  });
  it('slow database trace flags the SELECT without claiming a missing index', () => {
    const a = sample('slow-database');
    const f = a.findings.find((x) => x.ruleId === 'slow-database');
    expect(f?.spanIds).toEqual(['db-sel-1']);
    expect(f?.severity).toBe('high');
    expect(f?.caveat).toMatch(/cannot tell whether an index is missing/);
    expect(a.findings.some((x) => x.ruleId === 'slow-external-call')).toBe(false);
  });
  it('external trace flags the deepest dominant outbound call', () => {
    const a = sample('external-payment');
    const f = a.findings.find((x) => x.ruleId === 'slow-external-call');
    expect(f?.spanIds).toEqual(['card-1']);
    expect(f?.evidence.some((e) => e.label === 'Called via' && e.spanId === 'pay-1')).toBe(true);
    expect(a.findings.some((x) => x.ruleId === 'slow-database')).toBe(false);
  });
  it('error trace identifies origin spans and propagated parents', () => {
    const a = sample('failing-dependency');
    const f = a.findings.find((x) => x.ruleId === 'erroring-dependency');
    expect(f).toBeDefined();
    expect(f!.title).toMatch(/4 spans failed/);
    expect(f!.evidence.filter((e) => e.label === 'Errored span').map((e) => e.spanId)).toEqual(['pay-1', 'pay-2']);
  });
  it('detects repeated sequential calls', () => {
    const a = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        ...[0, 1, 2, 3].map((i) =>
          span({ spanId: `q${i}`, parentSpanId: 'r', name: 'SELECT item', kind: 'client', startTimeMs: i * 20, durationMs: 18, attributes: { 'db.system.name': 'mysql' } }),
        ),
      ]),
    );
    const f = a.findings.find((x) => x.ruleId === 'repeated-sequential-calls');
    expect(f?.spanIds).toEqual(['q0', 'q1', 'q2', 'q3']);
  });
  it('reports large unexplained self time', () => {
    const a = analyzed(doc([span({ spanId: 'r', durationMs: 1000 }), span({ spanId: 'c', parentSpanId: 'r', startTimeMs: 0, durationMs: 100 })]));
    expect(a.findings.find((x) => x.ruleId === 'uninstrumented-gap')?.spanIds).toEqual(['r']);
  });
});

describe('comparison', () => {
  it('handles zero baselines', () => {
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(0, 5)).toBeNull();
    expect(percentChange(200, 300)).toBe(0.5);
  });
  it('matches spans between healthy and slow-database traces', () => {
    const c = compareTraces(sample('healthy-order'), sample('slow-database'));
    expect(c.deltaMs).toBe(3240 - 448);
    expect(c.added).toHaveLength(0);
    expect(c.removed).toHaveLength(0);
    expect(c.matched.find((m) => m.label === 'api-gateway · POST /api/orders')!.deltaMs).toBe(3240 - 448);
    const sel = c.matched.find((m) => m.current.span.spanId === 'db-sel-1')!;
    expect(sel.deltaMs).toBe(2652 - 38);
  });
  it('reports added, removed and new errors against the failing trace', () => {
    const c = compareTraces(sample('healthy-order'), sample('failing-dependency'));
    expect(c.removed.map((n) => n.span.spanId).sort()).toEqual(['db-ins-1', 'pub-1', 'ser-1']);
    expect(c.added.map((n) => n.span.spanId)).toEqual(['pay-2']);
    expect(c.newErrors.map((n) => n.span.spanId).sort()).toEqual(['gw-1', 'ord-1', 'pay-1', 'pay-2']);
    expect(c.caveats.some((x) => /only appear/.test(x))).toBe(true);
  });
  it('flags non-equivalent root operations', () => {
    const a = analyzed(doc([span({ name: 'GET /a' })]));
    const b = analyzed(doc([span({ name: 'GET /b' })]));
    expect(compareTraces(a, b).caveats.some((x) => /different root operations/.test(x))).toBe(true);
  });
});

describe('report export', () => {
  it('includes provenance and synthetic labelling', () => {
    const r = buildTraceReport(sample('slow-database'), { kind: 'sample', sampleId: 'slow-database' }, new Date('2026-11-19T00:00:00Z'));
    expect(r.provenance.synthetic).toBe(true);
    expect(r.provenance.dataNotice).toMatch(/Synthetic/);
    expect(r.provenance.generatedAt).toBe('2026-11-19T00:00:00.000Z');
    expect(r.spans).toHaveLength(8);
    expect(JSON.parse(JSON.stringify(r)).findings.length).toBeGreaterThan(0);
  });
});
