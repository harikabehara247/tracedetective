/** Deliberately broken inputs for validation tests. */
const span = (over: Record<string, unknown> = {}) => ({
  traceId: 't1',
  spanId: 'a',
  name: 'root',
  service: 'svc',
  kind: 'server',
  startTimeMs: 0,
  durationMs: 10,
  status: 'ok',
  attributes: {},
  ...over,
});
const doc = (spans: unknown[], over: Record<string, unknown> = {}) => ({ schemaVersion: '1.0', traceId: 't1', synthetic: true, spans, ...over });

export const MALFORMED = {
  wrongVersion: doc([span()], { schemaVersion: '2.0' }),
  noSpans: doc([]),
  negativeDuration: doc([span({ durationMs: -5 })]),
  nanStart: doc([span({ startTimeMs: 'soon' })]),
  duplicateIds: doc([span(), span({ parentSpanId: 'a' })]),
  missingParent: doc([span(), span({ spanId: 'b', parentSpanId: 'ghost' })]),
  cycle: doc([span({ spanId: 'x', parentSpanId: 'y' }), span({ spanId: 'y', parentSpanId: 'x' }), span({ spanId: 'r' })]),
  selfParent: doc([span({ parentSpanId: 'a' })]),
  traceMismatch: doc([span({ traceId: 'other' })]),
  badId: doc([span({ spanId: '<script>' })]),
  badStatus: doc([span({ status: 'broken' })]),
};

export const VALID_MINIMAL = doc([span()]);
export { span, doc };
