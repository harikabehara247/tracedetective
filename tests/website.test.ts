import { describe, expect, it } from 'vitest';
import { buildFindings, detectPlatform, parsePsi, safeHttpUrl, safeImageData, STAGE_DESCRIPTIONS, type NetRequest } from '../src/core';
import genericMobile from './fixtures/psi-synthetic-generic-mobile.json';
import genericDesktop from './fixtures/psi-synthetic-generic-desktop.json';
import wpMobile from './fixtures/psi-synthetic-wordpress-mobile.json';

// All fixtures are synthetic: real Lighthouse 13 output for local test pages, with the host renamed.
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const req = (url: string): NetRequest => ({ url, host: new URL(url).host, resourceType: 'Script', startMs: 0, endMs: 1 });

describe('PageSpeed response parsing (Lighthouse 13 fixtures)', () => {
  const psi = parsePsi(genericMobile);

  it('reads the request list, screenshots and the LCP element from the response', () => {
    expect(psi.requests).toHaveLength(5);
    expect(psi.requests!.every((r) => r.url.startsWith('https://demo-site.example/'))).toBe(true);
    expect(psi.screenshot?.data).toMatch(/^data:image\/(jpeg|webp);base64,/);
    expect(psi.filmstrip!.length).toBeGreaterThan(0);
    expect(psi.lcp?.selector).toBe('body > img.hero');
    expect(psi.lcp?.resourceUrl).toBe('https://demo-site.example/static/img/hero.jpg');
    expect(psi.lcp?.resourceEvidence).toBeTruthy();
  });

  it('splits LCP into the four stages PageSpeed reports, adding up to the LCP time', () => {
    const parts = psi.lcp!.subparts!;
    expect(parts.map((p) => p.key)).toEqual(['ttfb', 'loadDelay', 'loadDuration', 'renderDelay']);
    const sum = parts.reduce((s, p) => s + p.ms, 0);
    expect(Math.abs(sum - psi.lcpMs!)).toBeLessThan(1);
  });

  it('reads Chrome real-user data with its collection period when the response has one', () => {
    expect(psi.field?.scope).toBe('url');
    expect(psi.field?.period).toEqual({ first: '2026-10-21', last: '2026-11-17' });
    expect(parsePsi(genericDesktop).field).toBeNull();
  });

  it('returns no screenshot, requests or LCP element when the response has none, and never throws', () => {
    const bare = parsePsi({ lighthouseResult: { finalDisplayedUrl: 'https://example.com/', audits: { 'largest-contentful-paint': { numericValue: 3000 } } } });
    expect(bare.screenshot).toBeUndefined();
    expect(bare.filmstrip).toEqual([]);
    expect(bare.requests).toEqual([]);
    expect(bare.lcp?.selector).toBeUndefined();
    expect(bare.lcp?.resourceUrl).toBeUndefined();
    expect(() => parsePsi({ lighthouseResult: { audits: { 'final-screenshot': { details: { data: 42 } }, 'screenshot-thumbnails': { details: { items: 'x' } } } } })).not.toThrow();
  });

  it('does not tie a file to the LCP element without evidence in the response', () => {
    const body = clone(genericMobile) as { lighthouseResult: { audits: Record<string, unknown> } };
    for (const id of ['image-delivery-insight', 'uses-responsive-images', 'modern-image-formats', 'uses-optimized-images', 'unsized-images', 'prioritize-lcp-image']) delete body.lighthouseResult.audits[id];
    const p = parsePsi(body);
    // The element's src attribute still matches a request, so the link is kept and its basis is stated.
    expect(p.lcp?.resourceUrl).toBe('https://demo-site.example/static/img/hero.jpg');
    expect(p.lcp?.resourceEvidence).toMatch(/src attribute/);
    expect(buildFindings(p, null).map((f) => f.id)).not.toContain('lcp-image');

    // Without any of that evidence, no file is named.
    const text = JSON.stringify(body).split('static/img/hero.jpg').join('static/img/other.jpg');
    const reqs = JSON.parse(text) as typeof body;
    const items = (reqs.lighthouseResult.audits['network-requests'] as { details: { items: { url: string }[] } }).details.items;
    (reqs.lighthouseResult.audits['network-requests'] as { details: { items: { url: string }[] } }).details.items = items.filter((i) => !i.url.endsWith('other.jpg'));
    expect(parsePsi(reqs).lcp?.resourceUrl).toBeUndefined();
  });
});

