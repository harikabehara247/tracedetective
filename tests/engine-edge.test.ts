import { describe, expect, it } from 'vitest';
import { analyzeTrace, compareTraces, parseTraceText, validateTrace, type TraceAnalysis } from '../src/core';
import { SAMPLES } from '../src/fixtures';
import { doc, span } from './fixtures/malformed';

function analyzed(input: unknown): TraceAnalysis {
  const r = validateTrace(input);
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return analyzeTrace(r.trace, r.warnings);
}

describe('engine edge cases', () => {
  it('rejects non-finite timestamps (1e400 parses to Infinity)', () => {
    const text = JSON.stringify(doc([span()])).replace('"startTimeMs":0', '"startTimeMs":1e400');
    const r = parseTraceText(text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.message).toMatch(/Infinity|finite/);
  });

  it('warns when the trace window suggests mixed time units', () => {
    const r = validateTrace(doc([span({ durationMs: 2_000_000_000_000 }), span({ spanId: 'b', parentSpanId: 'a', durationMs: 5 })]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.code)).toContain('implausible_window');
  });

  it('gives the same analysis whatever order spans appear in the file', () => {
    const data = SAMPLES.find((s) => s.id === 'slow-database')!.data as { spans: unknown[] };
    const forward = analyzed(data);
    const reversed = analyzed({ ...data, spans: [...data.spans].reverse() });
    expect(reversed.ordered.map((n) => n.span.spanId)).toEqual(forward.ordered.map((n) => n.span.spanId));
    expect(reversed.criticalPath).toEqual(forward.criticalPath);
    expect(reversed.findings.map((f) => f.ruleId)).toEqual(forward.findings.map((f) => f.ruleId));
  });

  it('nested overlapping children: self time counts the union once, critical path sums to duration', () => {
    // root 0-100; a 10-60 and b 40-90 overlap; a has child a1 20-50.
    const a = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'a', parentSpanId: 'r', startTimeMs: 10, durationMs: 50 }),
        span({ spanId: 'b', parentSpanId: 'r', startTimeMs: 40, durationMs: 50 }),
        span({ spanId: 'a1', parentSpanId: 'a', startTimeMs: 20, durationMs: 30 }),
      ]),
    );
    const byId = new Map(a.ordered.map((n) => [n.span.spanId, n]));
    expect(byId.get('r')!.selfMs).toBe(20); // 100 - union(10-90)
    expect(byId.get('a')!.selfMs).toBe(20);
    expect(byId.get('b')!.selfMs).toBe(50);
    const total = a.criticalPath.reduce((s, x) => s + (x.endMs - x.startMs), 0);
    expect(total).toBeCloseTo(100, 6);
    expect(byId.get('b')!.criticalMs).toBeGreaterThan(0); // b finishes last
  });

  it('compare matches siblings that ran in a different order', () => {
    const base = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'x', parentSpanId: 'r', name: 'load user', startTimeMs: 0, durationMs: 40 }),
        span({ spanId: 'y', parentSpanId: 'r', name: 'load cart', startTimeMs: 50, durationMs: 40 }),
      ]),
    );
    const swapped = analyzed(
      doc([
        span({ spanId: 'r', durationMs: 100 }),
        span({ spanId: 'y', parentSpanId: 'r', name: 'load cart', startTimeMs: 0, durationMs: 30 }),
        span({ spanId: 'x', parentSpanId: 'r', name: 'load user', startTimeMs: 50, durationMs: 45 }),
      ]),
    );
    const c = compareTraces(base, swapped);
    expect(c.added).toHaveLength(0);
    expect(c.removed).toHaveLength(0);
    expect(c.matched.find((m) => m.label === 'svc · load user')!.deltaMs).toBe(5);
    expect(c.matched.find((m) => m.label === 'svc · load cart')!.deltaMs).toBe(-10);
  });

  it('compare keeps repeated calls apart by occurrence', () => {
    const calls = (n: number) => [span({ spanId: 'r', durationMs: 100 }), ...Array.from({ length: n }, (_, i) => span({ spanId: `q${i}`, parentSpanId: 'r', name: 'SELECT', startTimeMs: i * 10, durationMs: 5 }))];
    const c = compareTraces(analyzed(doc(calls(2))), analyzed(doc(calls(4))));
    expect(c.matched.filter((m) => m.label === 'svc · SELECT')).toHaveLength(2);
    expect(c.added).toHaveLength(2);
  });
});
