/**
 * URL analysis helpers, shared by the browser app and the PageSpeed proxy (worker/).
 * URLs are measured by Google PageSpeed Insights (Google's servers fetch the page) or,
 * optionally, by the visitor's own browser. The proxy only ever calls Google; it never
 * fetches the visitor's URL, so there is no SSRF surface. Input is still validated, in the
 * browser and again in the proxy, so private and local targets are refused before anything runs.
 */

import { parseLabExtras, type LcpInfo, type NetRequest, type PsiInsight, type Screenshot } from './website';

export type NormalizeResult = { ok: true; url: string; host: string; notes: string[] } | { ok: false; error: string };

const MAX_URL_LENGTH = 2048;
const SENSITIVE_PARAM = /token|secret|pass(word)?|api[-_]?key|^key$|auth|session|sig(nature)?$|credential/i;

function ipv4Private(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function ipv6Private(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  return h === '::' || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:') || h.startsWith('ff');
}

export function isPublicHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return false;
  if (ipv4Private(h) || ipv6Private(h)) return false;
  if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/i.test(h)) return false; // integer/hex IP forms
  if (!h.includes('.') && !h.includes(':')) return false; // single-label names
  return true;
}

/** Validate and normalise user input such as "hview.in" into "https://hview.in/". */
export function normalizeUrl(input: string): NormalizeResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Enter a website or API URL, for example https://example.com.' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: `URLs longer than ${MAX_URL_LENGTH} characters are not supported.` };
  const notes: string[] = [];
  let candidate = raw;
  // "host:port" has no scheme; only treat the prefix as a scheme when it is followed by // or is a known non-web scheme.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && !/^(javascript|data|mailto|file|blob|about|vbscript|ftp|tel):/i.test(candidate)) {
    candidate = `https://${candidate}`;
    notes.push('No protocol given, so https:// was added.');
  }
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { ok: false, error: 'That does not look like a valid URL.' };
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'Only http:// and https:// URLs can be checked.' };
  if (u.username || u.password) return { ok: false, error: 'Remove the username or password from the URL. Never put credentials in a URL you check.' };
  if (!isPublicHostname(u.hostname)) {
    return { ok: false, error: 'Only public websites can be checked. Local, private-network and internal addresses are refused.' };
  }
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) notes.push(`Non-standard port ${u.port}: some measurement services refuse it.`);
  if (u.hash) {
    u.hash = '';
    notes.push('The #fragment was removed because it is never sent to the server.');
  }
  const sensitive = [...u.searchParams.keys()].filter((k) => SENSITIVE_PARAM.test(k));
  if (sensitive.length) {
    return { ok: false, error: `Remove the ${sensitive.join(', ')} parameter${sensitive.length > 1 ? 's' : ''} first. Query strings that look like secrets are never sent to a measurement service.` };
  }
  if (u.protocol === 'http:') notes.push('This is an unencrypted http:// URL. Browsers block requests to it from this https page, so only PageSpeed Insights can measure it.');
  return { ok: true, url: u.toString(), host: u.hostname, notes };
}

// ---------------------------------------------------------------------------
// PageSpeed Insights (Lighthouse lab data + Chrome UX Report field data)
// ---------------------------------------------------------------------------

export type Strategy = 'mobile' | 'desktop';

export function psiRequestUrl(url: string, strategy: Strategy, apiKey?: string): string {
  const p = new URLSearchParams({ url, strategy, category: 'performance' });
  if (apiKey?.trim()) p.set('key', apiKey.trim());
  return `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${p.toString()}`;
}

export interface FieldMetric {
  key: string;
  label: string;
  percentile: number;
  unit: 'ms' | 'score';
  category: string;
}