describe('image and link safety', () => {
  it('keeps only base64 JPEG, PNG or WebP data for images', () => {
    expect(safeImageData('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,AAAA');
    expect(safeImageData('data:image/svg+xml;base64,AAAA')).toBeUndefined();
    expect(safeImageData('javascript:alert(1)')).toBeUndefined();
    expect(safeImageData('https://example.com/x.jpg')).toBeUndefined();
  });

  it('keeps only http(s) links', () => {
    expect(safeHttpUrl('https://developer.chrome.com/docs/x')).toBe('https://developer.chrome.com/docs/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeHttpUrl(undefined)).toBeUndefined();
  });
});

describe('platform detection', () => {
  it('names no platform for a page whose files are not from a known platform location', () => {
    expect(detectPlatform(parsePsi(genericMobile).requests!).detected).toEqual([]);
  });

  it('labels each detected platform with the method and example files', () => {
    const p = detectPlatform(parsePsi(wpMobile).requests!);
    expect(p.detected.map((d) => d.id)).toEqual(['wordpress', 'elementor']);
    expect(p.detected[0]!.method).toMatch(/\/wp-content\//);
    expect(p.detected[0]!.evidence.length).toBeGreaterThan(0);
  });

  it('recognises other platforms only from their own file locations', () => {
    const ids = (urls: string[]) => detectPlatform(urls.map(req)).detected.map((d) => d.id);
    expect(ids(['https://a.example/_next/static/chunks/main.js'])).toEqual(['nextjs']);
    expect(ids(['https://cdn.shopify.com/s/files/1/x.js'])).toEqual(['shopify']);
    expect(ids(['https://a.example/_nuxt/entry.js'])).toEqual(['nuxt']);
    expect(ids(['https://static.wixstatic.com/media/x.jpg'])).toEqual(['wix']);
    // Look-alikes do not count.
    expect(ids(['https://a.example/blog/wp-content-guide', 'https://a.example/next/static/x.js', 'https://notshopify.example/cdn.shopify.com.js'])).toEqual([]);
  });
});

describe('findings', () => {
  const generic = buildFindings(parsePsi(genericMobile), null);

  it('gives every finding a measurement, source, stage, reason, next step and a measured-fact label', () => {
    expect(generic.length).toBeGreaterThan(3);
    for (const f of generic) {
      expect(f.measured.length).toBeGreaterThan(10);
      expect(f.source).toBeTruthy();
      expect(Object.keys(STAGE_DESCRIPTIONS)).toContain(f.stage);
      expect(f.why.length).toBeGreaterThan(10);
      expect(f.nextSteps.length).toBeGreaterThan(0);
      expect(f.statement).toBe('Measured fact');
      expect(f.evidence.label).toBeTruthy();
    }
  });

  it('ranks by severity first', () => {
    const order = { high: 3, medium: 2, low: 1, info: 0 };
    const sev = generic.map((f) => order[f.severity]);
    expect([...sev].sort((a, b) => b - a)).toEqual(sev);
    expect(generic[0]!.severity).toBe('high');
  });

  it('groups findings by the loading stage their measurement belongs to', () => {
    const stage = (id: string) => generic.find((f) => f.id === id)?.stage;
    expect(stage('tbt')).toBe('Main-thread work');
    expect(stage('render-blocking')).toBe('Rendering');
    expect(stage('lcp-image')).toBe('Resource loading');
    expect(stage('field')).toBe('Real-user experience');
  });

  it('is platform-neutral unless a platform is detected or chosen', () => {
    expect(generic.some((f) => f.platformNotes)).toBe(false);
    const text = JSON.stringify(generic);
    expect(text).not.toMatch(/WordPress|Elementor|plugin|theme|PHP/);

    const chosen = buildFindings(parsePsi(genericMobile), null, { platform: 'wordpress' });
    const withNotes = chosen.filter((f) => f.platformNotes);
    expect(withNotes.length).toBeGreaterThan(0);
    expect(withNotes[0]!.platformNotes!.basis).toMatch(/You chose WordPress/);

    const detected = buildFindings(parsePsi(wpMobile), null).filter((f) => f.platformNotes);
    expect(detected[0]!.platformNotes!.basis).toMatch(/^Detected: files under \/wp-content\//);
  });

  it('never names server code or a database as a cause', () => {
    const all = [...generic, ...buildFindings(parsePsi(wpMobile), null)];
    for (const f of all) {
      expect(`${f.title} ${f.measured}`).not.toMatch(/database|query|PHP|plugin/i);
    }
    const server = buildFindings(parsePsi(wpMobile), null).find((f) => f.id === 'slow-server')!;
    expect(server.stage).toBe('Server response');
    expect(server.hypotheses.length + server.nextSteps.length).toBeGreaterThan(0);
  });

  it('reports PageSpeed estimates only as PageSpeed’s own', () => {
    for (const f of generic.filter((x) => x.pageSpeedEstimate)) {
      expect(f.measured + f.title).not.toMatch(/will save|guaranteed/i);
    }
  });

  it('produces no findings without data, and a neutral one when nothing crosses a threshold', () => {
    expect(buildFindings(null, null)).toEqual([]);
    const quiet = buildFindings(parsePsi({ lighthouseResult: { finalDisplayedUrl: 'https://example.com/', audits: { 'largest-contentful-paint': { numericValue: 900 } } } }), null);
    expect(quiet.map((f) => f.id)).toEqual(['none']);
  });
});
