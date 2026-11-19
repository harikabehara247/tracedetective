import { formatMs, formatPct } from './format';
import type { Finding, SpanNode, TraceAnalysis } from './types';

/** Thresholds are deliberately simple and documented so findings are explainable. */
export const RULE_THRESHOLDS = {
  /** Share of total trace duration a span must hold on the critical path. */
  dominantShare: 0.35,
  /** Minimum critical-path time before a dominant span is reported. */
  dominantMinMs: 300,
  /** Unexplained self time in a parent span, as a share of the trace and in ms. */
  gapShare: 0.2,
  gapMinMs: 100,
  /** Repeated sequential sibling calls with the same operation. */
  repeatedMinCount: 3,
} as const;

export function isDatabaseSpan(n: SpanNode): boolean {
  const a = n.span.attributes;
  return 'db.system' in a || 'db.system.name' in a || 'db.statement' in a || 'db.query.text' in a;
}

export function isExternalCall(n: SpanNode): boolean {
  if (isDatabaseSpan(n)) return false;
  const a = n.span.attributes;
  const http = 'http.method' in a || 'http.request.method' in a || 'url.full' in a || 'http.url' in a;
  const rpc = 'rpc.system' in a;
  return (n.span.kind === 'client' && (http || rpc)) || 'peer.service' in a;
}

function attr(n: SpanNode, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = n.span.attributes[k];
    if (v !== undefined) return String(v);
  }
  return undefined;
}

function spanLabel(n: SpanNode): string {
  return `${n.span.service} · ${n.span.name}`;
}

function share(ms: number, total: number): number {
  return total > 0 ? ms / total : 0;
}

/** Spans whose critical-path time dominates the trace, excluding ancestors that merely wait. */
function dominantSpans(a: TraceAnalysis, predicate: (n: SpanNode) => boolean): SpanNode[] {
  return a.ordered.filter((n) => {
    if (!predicate(n)) return false;
    // For DB/external spans, the time includes children they are waiting on (e.g. the remote
    // server span), so measure the span's full critical-path coverage, not only self time.
    const covered = criticalCoverage(a, n);
    return covered >= RULE_THRESHOLDS.dominantMinMs && share(covered, a.durationMs) >= RULE_THRESHOLDS.dominantShare;
  });
}

/** Critical-path time attributed to a span or any of its descendants. */
export function criticalCoverage(_a: TraceAnalysis, n: SpanNode): number {
  let total = 0;
  const stack = [n];
  while (stack.length) {
    const cur = stack.pop()!;
    total += cur.criticalMs;
    stack.push(...cur.children);
  }
  return total;
}

function hasAncestor(n: SpanNode, pred: (p: SpanNode) => boolean): boolean {
  for (let p = n.parent; p; p = p.parent) if (pred(p)) return true;
  return false;
}

function slowDatabase(a: TraceAnalysis): Finding[] {
  return dominantSpans(a, isDatabaseSpan)
    .filter((n) => !hasAncestor(n, isDatabaseSpan))
    .map((n) => {
      const covered = criticalCoverage(a, n);
      const stmt = attr(n, 'db.query.text', 'db.statement');
      const evidence = [
        { spanId: n.span.spanId, label: 'Span', value: spanLabel(n) },
        { spanId: n.span.spanId, label: 'Duration', value: formatMs(n.span.durationMs) },
        { spanId: n.span.spanId, label: 'Critical-path share', value: `${formatPct(share(covered, a.durationMs))} of ${formatMs(a.durationMs)}` },
      ];
      const system = attr(n, 'db.system.name', 'db.system');
      if (system) evidence.push({ spanId: n.span.spanId, label: 'Database', value: system });
      if (stmt) evidence.push({ spanId: n.span.spanId, label: 'Statement', value: stmt });
      const rows = attr(n, 'db.response.returned_rows', 'db.rows_returned');
      if (rows) evidence.push({ spanId: n.span.spanId, label: 'Rows returned', value: rows });
      return {
        id: `slow-db:${n.span.spanId}`,
        ruleId: 'slow-database',
        severity: share(covered, a.durationMs) >= 0.6 ? 'high' : 'medium',
        title: `Database call dominates the request: ${n.span.name}`,
        observation: `${spanLabel(n)} took ${formatMs(n.span.durationMs)} and accounts for ${formatPct(share(covered, a.durationMs))} of the critical path.`,
        evidence,
        possibleExplanations: [
          'The query plan scans more rows than needed (for example a missing or unused index, or a non-selective filter).',
          'Lock contention or a long-running transaction blocking this statement.',
          'Connection-pool wait time included in the span.',
          'A large result set being transferred or materialised.',
        ],
        verifyNext: [
          'Run EXPLAIN (ANALYZE, BUFFERS) or your database’s equivalent on this statement with representative parameters.',
          'Check lock waits and slow-query logs for the same time window.',
          'Compare against a healthy trace of the same endpoint to see whether this span regressed.',
        ],
        caveat: 'The trace shows where time was spent, not why. It cannot tell whether an index is missing; only the query plan can.',
        spanIds: [n.span.spanId],
      } satisfies Finding;
    });
}

