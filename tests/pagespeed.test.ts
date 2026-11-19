import { describe, expect, it, vi } from 'vitest';
import { proxyRequestUrl, runPageSpeed } from '../src/core';

const PSI = { lighthouseResult: { audits: { 'server-response-time': { numericValue: 400 } } } };
const summaryBody = { summary: { serverResponseMs: 321, redirects: [], audits: {}, runWarnings: [], field: null }, cached: true, fetchedAt: '2026-11-19T00:00:00.000Z' };

describe('PageSpeed client', () => {
  it('builds the proxy URL', () => {
    expect(proxyRequestUrl('https://p.example.dev/', 'https://example.com/', 'desktop')).toBe('https://p.example.dev/v1/pagespeed?url=https%3A%2F%2Fexample.com%2F&strategy=desktop');
  });

  it('calls Google directly without a key when no proxy is configured', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(PSI), { status: 200 }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { fetch: f as unknown as typeof fetch });
    expect(r.ok && r.via).toBe('google');
    expect(r.ok && r.summary.serverResponseMs).toBe(400);
    const u = new URL(String((f.mock.calls[0] as unknown[])[0]));
    expect(u.hostname).toBe('www.googleapis.com');
    expect(u.searchParams.has('key')).toBe(false);
  });

  it('uses the proxy summary when a proxy is configured', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(summaryBody), { status: 200 }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: true, via: 'proxy', cached: true });
    expect(r.ok && r.summary.serverResponseMs).toBe(321);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('explains proxy errors, including the wait time for rate limits', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'rate_limited', message: 'x', retryAfterSeconds: 60 } }), { status: 429, headers: { 'Retry-After': '60' } }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('rate_limited');
    expect(r.error.retryAfterSeconds).toBe(60);
    expect(r.error.message).toMatch(/wait 60 seconds/);
  });

  it.each([
    ['quota', 503, 'quota'],
    ['busy', 503, 'busy'],
    ['lighthouse', 422, 'lighthouse'],
    ['invalid_url', 400, 'invalid'],
  ])('maps proxy code %s', async (code, status, kind) => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'm' } }), { status }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch });
    expect(!r.ok && r.error.kind).toBe(kind);
  });

  it('falls back to Google once when the proxy cannot be reached', async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response(JSON.stringify(PSI), { status: 200 }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch });
    expect(r.ok && r.via).toBe('google');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('reports a timeout when aborted, without falling back', async () => {
    const ctrl = new AbortController();
    ctrl.abort(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    const f = vi.fn().mockRejectedValue(Object.assign(new Error('a'), { name: 'AbortError' }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch, signal: ctrl.signal });
    expect(!r.ok && r.error.kind).toBe('timeout');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('rejects an unexpected proxy response instead of showing empty results', async () => {
    const f = vi.fn(async () => new Response('{"hello":1}', { status: 200 }));
    const r = await runPageSpeed('https://example.com/', 'mobile', { proxyUrl: 'https://p.example.dev', fetch: f as unknown as typeof fetch });
    expect(!r.ok && r.error.kind).toBe('unknown');
  });
});
