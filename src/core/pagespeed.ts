import { explainPsiError, parsePsi, psiRequestUrl, type PsiError, type PsiSummary, type Strategy } from './url';

/**
 * Runs a PageSpeed Insights test for a URL that has already passed `normalizeUrl`.
 *
 * With a proxy configured (production), the request goes to the TraceDetective proxy, which
 * holds the project's Google API key server-side and returns a parsed summary. Without one
 * (local development, forks), Google's keyless endpoint is called directly from the browser.
 * If the proxy cannot be reached at all, the keyless endpoint is tried once as a fallback.
 */

export type PageSpeedVia = 'proxy' | 'google';

export type PageSpeedResult =
  | { ok: true; summary: PsiSummary; via: PageSpeedVia; cached: boolean; fetchedAt: string }
  | { ok: false; error: PsiError; via: PageSpeedVia };

export interface PageSpeedOptions {
  proxyUrl?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

export function proxyRequestUrl(proxyUrl: string, url: string, strategy: Strategy): string {
  const base = proxyUrl.replace(/\/+$/, '');
  const p = new URLSearchParams({ url, strategy });
  return `${base}/v1/pagespeed?${p.toString()}`;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function viaGoogle(url: string, strategy: Strategy, f: typeof fetch, signal?: AbortSignal): Promise<PageSpeedResult> {
  try {
    const res = await f(psiRequestUrl(url, strategy), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    const body = await readJson(res);
    if (!res.ok) return { ok: false, via: 'google', error: explainPsiError(res.status, body) };
    return { ok: true, via: 'google', summary: parsePsi(body), cached: false, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, via: 'google', error: explainPsiError(null, null, abortReason(signal) ?? err) };
  }
}

function abortReason(signal?: AbortSignal): unknown {
  return signal?.aborted ? (signal.reason ?? { name: 'AbortError' }) : undefined;
}

export async function runPageSpeed(url: string, strategy: Strategy, options: PageSpeedOptions = {}): Promise<PageSpeedResult> {
  const f = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const { proxyUrl, signal } = options;
  if (!proxyUrl) return viaGoogle(url, strategy, f, signal);

  let res: Response;
  try {
    res = await f(proxyRequestUrl(proxyUrl, url, strategy), { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch (err) {
    if (signal?.aborted) return { ok: false, via: 'proxy', error: explainPsiError(null, null, abortReason(signal)) };
    // Proxy unreachable (outage, blocked by an extension): fall back to Google directly.
    void err;
    return viaGoogle(url, strategy, f, signal);
  }
  const body = await readJson(res);
  if (!res.ok) {
    const error = explainPsiError(res.status, body);
    const retryHeader = Number(res.headers.get('Retry-After'));
    if (error.retryAfterSeconds === undefined && Number.isFinite(retryHeader) && retryHeader > 0) error.retryAfterSeconds = retryHeader;
    return { ok: false, via: 'proxy', error };
  }
  const o = (body ?? {}) as { summary?: PsiSummary; cached?: boolean; fetchedAt?: string };
  if (!o.summary || typeof o.summary !== 'object') {
    return { ok: false, via: 'proxy', error: { kind: 'unknown', message: 'The analysis service returned an unexpected response. Please try again.' } };
  }
  return { ok: true, via: 'proxy', summary: o.summary, cached: !!o.cached, fetchedAt: o.fetchedAt ?? new Date().toISOString() };
}
