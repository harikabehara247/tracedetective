/**
 * TraceDetective PageSpeed proxy.
 *
 * Holds the project's Google API key server-side (PSI_API_KEY, a Worker secret) so visitors
 * never need one. It only ever calls Google's PageSpeed Insights API; it never fetches the
 * visitor's URL itself, so it cannot be used to reach internal networks. Abuse controls:
 * allowed origins, URL validation, per-client and global rate limits, result caching,
 * a hard timeout, and responses that never contain the key.
 */
import { normalizeUrl, parsePsi, psiRequestUrl, type Strategy } from '../../src/core/url';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** Google API key with only the PageSpeed Insights API enabled. Set with `wrangler secret put PSI_API_KEY`. */
  PSI_API_KEY?: string;
  /** Comma-separated origins allowed to call the proxy, e.g. "https://harikabehara247.github.io". */
  ALLOWED_ORIGINS?: string;
  /** Seconds a successful result is reused for the same URL and device. */
  CACHE_TTL_SECONDS?: string;
  /** Per-client limit (by IP). */
  IP_LIMITER?: RateLimiter;
  /** Whole-service limit that keeps usage under Google's quota. */
  GLOBAL_LIMITER?: RateLimiter;
}

export interface Deps {
  fetch: typeof fetch;
  cache?: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };
  waitUntil?: (p: Promise<unknown>) => void;
  timeoutMs?: number;
}

type ErrorCode = 'bad_request' | 'invalid_url' | 'forbidden_origin' | 'rate_limited' | 'busy' | 'quota' | 'lighthouse' | 'upstream' | 'timeout' | 'not_configured' | 'not_found' | 'method';

const DEFAULT_TTL = 900;
/** Bump when parsePsi's output changes shape. */
const SUMMARY_VERSION = 'v2';
const MAX_QUERY_LENGTH = 2300;

function allowedOrigins(env: Env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    h['Access-Control-Max-Age'] = '86400';
    h['Access-Control-Expose-Headers'] = 'Retry-After';
  }
  return h;
}

function json(body: unknown, status: number, cors: Record<string, string>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...cors,
      ...extra,
    },
  });
}

function fail(code: ErrorCode, message: string, status: number, cors: Record<string, string>, retryAfterSeconds?: number): Response {
  const extra: Record<string, string> = retryAfterSeconds ? { 'Retry-After': String(retryAfterSeconds) } : {};
  return json({ error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } }, status, cors, extra);
}

/** Never let the key leave the Worker, even inside an upstream error message. */
function scrub(text: string, key: string | undefined): string {
  let out = text;
  if (key) out = out.split(key).join('[key]');
  return out.replace(/key=[^&\s"']+/gi, 'key=[key]').slice(0, 300);
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, env);
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 403, headers: cors });
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== 'GET') return fail('method', 'Only GET is supported.', 405, cors);

  if (url.pathname === '/health') {
    return json({ ok: true, keyConfigured: !!env.PSI_API_KEY, originsConfigured: allowedOrigins(env).length > 0 }, 200, cors);
  }
  if (url.pathname !== '/v1/pagespeed') return fail('not_found', 'Not found.', 404, cors);

  // Browsers always send Origin on cross-origin fetches. Requiring an allowed one keeps other
  // websites from embedding the proxy; scripted clients are held back by the rate limits.
  if (!origin || !cors['Access-Control-Allow-Origin']) return fail('forbidden_origin', 'This service only answers the TraceDetective website.', 403, cors);
  if (url.search.length > MAX_QUERY_LENGTH) return fail('bad_request', 'The request is too long.', 414, cors);

  const rawUrl = url.searchParams.get('url') ?? '';
  const strategy = (url.searchParams.get('strategy') ?? 'mobile') as Strategy;
  if (strategy !== 'mobile' && strategy !== 'desktop') return fail('bad_request', 'Device must be mobile or desktop.', 400, cors);
  const n = normalizeUrl(rawUrl);
  if (!n.ok) return fail('invalid_url', n.error, 400, cors);

  if (!env.PSI_API_KEY) return fail('not_configured', 'The analysis service is not configured yet.', 503, cors);

  // Cached results do not count against the limits or Google's quota. `fresh=1` (a rerun after
  // a change) skips the cached copy but still counts against the limits. The key includes the
  // summary format version, so results cached by an older version are not reused.
  const fresh = url.searchParams.get('fresh') === '1';
  const cacheKey = new Request(`https://psi-cache.tracedetective.invalid/${SUMMARY_VERSION}?${new URLSearchParams({ url: n.url, strategy }).toString()}`);
  const hit = fresh ? undefined : await deps.cache?.match(cacheKey);
  if (hit) {
    const body = (await hit.json()) as Record<string, unknown>;
    return json({ ...body, cached: true }, 200, cors);
  }

  const client = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.IP_LIMITER && !(await env.IP_LIMITER.limit({ key: client })).success) {
    return fail('rate_limited', 'Too many analyses from your connection. Please wait a minute.', 429, cors, 60);
  }
  if (env.GLOBAL_LIMITER && !(await env.GLOBAL_LIMITER.limit({ key: 'global' })).success) {
    return fail('busy', 'The analysis service is busy. Please try again in a minute.', 503, cors, 60);
  }

  let upstream: Response;
  try {
    upstream = await deps.fetch(psiRequestUrl(n.url, strategy, env.PSI_API_KEY), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 80_000),
    });
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'TimeoutError' || name === 'AbortError') return fail('timeout', 'The test took too long. Please try again.', 504, cors);
    return fail('upstream', 'PageSpeed Insights could not be reached.', 502, cors);
  }

  let body: unknown = null;
  try {
    body = await upstream.json();
  } catch {
    /* non-JSON upstream body */
  }
  if (!upstream.ok) {
    const msg = scrub(String((body as { error?: { message?: unknown } } | null)?.error?.message ?? ''), env.PSI_API_KEY);
    if (upstream.status === 429) return fail('quota', 'The daily PageSpeed Insights quota is used up. Please try again later.', 503, cors, 3600);
    if (upstream.status === 403 || /api key|api_key|permission|has not been used|is disabled|billing/i.test(msg)) {
      return fail('not_configured', 'The analysis service is not set up correctly. The site maintainer has been asked to check it.', 503, cors);
    }
    if (upstream.status === 400 || upstream.status === 500) return fail('lighthouse', msg || 'Google could not test this page.', 422, cors);
    return fail('upstream', `PageSpeed Insights returned HTTP ${upstream.status}.`, 502, cors);
  }

  const payload = { summary: parsePsi(body), cached: false, fetchedAt: new Date().toISOString() };
  const ttl = Math.max(0, Number(env.CACHE_TTL_SECONDS ?? DEFAULT_TTL) || 0);
  if (deps.cache && ttl > 0) {
    const put = deps.cache.put(cacheKey, new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } }));
    if (deps.waitUntil) deps.waitUntil(put);
    else await put;
  }
  return json(payload, 200, cors);
}
