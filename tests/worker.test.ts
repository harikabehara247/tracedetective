// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handle, type Deps, type Env, type RateLimiter } from '../worker/src/handler';

const ORIGIN = 'https://harikabehara247.github.io';
const KEY = 'placeholder-psi-key-for-tests';
const PSI_OK = {
  lighthouseResult: {
    finalDisplayedUrl: 'https://example.com/',
    configSettings: { formFactor: 'mobile' },
    audits: { 'server-response-time': { numericValue: 700 }, 'network-requests': { details: { items: [{ url: 'https://example.com/', resourceType: 'Document', statusCode: 200 }] } } },
  },
};

const limiter = (allow: boolean): RateLimiter & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, limit: async ({ key }) => (calls.push(key), { success: allow }) };
};

function memoryCache() {
  const store = new Map<string, string>();
  return {
    store,
    match: async (r: Request) => (store.has(r.url) ? new Response(store.get(r.url)) : undefined),
    put: async (r: Request, res: Response) => void store.set(r.url, await res.text()),
  };
}

function setup(over: Partial<Env> = {}, upstream: () => Promise<Response> = async () => new Response(JSON.stringify(PSI_OK), { status: 200 })) {
  const fetchMock = vi.fn(upstream);
  const env: Env = { PSI_API_KEY: KEY, ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:4173`, IP_LIMITER: limiter(true), GLOBAL_LIMITER: limiter(true), ...over };
  const cache = memoryCache();
  const deps: Deps = { fetch: fetchMock as unknown as typeof fetch, cache };
  const call = (path: string, init: RequestInit & { origin?: string | null; ip?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.origin !== null) headers.set('Origin', init.origin ?? ORIGIN);
    headers.set('CF-Connecting-IP', init.ip ?? '203.0.113.7');
    return handle(new Request(`https://psi.example.workers.dev${path}`, { method: init.method ?? 'GET', headers }), env, deps);
  };
  return { call, fetchMock, env, cache };
}

const q = (url: string, strategy = 'mobile') => `/v1/pagespeed?${new URLSearchParams({ url, strategy })}`;

