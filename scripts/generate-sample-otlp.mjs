// Writes public/samples/*.otlp.json: the synthetic sample traces in OpenTelemetry OTLP/JSON
// form, so visitors can download a real-format example file. Every file is marked synthetic
// with the resource attribute tracedetective.synthetic = true.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const KIND = { internal: 1, server: 2, client: 3, producer: 4, consumer: 5 };
const STATUS = { unset: 0, ok: 1, error: 2 };
const hex = (s, bytes) => createHash('sha256').update(s).digest('hex').slice(0, bytes * 2);
const nanos = (ms) => (BigInt(Math.round(ms * 1000)) * 1000n).toString();
const value = (v) => (typeof v === 'boolean' ? { boolValue: v } : typeof v === 'number' ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) });

mkdirSync('public/samples', { recursive: true });
for (const id of ['slow-database']) {
  const doc = JSON.parse(readFileSync(`src/fixtures/${id}.json`, 'utf8'));
  const traceId = doc.traceId;
  const byService = new Map();
  for (const s of doc.spans) {
    if (!byService.has(s.service)) byService.set(s.service, []);
    byService.get(s.service).push({
      traceId,
      spanId: hex(s.spanId, 8),
      ...(s.parentSpanId ? { parentSpanId: hex(s.parentSpanId, 8) } : {}),
      name: s.name,
      kind: KIND[s.kind] ?? 1,
      startTimeUnixNano: nanos(s.startTimeMs),
      endTimeUnixNano: nanos(s.startTimeMs + s.durationMs),
      attributes: Object.entries(s.attributes ?? {}).map(([key, v]) => ({ key, value: value(v) })),
      status: { code: STATUS[s.status] ?? 0 },
    });
  }
  const otlp = {
    resourceSpans: [...byService.entries()].map(([service, spans]) => ({
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: service } },
          { key: 'tracedetective.synthetic', value: { boolValue: true } },
        ],
      },
      scopeSpans: [{ scope: { name: 'tracedetective-sample' }, spans }],
    })),
  };
  writeFileSync(`public/samples/tracedetective-sample-${id}.otlp.json`, `${JSON.stringify(otlp, null, 2)}\n`);
  console.log(`public/samples/tracedetective-sample-${id}.otlp.json`);
}