function slowExternal(a: TraceAnalysis): Finding[] {
  const dominant = dominantSpans(a, isExternalCall);
  // Report the deepest dominant call: it is closest to where the waiting happened.
  return dominant
    .filter((n) => !dominant.some((d) => d !== n && hasAncestor(d, (p) => p === n)))
    .map((n) => {
      const via = dominant.filter((d) => d !== n && hasAncestor(n, (p) => p === d));
      const covered = criticalCoverage(a, n);
      const target = attr(n, 'server.address', 'peer.service', 'url.full', 'http.url', 'net.peer.name');
      const status = attr(n, 'http.response.status_code', 'http.status_code');
      const retry = attr(n, 'http.request.resend_count', 'retry.attempt');
      const evidence = [
        { spanId: n.span.spanId, label: 'Span', value: spanLabel(n) },
        { spanId: n.span.spanId, label: 'Duration', value: formatMs(n.span.durationMs) },
        { spanId: n.span.spanId, label: 'Critical-path share', value: `${formatPct(share(covered, a.durationMs))} of ${formatMs(a.durationMs)}` },
      ];
      if (target) evidence.push({ spanId: n.span.spanId, label: 'Target', value: target });
      if (status) evidence.push({ spanId: n.span.spanId, label: 'HTTP status', value: status });
      if (retry) evidence.push({ spanId: n.span.spanId, label: 'Retry attempt', value: retry });
      for (const d of via) evidence.push({ spanId: d.span.spanId, label: 'Called via', value: `${spanLabel(d)} (${formatMs(d.span.durationMs)})` });
      return {
        id: `slow-external:${n.span.spanId}`,
        ruleId: 'slow-external-call',
        severity: share(covered, a.durationMs) >= 0.6 ? 'high' : 'medium',
        title: `Outbound call dominates the request: ${n.span.name}`,
        observation: `The request waited ${formatMs(covered)} on ${target ?? n.span.service}, ${formatPct(share(covered, a.durationMs))} of the critical path.`,
        evidence,
        possibleExplanations: [
          'The upstream service is slow (check its own traces or status page).',
          'Retries or backoff inside the client are hidden within this span.',
          'Network latency, DNS or TLS handshake cost on a cold connection.',
        ],
        verifyNext: [
          'Check whether the downstream service reports the same latency on its side of the call.',
          'Review client timeout and retry settings for this dependency.',
          'Consider whether the call can be cached, made asynchronous, or moved off the request path.',
        ],
        caveat: 'Client-side span duration includes network and queueing time; it does not prove the upstream service itself is slow.',
        spanIds: [n.span.spanId],
      } satisfies Finding;
    });
}

function errors(a: TraceAnalysis): Finding[] {
  const errored = a.ordered.filter((n) => n.span.status === 'error');
  if (errored.length === 0) return [];
  // Origin candidates: error spans with no errored descendants.
  const origins = errored.filter((n) => {
    const stack = [...n.children];
    while (stack.length) {
      const c = stack.pop()!;
      if (c.span.status === 'error') return false;
      stack.push(...c.children);
    }
    return true;
  });
  const propagated = errored.filter((n) => !origins.includes(n));
  const evidence = origins.flatMap((n) => {
    const items = [{ spanId: n.span.spanId, label: 'Errored span', value: `${spanLabel(n)} (${formatMs(n.span.durationMs)})` }];
    const status = attr(n, 'http.response.status_code', 'http.status_code', 'rpc.grpc.status_code');
    if (status) items.push({ spanId: n.span.spanId, label: 'Status code', value: status });
    const msg = attr(n, 'error.message', 'exception.message', 'error.type');
    if (msg) items.push({ spanId: n.span.spanId, label: 'Error', value: msg });
    return items;
  });
  if (propagated.length > 0) {
    evidence.push({
      spanId: propagated[0]!.span.spanId,
      label: 'Also marked as error',
      value: propagated.map(spanLabel).join(', '),
    });
  }
  const services = [...new Set(origins.map((n) => n.span.service))];
  return [
    {
      id: 'errors',
      ruleId: 'erroring-dependency',
      severity: 'high',
      title: `${errored.length} span${errored.length === 1 ? '' : 's'} failed; earliest-failing ${services.length === 1 ? 'service is' : 'services are'} ${services.join(', ')}`,
      observation: `${origins.length} span${origins.length === 1 ? '' : 's'} reported an error without an errored child, which makes ${origins.length === 1 ? 'it' : 'them'} the most likely place the failure started. ${propagated.length} parent span${propagated.length === 1 ? '' : 's'} also reported errors.`,
      evidence,
      possibleExplanations: [
        'The dependency is unavailable or overloaded (5xx responses).',
        'An invalid request was sent to the dependency (4xx responses).',
        'Parents marked as errors are likely propagating the child failure rather than failing independently.',
      ],
      verifyNext: [
        'Look up logs for the failing service using this trace ID.',
        'Check the dependency’s health and recent deployments for the same time window.',
        'Confirm retries and fallbacks behave as intended for this failure.',
      ],
      caveat: 'Error status only tells us a span reported failure. An uninstrumented component could still be the true origin.',
      spanIds: errored.map((n) => n.span.spanId),
    },
  ];
}

