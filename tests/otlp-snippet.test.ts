import { describe, expect, it } from 'vitest';
import { analyzeTrace, validateTrace } from '../src/core';
import { CONVERT_SNIPPET } from '../src/app/otlpSnippet';

// A small OTLP JSON export in the shape defined by the OTLP 1.x JSON encoding:
// hex IDs, nanosecond string timestamps, integer kind and status codes.
const OTLP = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
      scopeSpans: [
        {
          spans: [
            { traceId: '5b8efff798038103d269b633813fc60c', spanId: 'eee19b7ec3c1b174', name: 'POST /checkout', kind: 2,
              startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000250000000', status: { code: 1 }, attributes: [] },
            { traceId: '5b8efff798038103d269b633813fc60c', spanId: 'eee19b7ec3c1b173', parentSpanId: 'eee19b7ec3c1b174', name: 'SELECT cart', kind: 3,
              startTimeUnixNano: '1700000000010000000', endTimeUnixNano: '1700000000210500000', status: { code: 2 },
              attributes: [{ key: 'db.system.name', value: { stringValue: 'postgresql' } }, { key: 'db.response.returned_rows', value: { intValue: '3' } }] },
          ],
        },
      ],
    },
  ],
};

describe('OTLP conversion snippet in the SDK guide', () => {
  it('produces a valid TraceDetective document', () => {
    const convert = new Function(`${CONVERT_SNIPPET}\nreturn convert;`)() as (o: unknown) => unknown;
    const r = validateTrace(convert(OTLP));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = analyzeTrace(r.trace);
    expect(a.durationMs).toBe(250);
    const child = a.nodes.get('eee19b7ec3c1b173')!;
    expect(child.span.kind).toBe('client');
    expect(child.span.status).toBe('error');
    expect(child.span.durationMs).toBeCloseTo(200.5, 6);
    expect(child.span.attributes['db.response.returned_rows']).toBe(3);
  });
});
