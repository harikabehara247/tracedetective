import { describe, expect, it, vi } from 'vitest';
import { explainPsiError, isPublicHostname, normalizeUrl, parsePsi, psiRequestUrl, runBrowserProbe, summarizeProbe, urlFindings, type PsiSummary } from '../src/core';

describe('normalizeUrl', () => {
  it('adds https:// and keeps paths and queries', () => {
    const r = normalizeUrl('  hview.in/about?x=1#top ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.url).toBe('https://hview.in/about?x=1');
    expect(r.host).toBe('hview.in');
    expect(r.notes.join(' ')).toMatch(/https:\/\/ was added/);
    expect(r.notes.join(' ')).toMatch(/fragment/);
  });
  it('lowercases the host and accepts http with a warning', () => {
    const r = normalizeUrl('http://Example.COM');
    expect(r.ok && r.url).toBe('http://example.com/');
    expect(r.ok && r.notes.join(' ')).toMatch(/unencrypted/);
  });
  it.each([
    ['', /Enter a website/],
    ['ftp://example.com', /Only http/],
    ['javascript:alert(1)', /Only http/],
    ['https://user:pw@example.com', /username or password/],
    ['http://localhost:3000', /public websites/],
    ['localhost:8080', /public websites/],
    ['data:text/html,hi', /Only http/],
    ['http://127.0.0.1', /public websites/],
    ['http://10.1.2.3', /public websites/],
    ['http://192.168.0.1', /public websites/],
    ['http://172.20.0.1', /public websites/],
    ['http://169.254.169.254/latest/meta-data', /public websites/],
    ['http://[::1]/', /public websites/],
    ['http://[fd00::1]/', /public websites/],
    ['http://2130706433/', /public websites/],
    ['http://printer.local', /public websites/],
    ['http://intranet', /public websites/],
    ['http://exa mple.com', /valid URL/],
    [`https://example.com/${'a'.repeat(2100)}`, /longer than/],
    ['https://example.com/?access_token=abc', /access_token parameter/],
    ['https://example.com/cb?key=1&sig=2', /key, sig parameters/],
  ])('rejects %s', (input, msg) => {
    const r = normalizeUrl(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(msg);
  });
  it('treats public IPs and normal domains as public', () => {
    expect(isPublicHostname('8.8.8.8')).toBe(true);
    expect(isPublicHostname('api.example.co.uk')).toBe(true);
    expect(isPublicHostname('0x7f000001')).toBe(false);
  });
  it('reads host:port input without a scheme', () => {
    const r = normalizeUrl('example.com:8443/health');
    expect(r.ok && r.url).toBe('https://example.com:8443/health');
  });
  it('notes non-standard ports', () => {
    const r = normalizeUrl('https://example.com:9999');
    expect(r.ok && r.notes.join(' ')).toMatch(/port 9999/);
  });
});

describe('PageSpeed Insights', () => {
  it('builds the request URL with an optional key', () => {
    const u = new URL(psiRequestUrl('https://example.com/', 'mobile', ' abc '));
    expect(u.origin + u.pathname).toBe('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    expect(u.searchParams.get('url')).toBe('https://example.com/');
    expect(u.searchParams.get('strategy')).toBe('mobile');
    expect(u.searchParams.get('key')).toBe('abc');
    expect(new URL(psiRequestUrl('https://example.com/', 'desktop')).searchParams.has('key')).toBe(false);
  });

  /** Synthetic response with the same shape as PSI v5 (values invented for the test). */
  const SYNTHETIC_PSI = {
    id: 'https://example.com/',
    loadingExperience: { metrics: {} },
    originLoadingExperience: {
      overall_category: 'AVERAGE',
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: 'AVERAGE' },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: 'FAST' },
      },
    },
    lighthouseResult: {
      requestedUrl: 'http://example.com/',
      finalDisplayedUrl: 'https://www.example.com/',
      fetchTime: '2026-11-19T04:00:00.000Z',
      lighthouseVersion: '12.0.0',
      configSettings: { formFactor: 'mobile', throttlingMethod: 'simulate' },
      environment: { networkUserAgent: 'Mozilla/5.0 Test' },
      runWarnings: ['The page was redirected'],
      categories: { performance: { score: 0.41 } },
      audits: {
        'server-response-time': { numericValue: 1240, score: 0, displayValue: 'Root document took 1,240 ms' },
        'largest-contentful-paint': { numericValue: 5200, score: 0.1 },
        'first-contentful-paint': { numericValue: 1800, score: 0.8 },
        'total-blocking-time': { numericValue: 90, score: 1 },
        'cumulative-layout-shift': { numericValue: 0.02, score: 1 },
        'speed-index': { numericValue: 4000, score: 0.5 },
        'total-byte-weight': { numericValue: 3 * 1024 * 1024, score: 0.3 },
        redirects: { details: { items: [{ url: 'http://example.com/', wastedMs: 380 }, { url: 'https://www.example.com/', wastedMs: 0 }] } },
        'network-requests': {
          details: {
            items: [
              { url: 'https://www.example.com/', resourceType: 'Document', statusCode: 200, protocol: 'h2', mimeType: 'text/html', transferSize: 30000 },
              { url: 'https://www.example.com/app.js', resourceType: 'Script', statusCode: 200 },
            ],
          },
        },
      },
    },
  };

  it('extracts lab, document, redirect and field data', () => {
    const p = parsePsi(SYNTHETIC_PSI);
    expect(p.finalUrl).toBe('https://www.example.com/');
    expect(p.mainDocument).toMatchObject({ statusCode: 200, protocol: 'h2' });
    expect(p.redirects).toHaveLength(2);
    expect(p.serverResponseMs).toBe(1240);
    expect(p.performanceScore).toBe(0.41);
    expect(p.requestCount).toBe(2);
    expect(p.field?.scope).toBe('origin');
    expect(p.field?.metrics.find((m) => m.key === 'CUMULATIVE_LAYOUT_SHIFT_SCORE')?.percentile).toBe(0.05);
    expect(p.audits['server-response-time']?.displayValue).toMatch(/1,240/);
  });

  it('never throws on unexpected shapes', () => {
    expect(() => parsePsi(null)).not.toThrow();
    expect(() => parsePsi({ lighthouseResult: { audits: { 'network-requests': { details: { items: 'x' } } } } })).not.toThrow();
    expect(parsePsi(undefined).field).toBeNull();
  });

  it('turns measurements into evidence-backed findings', () => {
    const ids = urlFindings(parsePsi(SYNTHETIC_PSI), null).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['redirects', 'slow-server', 'lcp', 'weight', 'field']));
    expect(ids).not.toContain('tbt');
    expect(ids).not.toContain('cls');
    const server = urlFindings(parsePsi(SYNTHETIC_PSI), null).find((f) => f.id === 'slow-server')!;
    expect(server.evidence.join(' ')).toMatch(/1.24 s/);
    expect(server.verifyNext.join(' ')).toMatch(/cannot see which code or query/);
  });

  it('reports HTTP errors from the main document', () => {
    const p: PsiSummary = { ...parsePsi(SYNTHETIC_PSI), mainDocument: { url: 'https://x.test/', statusCode: 503 } };
    expect(urlFindings(p, null)[0]).toMatchObject({ id: 'http-error', severity: 'high' });
  });

  it('explains quota, Lighthouse, timeout and network failures', () => {
    expect(explainPsiError(429, {}).kind).toBe('quota');
    expect(explainPsiError(400, { error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } }).kind).toBe('lighthouse');
    expect(explainPsiError(400, { error: { message: 'Invalid value' } }).kind).toBe('invalid');
    expect(explainPsiError(null, null, Object.assign(new Error('x'), { name: 'AbortError' })).kind).toBe('timeout');
    expect(explainPsiError(null, null, new TypeError('Failed to fetch')).kind).toBe('network');
    expect(explainPsiError(502, null).message).toMatch(/502/);
  });
});