function uninstrumentedGaps(a: TraceAnalysis): Finding[] {
  return a.ordered
    .filter(
      (n) =>
        n.children.length > 0 &&
        n.selfMs >= RULE_THRESHOLDS.gapMinMs &&
        share(n.selfMs, a.durationMs) >= RULE_THRESHOLDS.gapShare,
    )
    .map((n) => ({
      id: `gap:${n.span.spanId}`,
      ruleId: 'uninstrumented-gap',
      severity: 'low',
      title: `Unexplained time inside ${n.span.name}`,
      observation: `${spanLabel(n)} spent ${formatMs(n.selfMs)} (${formatPct(share(n.selfMs, a.durationMs))} of the trace) outside any child span.`,
      evidence: [
        { spanId: n.span.spanId, label: 'Span duration', value: formatMs(n.span.durationMs) },
        { spanId: n.span.spanId, label: 'Covered by children', value: formatMs(n.span.durationMs - n.selfMs) },
        { spanId: n.span.spanId, label: 'Self time', value: formatMs(n.selfMs) },
      ],
      possibleExplanations: [
        'Application code (CPU work, serialisation) that has no span of its own.',
        'Calls to libraries or services that are not instrumented.',
        'Waiting on a thread pool, lock or event loop.',
      ],
      verifyNext: [
        'Add spans around the main steps of this operation to narrow down the time.',
        'Profile the service (CPU and allocation) for this endpoint.',
      ],
      caveat: 'Self time is unexplained, not necessarily CPU time.',
      spanIds: [n.span.spanId],
    }));
}

function repeatedSequential(a: TraceAnalysis): Finding[] {
  const findings: Finding[] = [];
  for (const parent of a.ordered) {
    const groups = new Map<string, SpanNode[]>();
    for (const c of parent.children) {
      const key = `${c.span.service}::${c.span.name}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const [key, group] of groups) {
      if (group.length < RULE_THRESHOLDS.repeatedMinCount) continue;
      const sequential = group.every((c, i) => i === 0 || c.startMs >= group[i - 1]!.endMs - 0.001);
      if (!sequential) continue;
      const total = group.reduce((s, c) => s + c.span.durationMs, 0);
      findings.push({
        id: `repeated:${parent.span.spanId}:${key}`,
        ruleId: 'repeated-sequential-calls',
        severity: share(total, a.durationMs) >= 0.3 ? 'medium' : 'low',
        title: `${group.length} sequential calls to ${group[0]!.span.name}`,
        observation: `${spanLabel(parent)} called ${group[0]!.span.name} ${group.length} times one after another, for ${formatMs(total)} in total (${formatPct(share(total, a.durationMs))} of the trace).`,
        evidence: group.slice(0, 10).map((c, i) => ({ spanId: c.span.spanId, label: `Call ${i + 1}`, value: formatMs(c.span.durationMs) })),
        possibleExplanations: [
          'A loop issuing one query or request per item (an "N+1" pattern).',
          'Retries of a failing or slow call.',
          'Calls that genuinely depend on each other’s results.',
        ],
        verifyNext: [
          'Check whether the calls depend on each other; if not, consider batching or running them concurrently.',
          'If these are retries, check the error and backoff settings.',
        ],
        caveat: 'Sequential timing alone does not show the calls are independent. Check data dependencies before parallelising.',
        spanIds: group.map((c) => c.span.spanId),
      });
    }
  }
  return findings;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 } as const;

export function runDiagnostics(a: TraceAnalysis): Finding[] {
  const findings = [...errors(a), ...slowDatabase(a), ...slowExternal(a), ...repeatedSequential(a), ...uninstrumentedGaps(a)];
  if (findings.length === 0) {
    const top = [...a.ordered].sort((x, y) => y.criticalMs - x.criticalMs)[0];
    findings.push({
      id: 'no-dominant-bottleneck',
      ruleId: 'no-dominant-bottleneck',
      severity: 'info',
      title: 'No dominant bottleneck found',
      observation: `No error, and no single database or external call holds more than ${formatPct(RULE_THRESHOLDS.dominantShare)} of the ${formatMs(a.durationMs)} critical path.`,
      evidence: top
        ? [{ spanId: top.span.spanId, label: 'Largest critical-path contributor', value: `${spanLabel(top)} · ${formatMs(top.criticalMs)} (${formatPct(share(top.criticalMs, a.durationMs))})` }]
        : [],
      possibleExplanations: ['Time is spread across several operations.'],
      verifyNext: ['Compare this trace with a slower one for the same endpoint to see what changes.'],
      caveat: 'A single trace is one sample. Check latency percentiles before concluding an endpoint is healthy.',
      spanIds: top ? [top.span.spanId] : [],
    });
  }
  return findings.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
}
