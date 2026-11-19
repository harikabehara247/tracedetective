/** Shown on the SDK guide page. Executed in tests/otlp-snippet.test.ts so it stays correct. */
export const CONVERT_SNIPPET = `// Minimal OTLP JSON → TraceDetective conversion (Node.js, run locally)
// OTLP JSON: traceId/spanId are hex strings, times are nanosecond strings,
// span kind and status code are integers.
const KIND = { 1: 'internal', 2: 'server', 3: 'client', 4: 'producer', 5: 'consumer' };
const STATUS = { 0: 'unset', 1: 'ok', 2: 'error' };
const value = (v) => v.stringValue ?? v.boolValue ?? Number(v.intValue ?? v.doubleValue);

function convert(otlp) {
  const spans = [];
  for (const rs of otlp.resourceSpans ?? []) {
    const service = rs.resource?.attributes?.find((a) => a.key === 'service.name');
    for (const ss of rs.scopeSpans ?? []) {
      for (const s of ss.spans ?? []) {
        const start = Number(BigInt(s.startTimeUnixNano) / 1000n) / 1000;
        const end = Number(BigInt(s.endTimeUnixNano) / 1000n) / 1000;
        spans.push({
          traceId: s.traceId, spanId: s.spanId,
          ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
          name: s.name, service: service ? value(service.value) : 'unknown',
          kind: KIND[s.kind] ?? 'internal', startTimeMs: start, durationMs: end - start,
          status: STATUS[s.status?.code ?? 0],
          attributes: Object.fromEntries((s.attributes ?? []).map((a) => [a.key, value(a.value)])),
        });
      }
    }
  }
  return { schemaVersion: '1.0', traceId: spans[0]?.traceId, synthetic: false, spans };
}`;