export interface PsiSummary {
  requestedUrl: string;
  finalUrl: string;
  fetchTime: string;
  lighthouseVersion: string;
  formFactor: string;
  throttling: string;
  userAgent: string;
  runWarnings: string[];
  mainDocument?: { url: string; statusCode?: number; protocol?: string; mimeType?: string; transferSize?: number };
  redirects: { url: string; wastedMs: number }[];
  serverResponseMs?: number;
  fcpMs?: number;
  lcpMs?: number;
  tbtMs?: number;
  cls?: number;
  speedIndexMs?: number;
  totalBytes?: number;
  requestCount?: number;
  performanceScore?: number;
  audits: Record<string, { score: number | null; displayValue?: string; title?: string }>;
  /** `period` is set only when the response includes CrUX's collection period. */
  field: { scope: 'url' | 'origin'; overall?: string; metrics: FieldMetric[]; period?: { first: string; last: string } } | null;
  // Added in 0.4.0. Optional, because an older analysis service may not return them.
  ttfbMs?: number;
  screenshot?: Screenshot;
  filmstrip?: Screenshot[];
  viewport?: { width: number; height: number };
  requests?: NetRequest[];
  lcp?: LcpInfo;
  insights?: PsiInsight[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const FIELD_LABELS: Record<string, [string, 'ms' | 'score']> = {
  LARGEST_CONTENTFUL_PAINT_MS: ['Largest Contentful Paint (p75)', 'ms'],
  INTERACTION_TO_NEXT_PAINT: ['Interaction to Next Paint (p75)', 'ms'],
  CUMULATIVE_LAYOUT_SHIFT_SCORE: ['Cumulative Layout Shift (p75)', 'score'],
  FIRST_CONTENTFUL_PAINT_MS: ['First Contentful Paint (p75)', 'ms'],
  EXPERIMENTAL_TIME_TO_FIRST_BYTE: ['Time to First Byte (p75)', 'ms'],
};

function parseField(exp: Json, scope: 'url' | 'origin'): PsiSummary['field'] {
  const metrics = obj(exp.metrics);
  const list: FieldMetric[] = [];
  for (const [key, [label, unit]] of Object.entries(FIELD_LABELS)) {
    const m = obj(metrics[key]);
    let p = num(m.percentile);
    if (p === undefined) continue;
    // CrUX reports CLS multiplied by 100.
    if (unit === 'score') p = p / 100;
    list.push({ key, label, percentile: p, unit, category: str(m.category) });
  }
  if (list.length === 0) return null;
  const day = (d: unknown) => {
    const o = obj(d);
    const [y, m, dd] = [num(o.year), num(o.month), num(o.day)];
    return y && m && dd ? `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}` : undefined;
  };
  const cp = obj(exp.collectionPeriod);
  const [first, last] = [day(cp.firstDate), day(cp.lastDate)];
  return { scope, overall: str(exp.overall_category) || undefined, metrics: list, ...(first && last ? { period: { first, last } } : {}) };
}

/** Extract the parts of a PSI v5 response that TraceDetective reports. Never throws. */
export function parsePsi(json: unknown): PsiSummary {
  const root = obj(json);
  const lh = obj(root.lighthouseResult);
  const audits = obj(lh.audits);
  const audit = (id: string) => obj(audits[id]);
  const cfg = obj(lh.configSettings);
  const env = obj(lh.environment);
  const items = (id: string) => (Array.isArray(obj(audit(id).details).items) ? (obj(audit(id).details).items as unknown[]) : []);

  const finalUrl = str(lh.finalDisplayedUrl) || str(lh.finalUrl);
  const requests = items('network-requests').map(obj);
  const doc = requests.find((r) => str(r.resourceType) === 'Document') ?? requests[0];

  const keep = ['server-response-time', 'redirects', 'total-byte-weight', 'largest-contentful-paint', 'cumulative-layout-shift', 'total-blocking-time', 'first-contentful-paint', 'speed-index', 'uses-text-compression', 'uses-long-cache-ttl', 'render-blocking-resources', 'unused-javascript', 'modern-image-formats', 'uses-optimized-images'];
  const auditSummary: PsiSummary['audits'] = {};
  for (const id of keep) {
    const a = audit(id);
    if (Object.keys(a).length === 0) continue;
    auditSummary[id] = { score: typeof a.score === 'number' ? a.score : null, displayValue: str(a.displayValue) || undefined, title: str(a.title) || undefined };
  }

  const urlField = parseField(obj(root.loadingExperience), 'url');
  const originField = urlField ? null : parseField(obj(root.originLoadingExperience), 'origin');
  const perf = num(obj(obj(lh.categories).performance).score);
  const lcpMs = num(audit('largest-contentful-paint').numericValue);
  const extras = parseLabExtras(lh, finalUrl, lcpMs);

  return {
    requestedUrl: str(lh.requestedUrl) || str(root.id),
    finalUrl,
    fetchTime: str(lh.fetchTime) || str(root.analysisUTCTimestamp),
    lighthouseVersion: str(lh.lighthouseVersion),
    formFactor: str(cfg.formFactor),
    throttling: str(cfg.throttlingMethod),
    userAgent: str(env.networkUserAgent),
    runWarnings: Array.isArray(lh.runWarnings) ? (lh.runWarnings as unknown[]).map(String) : [],
    mainDocument: doc
      ? { url: str(doc.url), statusCode: num(doc.statusCode), protocol: str(doc.protocol) || undefined, mimeType: str(doc.mimeType) || undefined, transferSize: num(doc.transferSize) }
      : undefined,
    redirects: items('redirects').map(obj).map((r) => ({ url: str(r.url), wastedMs: num(r.wastedMs) ?? 0 })),
    serverResponseMs: num(audit('server-response-time').numericValue),
    fcpMs: num(audit('first-contentful-paint').numericValue),
    lcpMs,
    tbtMs: num(audit('total-blocking-time').numericValue),
    cls: num(audit('cumulative-layout-shift').numericValue),
    speedIndexMs: num(audit('speed-index').numericValue),
    totalBytes: num(audit('total-byte-weight').numericValue),
    requestCount: requests.length || undefined,
    performanceScore: perf,
    audits: auditSummary,
    field: urlField ?? originField,
    ...extras,
  };
}

export type PsiErrorKind = 'quota' | 'rate_limited' | 'busy' | 'invalid' | 'lighthouse' | 'timeout' | 'network' | 'unknown';
export type PsiError = { kind: PsiErrorKind; message: string; retryAfterSeconds?: number };

/** Turn a failed PageSpeed Insights response (from Google or the proxy) or a fetch error into a plain explanation. */
export function explainPsiError(status: number | null, body: unknown, thrown?: unknown): PsiError {
  if (thrown) {
    const name = (thrown as { name?: string }).name;
    if (name === 'AbortError' || name === 'TimeoutError') return { kind: 'timeout', message: 'The test did not finish within 90 seconds. Very slow or very large pages can take longer. Try again in a minute.' };
    return { kind: 'network', message: 'The analysis service could not be reached. Check your connection, and whether an ad blocker or firewall blocks it.' };
  }
  const err = obj(obj(body).error);
  const msg = str(err.message);
  const code = str(err.code);
  const retry = num(err.retryAfterSeconds);
  // Errors produced by the TraceDetective proxy carry a string code.
  if (code === 'rate_limited') return { kind: 'rate_limited', message: `Too many analyses from your connection in a short time. Please wait ${retry ?? 60} seconds and try again.`, retryAfterSeconds: retry ?? 60 };
  if (code === 'busy') return { kind: 'busy', message: 'The analysis service is very busy right now. Please try again in a minute.', retryAfterSeconds: retry ?? 60 };
  if (code === 'quota' || status === 429) {
    return {
      kind: 'quota',
      message: 'Google’s free PageSpeed Insights quota is used up for now, so the lab test could not run. Try again later, open the same test on the PageSpeed Insights website, or run the browser timing check instead.',
    };
  }
  if (code === 'not_configured') return { kind: 'busy', message: 'The analysis service is temporarily unavailable. Please try again later, or open the test on the PageSpeed Insights website.' };
  if (code === 'invalid_url') return { kind: 'invalid', message: msg || 'That URL cannot be analysed.' };
  if (code === 'lighthouse' || ((status === 400 || status === 500) && /FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST|DNS|NO_FCP|NOT_HTML|unable to reliably load|INSECURE|PROTOCOL_TIMEOUT/i.test(msg))) {
    return {
      kind: 'lighthouse',
      message: `Google’s test browser could not load this page. The site may be down, slow to respond, blocking automated browsers, or not returning an HTML page.${msg ? ` Details: ${shorten(msg)}` : ''}`,
    };
  }
  if (status === 400) return { kind: 'invalid', message: msg ? `PageSpeed Insights could not accept this URL: ${shorten(msg)}` : 'PageSpeed Insights could not accept this URL.' };
  if (status !== null && status >= 500) return { kind: 'unknown', message: `The analysis service had a temporary problem (HTTP ${status}). Please try again.` };
  return { kind: 'unknown', message: msg ? shorten(msg) : `The analysis failed (HTTP ${status ?? 'error'}).` };
}

const shorten = (m: string) => (m.length > 300 ? `${m.slice(0, 297)}…` : m);

// ---------------------------------------------------------------------------
// Browser probe: timing of requests made by the visitor's own browser
// ---------------------------------------------------------------------------

export interface ProbeSample {
  attempt: number;
  ok: boolean;
  totalMs: number;
  error?: string;
  /** Only present when the server sends Timing-Allow-Origin. */
  breakdown?: { dnsMs: number; connectMs: number; tlsMs: number; waitMs: number; downloadMs: number; protocol: string };
}

export interface ProbeSummary {
  samples: ProbeSample[];
  successful: number;
  firstMs?: number;
  medianMs?: number;
  minMs?: number;
  maxMs?: number;
  repeatMedianMs?: number;
  breakdownAvailable: boolean;
}

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
}

export function summarizeProbe(samples: ProbeSample[]): ProbeSummary {
  const ok = samples.filter((s) => s.ok);
  const times = ok.map((s) => s.totalMs);
  return {
    samples,
    successful: ok.length,
    firstMs: ok[0]?.totalMs,
    medianMs: median(times),
    minMs: times.length ? Math.min(...times) : undefined,
    maxMs: times.length ? Math.max(...times) : undefined,
    repeatMedianMs: median(ok.slice(1).map((s) => s.totalMs)),
    breakdownAvailable: ok.some((s) => !!s.breakdown),
  };
}

interface ProbeDeps {
  fetch: typeof fetch;
  now: () => number;
  timing: (url: string) => PerformanceResourceTiming | undefined;
}

const defaultDeps = (): ProbeDeps => ({
  fetch: (...a) => fetch(...a),
  now: () => performance.now(),
  timing: (url) => {
    const list = performance.getEntriesByName(url, 'resource') as PerformanceResourceTiming[];
    return list[list.length - 1];
  },
});

/**
 * Sends `count` sequential GET requests from the visitor's browser with `no-cors`.
 * The response is opaque, so the status code is never visible; only timing is reported.
 */
export async function runBrowserProbe(url: string, count = 5, timeoutMs = 10_000, deps: ProbeDeps = defaultDeps(), onSample?: (s: ProbeSample) => void): Promise<ProbeSummary> {
  const samples: ProbeSample[] = [];
  for (let i = 0; i < count; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = deps.now();
    let sample: ProbeSample;
    try {
      await deps.fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', signal: ctrl.signal });
      const totalMs = Math.round((deps.now() - t0) * 10) / 10;
      sample = { attempt: i + 1, ok: true, totalMs };
      const e = deps.timing(url);
      if (e && e.requestStart > 0) {
        const r = (x: number) => Math.max(0, Math.round(x * 10) / 10);
        sample.breakdown = {
          dnsMs: r(e.domainLookupEnd - e.domainLookupStart),
          connectMs: r(e.connectEnd - e.connectStart),
          tlsMs: e.secureConnectionStart > 0 ? r(e.connectEnd - e.secureConnectionStart) : 0,
          waitMs: r(e.responseStart - e.requestStart),
          downloadMs: r(e.responseEnd - e.responseStart),
          protocol: e.nextHopProtocol || '',
        };
      }
    } catch (err) {
      const aborted = (err as { name?: string }).name === 'AbortError';
      sample = {
        attempt: i + 1,
        ok: false,
        totalMs: Math.round((deps.now() - t0) * 10) / 10,
        error: aborted ? `No response within ${timeoutMs / 1000} s` : 'Request failed (DNS failure, refused connection, TLS error, or blocked by the browser or an extension)',
      };
    } finally {
      clearTimeout(timer);
    }
    samples.push(sample);
    onSample?.(sample);
  }
  return summarizeProbe(samples);
}

// ---------------------------------------------------------------------------
// Ratings (Core Web Vitals and Lighthouse boundaries)
// ---------------------------------------------------------------------------

export type Rating = 'good' | 'needs-improvement' | 'poor';
export type RatedMetric = 'fcp' | 'lcp' | 'tbt' | 'cls' | 'speedIndex' | 'serverResponse' | 'inp' | 'ttfb';

/** [good up to, poor from]. Web Vitals boundaries for field metrics; Lighthouse mobile boundaries for lab-only metrics. */
export const RATING_BOUNDARIES: Record<RatedMetric, [number, number]> = {
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  tbt: [200, 600],
  cls: [0.1, 0.25],
  speedIndex: [3400, 5800],
  serverResponse: [600, 1800],
  inp: [200, 500],
  ttfb: [800, 1800],
};

export function rateMetric(metric: RatedMetric, value: number): Rating {
  const [good, poor] = RATING_BOUNDARIES[metric];
  if (value <= good) return 'good';
  if (value > poor || (metric !== 'cls' && value >= poor)) return 'poor';
  return 'needs-improvement';
}

/** Chrome UX Report categories → the same three ratings. */
export function rateFieldCategory(category: string): Rating | undefined {
  const c = category.toUpperCase();
  if (c === 'FAST' || c === 'GOOD') return 'good';
  if (c === 'AVERAGE' || c === 'NEEDS_IMPROVEMENT') return 'needs-improvement';
  if (c === 'SLOW' || c === 'POOR') return 'poor';
  return undefined;
}