describe('PageSpeed proxy', () => {
  it('returns a parsed summary, uses the server-side key, and never returns the key', async () => {
    const { call, fetchMock } = setup();
    const res = await call(q('example.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const text = await res.text();
    expect(text).not.toContain(KEY);
    const body = JSON.parse(text);
    expect(body.summary.serverResponseMs).toBe(700);
    expect(body.cached).toBe(false);
    const upstreamUrl = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(upstreamUrl.hostname).toBe('www.googleapis.com');
    expect(upstreamUrl.searchParams.get('key')).toBe(KEY);
    expect(upstreamUrl.searchParams.get('url')).toBe('https://example.com/');
  });

  it('serves repeat requests from cache without calling Google or the limiters', async () => {
    const { call, fetchMock, env } = setup();
    await call(q('https://example.com/'));
    const again = await call(q('example.com'));
    expect((await again.json()).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((env.IP_LIMITER as ReturnType<typeof limiter>).calls).toHaveLength(1);
  });

  it('caches mobile and desktop separately', async () => {
    const { call, fetchMock } = setup();
    await call(q('example.com', 'mobile'));
    await call(q('example.com', 'desktop'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses requests from other websites and without an Origin', async () => {
    const { call, fetchMock } = setup();
    expect((await call(q('example.com'), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(q('example.com'), { origin: null })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const { call } = setup();
    expect((await call(q('example.com'), { method: 'OPTIONS' })).status).toBe(204);
    expect((await call(q('example.com'), { method: 'OPTIONS', origin: 'https://evil.example' })).status).toBe(403);
    expect((await call(q('example.com'), { method: 'POST' })).status).toBe(405);
  });

  it.each(['http://localhost', 'http://169.254.169.254/latest', 'http://10.0.0.1', 'ftp://example.com', 'https://example.com/?token=abc', ''])('rejects %s without calling Google', async (u) => {
    const { call, fetchMock } = setup();
    const res = await call(q(u));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_url');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown devices, unknown paths and oversized queries', async () => {
    const { call } = setup();
    expect((await call(q('example.com', 'tablet'))).status).toBe(400);
    expect((await call('/v1/other')).status).toBe(404);
    expect((await call(`/v1/pagespeed?url=https://example.com/${'a'.repeat(2400)}`)).status).toBe(414);
  });

  it('rate-limits per client and globally', async () => {
    const perIp = setup({ IP_LIMITER: limiter(false) });
    const r1 = await perIp.call(q('example.com'));
    expect(r1.status).toBe(429);
    expect(r1.headers.get('Retry-After')).toBe('60');
    expect((await r1.json()).error.code).toBe('rate_limited');
    expect(perIp.fetchMock).not.toHaveBeenCalled();
    const global = setup({ GLOBAL_LIMITER: limiter(false) });
    const r2 = await global.call(q('example.com'));
    expect(r2.status).toBe(503);
    expect((await r2.json()).error.code).toBe('busy');
  });

  it('keys the per-client limit on the connecting IP', async () => {
    const { call, env } = setup();
    await call(q('example.com'), { ip: '198.51.100.1' });
    expect((env.IP_LIMITER as ReturnType<typeof limiter>).calls).toEqual(['198.51.100.1']);
  });

  it('maps Google quota, Lighthouse, key and server errors, and scrubs the key from messages', async () => {
    const quota = setup({}, async () => new Response('{"error":{"message":"Quota exceeded"}}', { status: 429 }));
    const r1 = await quota.call(q('example.com'));
    expect(r1.status).toBe(503);
    expect((await r1.json()).error.code).toBe('quota');

    const lh = setup({}, async () => new Response(JSON.stringify({ error: { message: `Lighthouse returned error: FAILED_DOCUMENT_REQUEST for ...&key=${KEY}` } }), { status: 500 }));
    const r2 = await lh.call(q('example.com'));
    const t2 = await r2.text();
    expect(r2.status).toBe(422);
    expect(t2).not.toContain(KEY);
    expect(JSON.parse(t2).error.code).toBe('lighthouse');

    const badKey = setup({}, async () => new Response('{"error":{"message":"API key not valid. Please pass a valid API key."}}', { status: 400 }));
    const rk = await badKey.call(q('example.com'));
    expect(rk.status).toBe(503);
    expect((await rk.json()).error.code).toBe('not_configured');
    const denied = setup({}, async () => new Response('{}', { status: 403 }));
    expect((await (await denied.call(q('example.com'))).json()).error.code).toBe('not_configured');

    const down = setup({}, async () => new Response('oops', { status: 502 }));
    expect((await (await down.call(q('example.com'))).json()).error.code).toBe('upstream');
  });

  it('times out slow upstream calls and reports network failures', async () => {
    const slow = setup({}, () => new Promise<Response>(() => {}));
    const { call } = slow;
    const res = await handle(new Request(`https://w.dev${q('example.com')}`, { headers: { Origin: ORIGIN } }), slow.env, { fetch: ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch, timeoutMs: 20 });
    expect(res.status).toBe(504);
    void call;
    const broken = setup({}, async () => { throw new TypeError('fetch failed'); });
    expect((await broken.call(q('example.com'))).status).toBe(502);
  });

  it('reports when the key is missing, and exposes health without the key', async () => {
    const { call } = setup({ PSI_API_KEY: undefined });
    const res = await call(q('example.com'));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
    const ok = setup();
    const health = await ok.call('/health');
    const text = await health.text();
    expect(JSON.parse(text)).toEqual({ ok: true, keyConfigured: true, originsConfigured: true });
    expect(text).not.toContain(KEY);
  });

  it('does not cache failures', async () => {
    let n = 0;
    const s = setup({}, async () => (n++ === 0 ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(PSI_OK), { status: 200 })));
    expect((await s.call(q('example.com'))).status).toBe(422);
    expect((await s.call(q('example.com'))).status).toBe(200);
    expect(s.cache.store.size).toBe(1);
  });

  it('skips the cache read for fresh=1 but still rate-limits and refreshes the cache', async () => {
    const { call, fetchMock, env, cache } = setup();
    await call(q('example.com'));
    const fresh = await call(`${q('example.com')}&fresh=1`);
    expect((await fresh.json()).cached).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((env.IP_LIMITER as ReturnType<typeof limiter>).calls).toHaveLength(2);
    expect(cache.store.size).toBe(1);
    expect([...cache.store.keys()][0]).toMatch(/\/v2\?/); // cache key carries the summary version
  });
});