describe('browser probe', () => {
  const clock = (times: number[]) => {
    let i = 0;
    return () => times[i++] ?? 0;
  };

  it('times sequential no-cors requests and summarises them', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ type: 'opaque' });
    const seen: number[] = [];
    const r = await runBrowserProbe('https://example.com/', 3, 1000, { fetch: fetchMock, now: clock([0, 400, 1000, 1100, 2000, 2090]), timing: () => undefined }, (s) => seen.push(s.attempt));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ mode: 'no-cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    expect(seen).toEqual([1, 2, 3]);
    expect(r.samples.map((s) => s.totalMs)).toEqual([400, 100, 90]);
    expect(r.firstMs).toBe(400);
    expect(r.medianMs).toBe(100);
    expect(r.repeatMedianMs).toBe(95);
    expect(r.breakdownAvailable).toBe(false);
    expect(urlFindings(null, r).map((f) => f.id)).toEqual(['cold-connection']);
  });

  it('adds a DNS/TLS breakdown only when the server allows it (Timing-Allow-Origin)', async () => {
    const entry = { domainLookupStart: 1, domainLookupEnd: 11, connectStart: 11, secureConnectionStart: 21, connectEnd: 41, requestStart: 41, responseStart: 141, responseEnd: 151, nextHopProtocol: 'h2' } as PerformanceResourceTiming;
    const r = await runBrowserProbe('https://example.com/', 1, 1000, { fetch: vi.fn().mockResolvedValue({}), now: clock([0, 200]), timing: () => entry });
    expect(r.samples[0]!.breakdown).toEqual({ dnsMs: 10, connectMs: 30, tlsMs: 20, waitMs: 100, downloadMs: 10, protocol: 'h2' });
    const hidden = await runBrowserProbe('https://example.com/', 1, 1000, { fetch: vi.fn().mockResolvedValue({}), now: clock([0, 200]), timing: () => ({ ...entry, requestStart: 0 }) as PerformanceResourceTiming });
    expect(hidden.samples[0]!.breakdown).toBeUndefined();
  });

  it('records failures and timeouts without throwing', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const r = await runBrowserProbe('https://example.com/', 2, 5000, { fetch: fetchMock, now: clock([0, 10, 20, 5020]), timing: () => undefined });
    expect(r.successful).toBe(0);
    expect(r.samples[0]!.error).toMatch(/Request failed/);
    expect(r.samples[1]!.error).toMatch(/within 5 s/);
    expect(urlFindings(null, r)[0]!.id).toBe('probe-failed');
  });

  it('aborts a request that exceeds the timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))));
    const p = runBrowserProbe('https://example.com/', 1, 50, { fetch: fetchMock as unknown as typeof fetch, now: () => 0, timing: () => undefined });
    await vi.advanceTimersByTimeAsync(60);
    const r = await p;
    vi.useRealTimers();
    expect(r.samples[0]!.ok).toBe(false);
  });

  it('summarises empty input safely', () => {
    expect(summarizeProbe([])).toMatchObject({ successful: 0, medianMs: undefined });
    expect(urlFindings(null, null)).toEqual([]);
  });
});
