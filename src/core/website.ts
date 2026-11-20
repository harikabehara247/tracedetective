/**
 * Website report model: the extra facts TraceDetective reads from a PageSpeed Insights
 * (Lighthouse) result, platform detection from request URLs, and ranked findings.
 *
 * Rules:
 * - Every value comes from the PageSpeed response, Chrome real-user data, or the optional
 *   browser probe. Nothing is estimated here. Savings estimates are PageSpeed's own and are
 *   shown as such.
 * - Findings state what was measured. Possible causes are listed separately as hypotheses.
 * - An external test cannot see server code, database queries or internal services, and
 *   findings never claim those as causes.
 *
 * Supports Lighthouse 12 (legacy opportunity audits) and Lighthouse 13 (insight audits).
 */
import type { ProbeSummary, PsiSummary } from './url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetRequest {
  url: string;
  host: string;
  resourceType: string;
  mimeType?: string;
  statusCode?: number;
  protocol?: string;
  /** Observed (unthrottled) start and end, ms from navigation start. */
  startMs: number;
  endMs: number;
  transferSize?: number;
  resourceSize?: number;
  priority?: string;
  entity?: string;
}

export interface LcpInfo {
  selector?: string;
  snippet?: string;
  label?: string;
  width?: number;
  height?: number;
  /** The request that loads the LCP element, only when the response ties it to the element. */
  resourceUrl?: string;
  resourceEvidence?: string;
  /** Lab LCP split into subparts, in ms. */
  subparts?: { key: 'ttfb' | 'loadDelay' | 'loadDuration' | 'renderDelay'; label: string; ms: number }[];
  subpartsBasis?: 'simulated' | 'observed';
  checklist?: { key: string; label: string; passed: boolean }[];
}

export interface InsightItem {
  url?: string;
  label?: string;
  totalBytes?: number;
  wastedBytes?: number;
  wastedMs?: number;
  reasons?: string[];
}

export interface PsiInsight {
  id: string;
  title: string;
  score: number | null;
  displayValue?: string;
  /** PageSpeed's own estimate of metric savings (ms, or unitless for CLS). */
  savings: Record<string, number>;
  items: InsightItem[];
  docsUrl?: string;
}

export interface Screenshot {
  data: string;
  timingMs?: number;
}

export interface LabExtras {
  ttfbMs?: number;
  screenshot?: Screenshot;
  filmstrip: Screenshot[];
  viewport?: { width: number; height: number };
  requests: NetRequest[];
  lcp?: LcpInfo;
  insights: PsiInsight[];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const MAX_REQUESTS = 400;
const MAX_ITEMS = 12;
const MAX_FILMSTRIP = 10;
const MAX_IMAGE_CHARS = 600_000;
const IMAGE_DATA = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

/** Only well-formed base64 image data URIs are kept, so nothing else can reach an <img src>. */
export function safeImageData(v: unknown): string | undefined {
  const s = str(v);
  return s.length > 0 && s.length <= MAX_IMAGE_CHARS && IMAGE_DATA.test(s) ? s : undefined;
}

/** Only http(s) URLs are ever rendered as links. */
export function safeHttpUrl(v: unknown): string | undefined {
  const s = str(v);
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/** First https link in an audit description (markdown), e.g. the Chrome docs page. */
function docsLink(description: string): string | undefined {
  const m = /\]\((https:\/\/[^)\s]+)\)/.exec(description);
  return m ? safeHttpUrl(m[1]) : undefined;
}

function nodeOf(v: unknown): { selector?: string; snippet?: string; label?: string; path?: string; width?: number; height?: number } | undefined {
  const n = obj(v);
  if (str(n.type) !== 'node') return undefined;
  const rect = obj(n.boundingRect);
  return {
    selector: str(n.selector) || undefined,
    snippet: str(n.snippet).slice(0, 600) || undefined,
    label: str(n.nodeLabel).slice(0, 200) || undefined,
    path: str(n.path) || undefined,
    width: num(rect.width),
    height: num(rect.height),
  };
}

/** Tables can be nested in a `list`; return every table/opportunity/checklist part. */
function parts(details: Json): Json[] {
  const t = str(details.type);
  if (t === 'list') return arr(details.items).map(obj);
  return [details];
}

const INSIGHT_IDS = [
  // Lighthouse 13 insights
  'document-latency-insight',
  'render-blocking-insight',
  'image-delivery-insight',
  'lcp-discovery-insight',
  'cache-insight',
  'third-parties-insight',
  'font-display-insight',
  'cls-culprits-insight',
  'legacy-javascript-insight',
  'duplicated-javascript-insight',
  'modern-http-insight',
  'dom-size-insight',
  'forced-reflow-insight',
  'network-dependency-tree-insight',
  'viewport-insight',
  // Diagnostics present in both versions
  'unused-javascript',
  'unused-css-rules',
  'unminified-css',
  'unminified-javascript',
  'bootup-time',
  'mainthread-work-breakdown',
  'unsized-images',
  'total-byte-weight',
  'long-tasks',
  // Lighthouse 12 opportunities
  'render-blocking-resources',
  'uses-responsive-images',
  'modern-image-formats',
  'uses-optimized-images',
  'offscreen-images',
  'uses-text-compression',
  'uses-long-cache-ttl',
  'third-party-summary',
  'prioritize-lcp-image',
  'lcp-lazy-loaded',
  'font-display',
  'uses-rel-preconnect',
];

function parseInsight(id: string, a: Json): PsiInsight | null {
  if (Object.keys(a).length === 0) return null;
  const mode = str(a.scoreDisplayMode);
  if (mode === 'notApplicable' || mode === 'error' || mode === 'manual') return null;
  const savings: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(a.metricSavings))) {
    const n = num(v);
    if (n !== undefined && n > 0) savings[k] = n;
  }
  const items: InsightItem[] = [];
  for (const part of parts(obj(a.details))) {
    for (const raw of arr(part.items).map(obj)) {
      if (items.length >= MAX_ITEMS) break;
      const node = nodeOf(raw.node);
      const sub = arr(obj(raw.subItems).items).map(obj);
      const reasons = sub.map((s) => str(s.reason)).filter(Boolean).slice(0, 4);
      const item: InsightItem = {
        url: safeHttpUrl(raw.url),
        label: str(raw.entity) || str(raw.label) || str(raw.groupLabel) || node?.label || node?.selector || undefined,
        totalBytes: num(raw.totalBytes) ?? num(raw.transferSize),
        wastedBytes: num(raw.wastedBytes),
        wastedMs: num(raw.wastedMs) ?? num(raw.total) ?? num(raw.mainThreadTime) ?? num(raw.duration),
        reasons: reasons.length ? reasons : undefined,
      };
      if (item.url || item.label) items.push(item);
    }
  }
  return {
    id,
    title: str(a.title) || id,
    score: typeof a.score === 'number' ? a.score : null,
    displayValue: str(a.displayValue) || undefined,
    savings,
    items,
    docsUrl: docsLink(str(a.description)),
  };
}

const SUBPART_LABELS = {
  ttfb: 'Time to first byte',
  loadDelay: 'Resource load delay',
  loadDuration: 'Resource load duration',
  renderDelay: 'Element render delay',
} as const;

function parseLcp(audits: Json, lcpMs: number | undefined, metrics: Json, requests: NetRequest[], finalUrl: string): LcpInfo | undefined {
  const a = (id: string) => obj(audits[id]);
  const info: LcpInfo = {};
  let path: string | undefined;

  // Element: Lighthouse 12 "largest-contentful-paint-element", Lighthouse 13 insight nodes.
  const candidates = [a('largest-contentful-paint-element'), a('lcp-breakdown-insight'), a('lcp-discovery-insight')];
  for (const c of candidates) {
    for (const part of parts(obj(c.details))) {
      const direct = nodeOf(part);
      const fromTable = arr(part.items).map(obj).map((i) => nodeOf(i.node)).find(Boolean);
      const node = direct ?? fromTable;
      if (node && !info.selector) {
        info.selector = node.selector;
        info.snippet = node.snippet;
        info.label = node.label;
        info.width = node.width;
        info.height = node.height;
        path = node.path;
      }
    }
  }

  // Discovery checklist (Lighthouse 13 and late 12).
  for (const part of parts(obj(a('lcp-discovery-insight').details))) {
    if (str(part.type) !== 'checklist') continue;
    info.checklist = Object.entries(obj(part.items)).map(([key, v]) => ({ key, label: str(obj(v).label), passed: obj(v).value === true }));
  }

  // Subparts. Prefer the simulated split, which adds up to the lab LCP shown in the report.
  const ttfb = num(metrics.timeToFirstByte);
  const loadDelay = num(metrics.lcpLoadDelay);
  const loadDuration = num(metrics.lcpLoadDuration);
  if (lcpMs !== undefined && ttfb !== undefined && loadDelay !== undefined && loadDuration !== undefined) {
    const renderDelay = Math.max(0, lcpMs - ttfb - loadDelay - loadDuration);
    info.subparts = (
      [
        ['ttfb', ttfb],
        ['loadDelay', loadDelay],
        ['loadDuration', loadDuration],
        ['renderDelay', renderDelay],
      ] as const
    ).map(([key, ms]) => ({ key, label: SUBPART_LABELS[key], ms }));
    info.subpartsBasis = 'simulated';
  } else {
    const table = parts(obj(a('lcp-breakdown-insight').details)).find((p) => str(p.type) === 'table');
    const map: Record<string, keyof typeof SUBPART_LABELS> = { timeToFirstByte: 'ttfb', resourceLoadDelay: 'loadDelay', resourceLoadDuration: 'loadDuration', elementRenderDelay: 'renderDelay' };
    const rows = arr(table?.items)
      .map(obj)
      .map((r) => ({ key: map[str(r.subpart)], ms: num(r.duration) }))
      .filter((r): r is { key: keyof typeof SUBPART_LABELS; ms: number } => !!r.key && r.ms !== undefined);
    if (rows.length) {
      info.subparts = rows.map((r) => ({ ...r, label: SUBPART_LABELS[r.key] }));
      info.subpartsBasis = 'observed';
    }
  }

  // Resource: tie the element to a request only with evidence from the response.
  if (path) {
    for (const id of ['image-delivery-insight', 'uses-responsive-images', 'modern-image-formats', 'uses-optimized-images', 'unsized-images']) {
      for (const part of parts(obj(a(id).details))) {
        const hit = arr(part.items).map(obj).find((i) => nodeOf(i.node)?.path === path && safeHttpUrl(i.url));
        if (hit && !info.resourceUrl) {
          info.resourceUrl = safeHttpUrl(hit.url);
          info.resourceEvidence = `PageSpeed’s “${str(a(id).title) || id}” audit lists this request for the LCP element.`;
        }
      }
    }
  }
  if (!info.resourceUrl) {
    const initiator = arr(obj(obj(a('prioritize-lcp-image').details).debugData).initiatorPath).map(obj)[0];
    const u = initiator ? safeHttpUrl(initiator.url) : undefined;
    if (u && requests.some((r) => r.url === u)) {
      info.resourceUrl = u;
      info.resourceEvidence = 'PageSpeed’s “Preload Largest Contentful Paint image” audit names this request.';
    }
  }
  if (!info.resourceUrl && info.snippet) {
    const src = /<img\b[^>]*\ssrc="([^"]+)"/i.exec(info.snippet)?.[1];
    if (src && !src.startsWith('data:')) {
      try {
        const abs = new URL(src.replace(/&amp;/g, '&'), finalUrl || undefined).href;
        if (requests.some((r) => r.url === abs)) {
          info.resourceUrl = abs;
          info.resourceEvidence = 'The LCP element’s src attribute matches this request in the network log.';
        }
      } catch {
        /* relative URL without a base: leave unknown */
      }
    }
  }

  return Object.keys(info).length ? info : undefined;
}

/** Facts beyond the core metrics. Never throws; missing parts are left out. */
export function parseLabExtras(lh: Json, finalUrl: string, lcpMs: number | undefined): LabExtras {
  const audits = obj(lh.audits);
  const a = (id: string) => obj(audits[id]);
  const metrics = obj(arr(obj(a('metrics').details).items)[0]);

  const requests: NetRequest[] = [];
  for (const r of arr(obj(a('network-requests').details).items).map(obj)) {
    if (requests.length >= MAX_REQUESTS) break;
    const url = safeHttpUrl(r.url);
    const start = num(r.networkRequestTime) ?? num(r.startTime);
    const end = num(r.networkEndTime) ?? num(r.endTime);
    if (!url || start === undefined || end === undefined) continue;
    requests.push({
      url,
      host: hostOf(url),
      resourceType: str(r.resourceType) || 'Other',
      mimeType: str(r.mimeType) || undefined,
      statusCode: num(r.statusCode),
      protocol: str(r.protocol) || undefined,
      startMs: start,
      endMs: Math.max(end, start),
      transferSize: num(r.transferSize),
      resourceSize: num(r.resourceSize),
      priority: str(r.priority) || undefined,
      entity: str(r.entity) || undefined,
    });
  }

  const shot = safeImageData(obj(a('final-screenshot').details).data);
  const filmstrip = arr(obj(a('screenshot-thumbnails').details).items)
    .map(obj)
    .flatMap((i): Screenshot[] => {
      const data = safeImageData(i.data);
      return data ? [{ data, timingMs: num(i.timing) }] : [];
    })
    .slice(0, MAX_FILMSTRIP);
  const emu = obj(obj(lh.configSettings).screenEmulation);
  const vw = num(emu.width);
  const vh = num(emu.height);

  const insights = INSIGHT_IDS.map((id) => parseInsight(id, a(id))).filter((i): i is PsiInsight => i !== null);

  return {
    ttfbMs: num(metrics.timeToFirstByte),
    screenshot: shot ? { data: shot, timingMs: num(obj(a('final-screenshot').details).timing) } : undefined,
    filmstrip,
    viewport: vw && vh ? { width: vw, height: vh } : undefined,
    requests,
    lcp: parseLcp(audits, lcpMs, metrics, requests, finalUrl),
    insights,
  };
}

// ---------------------------------------------------------------------------
// Platform detection from request URLs only
// ---------------------------------------------------------------------------

export type PlatformId = 'wordpress' | 'elementor' | 'shopify' | 'nextjs' | 'nuxt' | 'drupal' | 'squarespace' | 'wix' | 'webflow';

export interface DetectedPlatform {
  id: PlatformId;
  name: string;
  /** How it was detected, in words a visitor can check. */
  method: string;
  /** Up to three request URLs that matched. */
  evidence: string[];
}

export interface Platform {
  /** Platforms whose files appear in the request list. Empty when nothing matched. */
  detected: DetectedPlatform[];
  /** WordPress plugin and theme folder names seen in request paths. */
  plugins: string[];
  themes: string[];
}

interface Signature {
  id: PlatformId;
  name: string;
  method: string;
  test: (u: URL) => boolean;
}

/**
 * Conservative signatures: each one is a file location that the platform itself serves
 * from. A match says the page loads that platform's files; it is not a fingerprint of the
 * whole site, and no match does not mean anything.
 */
const SIGNATURES: Signature[] = [
  { id: 'wordpress', name: 'WordPress', method: 'Files under /wp-content/, /wp-includes/ or /wp-json/ in the request list', test: (u) => /\/wp-(content|includes|json)\//.test(u.pathname) },
  {
    id: 'elementor',
    name: 'Elementor',
    method: 'Files under /wp-content/plugins/elementor/ or /wp-content/uploads/elementor/ in the request list',
    test: (u) => /\/wp-content\/(plugins\/elementor(-pro)?|uploads\/elementor)\//i.test(u.pathname),
  },
  { id: 'shopify', name: 'Shopify', method: 'Files from cdn.shopify.com or under /cdn/shop/ in the request list', test: (u) => u.hostname === 'cdn.shopify.com' || u.pathname.startsWith('/cdn/shop/') },
  { id: 'nextjs', name: 'Next.js', method: 'Files under /_next/static/ in the request list', test: (u) => u.pathname.includes('/_next/static/') },
  { id: 'nuxt', name: 'Nuxt', method: 'Files under /_nuxt/ in the request list', test: (u) => u.pathname.includes('/_nuxt/') },
  { id: 'drupal', name: 'Drupal', method: 'Files under /core/misc/drupal or /sites/default/files/ in the request list', test: (u) => /\/core\/misc\/drupal|\/sites\/default\/files\//.test(u.pathname) },
  { id: 'squarespace', name: 'Squarespace', method: 'Files from static1.squarespace.com or assets.squarespace.com in the request list', test: (u) => /^(static1|assets)\.squarespace\.com$/.test(u.hostname) },
  { id: 'wix', name: 'Wix', method: 'Files from static.parastorage.com or static.wixstatic.com in the request list', test: (u) => /^static\.(parastorage|wixstatic)\.com$/.test(u.hostname) },
  { id: 'webflow', name: 'Webflow', method: 'Files from a website-files.com host in the request list', test: (u) => /(^|\.)website-files\.com$/.test(u.hostname) },
];

export function detectPlatform(requests: NetRequest[]): Platform {
  const hits = new Map<PlatformId, string[]>();
  const plugins = new Set<string>();
  const themes = new Set<string>();
  for (const r of requests) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    for (const sig of SIGNATURES) {
      if (sig.test(u)) hits.set(sig.id, [...(hits.get(sig.id) ?? []), r.url]);
    }
    const plugin = /\/wp-content\/plugins\/([a-z0-9._-]+)\//i.exec(u.pathname)?.[1];
    const theme = /\/wp-content\/themes\/([a-z0-9._-]+)\//i.exec(u.pathname)?.[1];
    if (plugin) plugins.add(plugin.toLowerCase());
    if (theme) themes.add(theme.toLowerCase());
  }
  const detected = SIGNATURES.filter((sig) => hits.has(sig.id)).map((sig) => ({ id: sig.id, name: sig.name, method: sig.method, evidence: hits.get(sig.id)!.slice(0, 3) }));
  return { detected, plugins: [...plugins].sort(), themes: [...themes].sort() };
}

export const isDetected = (p: Platform, id: PlatformId) => p.detected.some((d) => d.id === id);

/** Platforms the visitor can choose for platform-specific notes. Only these have notes. */
export const SELECTABLE_PLATFORMS = [{ id: 'wordpress', name: 'WordPress' }] as const;
export type SelectablePlatform = (typeof SELECTABLE_PLATFORMS)[number]['id'];

/** The WordPress plugin or theme folder a request is served from, if any. */
export function wpOrigin(url: string): string | undefined {
  try {
    const path = new URL(url).pathname;
    const plugin = /\/wp-content\/plugins\/([a-z0-9._-]+)\//i.exec(path)?.[1];
    if (plugin) return `plugin folder “${plugin}”`;
    const theme = /\/wp-content\/themes\/([a-z0-9._-]+)\//i.exec(path)?.[1];
    if (theme) return `theme folder “${theme}”`;
    if (/\/wp-includes\//.test(path)) return 'WordPress core (wp-includes)';
    if (/\/wp-content\/uploads\//.test(path)) return 'Media Library (wp-content/uploads)';
  } catch {
    /* ignore */
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** The part of the page load a finding is about. */
export type FindingStage = 'Server response' | 'Resource loading' | 'Rendering' | 'Main-thread work' | 'Layout stability' | 'Whole page' | 'Real-user experience' | 'Your network';

export const STAGE_DESCRIPTIONS: Record<FindingStage, string> = {
  'Server response': 'Redirects and the time until the first byte of the HTML arrives.',
  'Resource loading': 'Finding and downloading images, CSS, scripts and fonts.',
  Rendering: 'Work the browser must finish before it can draw content.',
  'Main-thread work': 'JavaScript and other work that keeps the page from responding.',
  'Layout stability': 'Content moving after it first appears.',
  'Whole page': 'Measurements of the page load as a whole.',
  'Real-user experience': 'What real Chrome users experienced over 28 days.',
  'Your network': 'Timings measured from your own browser.',
};

export type FindingSource = 'Lighthouse lab test' | 'Chrome real-user data' | 'Requests observed by Lighthouse' | 'Browser probe';

export interface WebsiteFinding {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  title: string;
  /** What was measured, in one or two sentences. */
  measured: string;
  source: FindingSource;
  /** The audits or data the statement rests on. */
  evidence: { label: string; auditId?: string; docsUrl?: string; details: string[] };
  why: string;
  nextSteps: string[];
  /** Every finding's statement is measured. Possible causes are hypotheses and listed separately. */
  statement: 'Measured fact';
  hypotheses: string[];
  /** The loading stage the measurement belongs to. */
  stage: FindingStage;
  /** Only when the platform is detected from request URLs or chosen by the visitor. */
  platformNotes?: { platform: string; basis: string; notes: string[] };
  /** PageSpeed's own estimate, used for ranking and shown as PageSpeed's. */
  pageSpeedEstimate?: string;
  rankScore: number;
}

export interface FindingOptions {
  /** A platform the visitor chose for platform-specific notes. */
  platform?: SelectablePlatform;
}

const STAGE_BY_ID: Record<string, FindingStage> = {
  'http-error': 'Server response',
  redirects: 'Server response',
  'slow-server': 'Server response',
  lcp: 'Whole page',
  'lcp-image': 'Resource loading',
  'lcp-discovery': 'Resource loading',
  'render-blocking': 'Rendering',
  images: 'Resource loading',
  tbt: 'Main-thread work',
  cls: 'Layout stability',
  cache: 'Resource loading',
  'unused-css-rules': 'Resource loading',
  'unused-javascript': 'Resource loading',
  weight: 'Resource loading',
  field: 'Real-user experience',
  'probe-failed': 'Your network',
  'cold-connection': 'Your network',
  none: 'Whole page',
};

export const FINDING_THRESHOLDS = { serverResponseMs: 600, lcpMs: 2500, cls: 0.1, tbtMs: 200, pageBytes: 1600 * 1024, fcpMs: 1800 } as const;

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)} s` : `${Math.round(ms)} ms`);
export const fmtBytes = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(2)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${Math.round(b)} B`);

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1, info: 0 } as const;

function fileName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.host;
  } catch {
    return url;
  }
}

function savingsMs(i: PsiInsight | undefined): number {
  if (!i) return 0;
  return Math.max(0, i.savings.LCP ?? 0, i.savings.FCP ?? 0, i.savings.TBT ?? 0, i.savings.INP ?? 0);
}

function failing(i: PsiInsight | undefined): i is PsiInsight {
  return !!i && i.score !== null && i.score < 0.9 && i.items.length > 0;
}

export function buildFindings(psi: PsiSummary | null, probe: ProbeSummary | null, options: FindingOptions = {}): WebsiteFinding[] {
  const out: Draft[] = [];
  const platform = psi ? detectPlatform(psi.requests ?? []) : null;
  const wpBasis = platform && isDetected(platform, 'wordpress') ? `Detected: ${SIGNATURES[0]!.method.toLowerCase()}.` : 'You chose WordPress for this check; it was not detected in the request list.';
  if (psi) out.push(...labFindings(psi, options));
  if (probe) out.push(...probeFindings(probe));
  if (psi && out.length === 0) {
    out.push({
      id: 'none',
      severity: 'info',
      source: 'Lighthouse lab test',
      title: 'Nothing crossed the reporting thresholds',
      measured: 'Every lab metric and PageSpeed check that TraceDetective reports is within its threshold for this test.',
      evidence: { label: 'Lighthouse performance metrics', details: [] },
      why: 'One test is one sample. Results vary between runs and over the day.',
      nextSteps: ['Run the test again later, and on the other device type, before drawing conclusions.'],
      hypotheses: [],
    });
  }
  return out
    .map(({ rankScoreHint, wordpress, ...f }) => ({
      ...f,
      stage: STAGE_BY_ID[f.id] ?? 'Whole page',
      statement: 'Measured fact' as const,
      rankScore: SEVERITY_WEIGHT[f.severity] * 100_000 + Math.min(99_999, rankScoreHint ?? 0),
      ...(wordpress?.length ? { platformNotes: { platform: 'WordPress', basis: wpBasis, notes: wordpress } } : {}),
    }))
    .sort((x, y) => y.rankScore - x.rankScore);
}

type Draft = Omit<WebsiteFinding, 'rankScore' | 'statement' | 'stage' | 'platformNotes'> & { rankScoreHint?: number; wordpress?: string[] };

function labFindings(psi: PsiSummary, options: FindingOptions): Draft[] {
  const out: Draft[] = [];
  const insights = new Map((psi.insights ?? []).map((i) => [i.id, i]));
  const ins = (...ids: string[]) => ids.map((id) => insights.get(id)).find(Boolean);
  const requests = psi.requests ?? [];
  const platform = detectPlatform(requests);
  const wp = isDetected(platform, 'wordpress') || options.platform === 'wordpress';
  const el = isDetected(platform, 'elementor');
  const lcp = psi.lcp;
  const lcpResource = lcp?.resourceUrl ? requests.find((r) => r.url === lcp.resourceUrl) : undefined;

  // 1. HTTP error on the main document.
  const status = psi.mainDocument?.statusCode;
  if (status !== undefined && status >= 400) {
    out.push({
      id: 'http-error',
      severity: 'high',
      source: 'Lighthouse lab test',
      title: `The page returned HTTP ${status}`,
      measured: `Google’s test browser received status ${status} for the main document.`,
      evidence: { label: 'Network requests', auditId: 'network-requests', details: [`${psi.mainDocument?.url ?? psi.finalUrl}: HTTP ${status}`] },
      why: 'Visitors and search engines may see an error page instead of your content, and the other results describe that error page.',
      nextSteps: ['Open the address yourself and compare.', 'Check the server or CDN logs for this time. Some firewalls block Google’s test browser.'],
      hypotheses: ['A firewall, bot-protection or CDN rule may treat the test browser differently from normal visitors.'],
      rankScoreHint: 99_999,
    });
  }

  // 2. Redirects.
  const redirectCount = Math.max(psi.redirects.length - 1, 0);
  const redirectMs = psi.redirects.reduce((s, r) => s + r.wastedMs, 0);
  if (redirectCount > 0 && redirectMs > 0) {
    out.push({
      id: 'redirects',
      severity: redirectMs >= 600 ? 'medium' : 'low',
      source: 'Lighthouse lab test',
      title: `${redirectCount} redirect${redirectCount > 1 ? 's' : ''} before the page starts loading`,
      measured: `The address you entered redirected ${redirectCount === 1 ? 'once' : `${redirectCount} times`} before reaching ${psi.finalUrl}. Lighthouse attributes ${fmtMs(redirectMs)} to redirects.`,
      evidence: { label: 'Avoid multiple page redirects', auditId: 'redirects', details: psi.redirects.map((r) => `${r.url}${r.wastedMs ? ` (+${fmtMs(r.wastedMs)})` : ''}`) },
      why: 'Every redirect is a full round trip before the browser can start downloading the page.',
      nextSteps: ['Use the final address (https, www or not, trailing slash) everywhere you link to this page: menus, sitemaps, ads and social profiles.'],
      wordpress: wp ? ['Check that Settings → General → WordPress Address and Site Address both use the final https address.'] : undefined,
      hypotheses: [],
      rankScoreHint: redirectMs,
    });
  }

  // 3. Slow server response.
  if (psi.serverResponseMs !== undefined && psi.serverResponseMs > FINDING_THRESHOLDS.serverResponseMs) {
    const doc = ins('document-latency-insight');
    out.push({
      id: 'slow-server',
      severity: psi.serverResponseMs > 1800 ? 'high' : 'medium',
      source: 'Lighthouse lab test',
      title: `Server took ${fmtMs(psi.serverResponseMs)} to start sending the page`,
      measured: `The main document’s server response time was ${fmtMs(psi.serverResponseMs)} in Google’s test (the audit flags anything over ${FINDING_THRESHOLDS.serverResponseMs} ms).`,
      evidence: { label: 'Reduce initial server response time', auditId: 'server-response-time', docsUrl: doc?.docsUrl, details: [`Main document: ${psi.mainDocument?.url ?? psi.finalUrl}`, 'Measured from Google’s data centre, not from your visitors’ locations.'] },
      why: 'Nothing on the page can start until the HTML arrives, so this delay adds to every other metric.',
      nextSteps: [
        'Test again: if the second run is much faster, the first may have missed a cache.',
        'Check whether this page is served from a full-page cache (your host’s or framework’s cache, or a CDN).',
        'To find slow code or queries, profile this request on the server (your host’s slow log or an APM tool). This report cannot see inside the server.',
      ],
      wordpress: wp ? ['Pages that are cached by WordPress page caching or the host usually respond much faster than this. Logged-out visitors should get the cached page.', 'If the page cannot be cached (cart, account pages), the time is spent generating it on the server; an external test cannot tell which plugin, theme or query takes the time.'] : undefined,
      hypotheses: ['The page may not have been served from a cache.', 'The server may be doing slow work (application code or database queries) for this page. This cannot be confirmed from outside.'],
      rankScoreHint: psi.serverResponseMs,
    });
  }

  // 4. Slow LCP, with the element and the dominant subpart.
  if (psi.lcpMs !== undefined && psi.lcpMs > FINDING_THRESHOLDS.lcpMs) {
    const details: string[] = [`Lab LCP ${fmtMs(psi.lcpMs)} (${psi.formFactor || 'test'} profile). Good is 2.5 s or less.`];
    if (lcp?.label || lcp?.selector) details.push(`LCP element: ${lcp.label ? `“${lcp.label}” ` : ''}${lcp.selector ? `(${lcp.selector})` : ''}`.trim());
    if (lcp?.resourceUrl) details.push(`LCP resource: ${lcp.resourceUrl}${lcpResource?.transferSize ? ` (${fmtBytes(lcpResource.transferSize)})` : ''}`);
    const top = lcp?.subparts?.slice().sort((x, y) => y.ms - x.ms)[0];
    if (lcp?.subparts) details.push(`Breakdown${lcp.subpartsBasis === 'simulated' ? ' (lab estimate)' : ' (observed)'}: ${lcp.subparts.map((s) => `${s.label} ${fmtMs(s.ms)}`).join(', ')}`);
    const steps: string[] = [];
    const hyps: string[] = [];
    if (top?.key === 'ttfb') steps.push('Most of the time is before the HTML arrives. Start with the server response time finding.');
    if (top?.key === 'loadDelay') steps.push('Most of the time passes before the browser starts loading the LCP resource. Make it discoverable in the HTML, give it fetchpriority="high", and do not lazy-load it.');
    if (top?.key === 'loadDuration') steps.push('Most of the time is spent downloading the LCP resource. Make it smaller: correct dimensions, modern format (WebP or AVIF), compression.');
    if (top?.key === 'renderDelay') steps.push('The resource is ready but the element is drawn late. Look at render-blocking CSS and JavaScript and long main-thread tasks.');
    if (!lcp?.selector) {
      steps.push('PageSpeed did not identify the LCP element in this response. Open the full PageSpeed report and look at “LCP breakdown”.');
      hyps.push('The cause cannot be identified from this response alone.');
    }
    out.push({
      id: 'lcp',
      severity: psi.lcpMs > 4000 ? 'high' : 'medium',
      source: 'Lighthouse lab test',
      title: `Main content appears after ${fmtMs(psi.lcpMs)} (Largest Contentful Paint)`,
      measured: `In the lab test the largest visible element finished rendering at ${fmtMs(psi.lcpMs)}.${top ? ` The largest part was “${top.label.toLowerCase()}” (${fmtMs(top.ms)}).` : ''}`,
      evidence: { label: 'Largest Contentful Paint and LCP breakdown', auditId: 'largest-contentful-paint', docsUrl: ins('lcp-discovery-insight')?.docsUrl, details },
      why: 'LCP is when visitors see the main content. It is a Core Web Vital used by Google Search.',
      nextSteps: steps.length ? steps : ['See the LCP section of this report for the element and its timing.'],
      hypotheses: hyps,
      rankScoreHint: psi.lcpMs,
    });
  }

  // 5. LCP image size and format.
  const imageInsight = ins('image-delivery-insight', 'uses-responsive-images', 'modern-image-formats', 'uses-optimized-images');
  const lcpImageItem = lcp?.resourceUrl ? (psi.insights ?? []).flatMap((i) => (['image-delivery-insight', 'uses-responsive-images', 'modern-image-formats', 'uses-optimized-images'].includes(i.id) ? i.items.map((it) => ({ i, it })) : [])).find((x) => x.it.url === lcp.resourceUrl) : undefined;
  if (lcpImageItem && (lcpImageItem.it.wastedBytes ?? 0) > 50 * 1024) {
    const it = lcpImageItem.it;
    const displayed = lcp?.width && lcp?.height ? `${Math.round(lcp.width)}×${Math.round(lcp.height)} CSS px` : undefined;
    out.push({
      id: 'lcp-image',
      severity: (it.wastedBytes ?? 0) > 500 * 1024 ? 'high' : 'medium',
      source: 'Lighthouse lab test',
      title: `The main image (${fileName(lcp!.resourceUrl!)}) is larger than needed`,
      measured: `The LCP image is ${it.totalBytes ? fmtBytes(it.totalBytes) : 'large'}${displayed ? ` and is displayed at ${displayed}` : ''}. PageSpeed estimates ${fmtBytes(it.wastedBytes!)} could be saved.`,
      evidence: { label: lcpImageItem.i.title, auditId: lcpImageItem.i.id, docsUrl: lcpImageItem.i.docsUrl, details: [lcp!.resourceUrl!, ...(it.reasons ?? [])] },
      why: 'A smaller main image downloads sooner, which brings LCP forward, especially on mobile connections.',
      nextSteps: ['Export the image at about the displayed size (2× for high-density screens is enough).', 'Use WebP or AVIF, or stronger compression.', 'Serve responsive sizes with srcset so phones get a smaller file.'],
      wordpress: wp
        ? [
            'In the Media Library, open this image and compare its full dimensions with the displayed size above.',
            'WordPress creates smaller copies of uploads and adds srcset to images inserted from the Media Library. Check that the page uses one of those sizes rather than “Full Size”.',
            ...(el ? ['Elementor was detected: in the Image widget (or the section’s background settings), check which image size is selected for this element.'] : []),
          ]
        : undefined,
      hypotheses: [],
      pageSpeedEstimate: lcpImageItem.i.displayValue,
      rankScoreHint: savingsMs(lcpImageItem.i) || (it.wastedBytes ?? 0) / 1024,
    });
  }

  // 6. LCP discovery checklist.
  const failed = lcp?.checklist?.filter((c) => !c.passed) ?? [];
  if (failed.length && psi.lcpMs !== undefined && psi.lcpMs > FINDING_THRESHOLDS.lcpMs) {
    const lazy = failed.some((c) => c.key === 'eagerlyLoaded');
    const priority = failed.some((c) => c.key === 'priorityHinted');
    const hidden = failed.some((c) => c.key === 'requestDiscoverable');
    out.push({
      id: 'lcp-discovery',
      severity: lazy || hidden ? 'medium' : 'low',
      source: 'Lighthouse lab test',
      title: 'The browser is not told the main image is important',
      measured: `PageSpeed’s LCP request discovery checks did not pass: ${failed.map((c) => c.label).join('; ')}.`,
      evidence: { label: 'LCP request discovery', auditId: 'lcp-discovery-insight', docsUrl: ins('lcp-discovery-insight')?.docsUrl, details: lcp!.checklist!.map((c) => `${c.passed ? 'Passed' : 'Not passed'}: ${c.label}`) },
      why: 'When the browser finds the main image late or gives it low priority, it waits behind less important downloads.',
      nextSteps: [
        ...(priority ? ['Add fetchpriority="high" to the main image.'] : []),
        ...(lazy ? ['Remove loading="lazy" from the main image. Lazy loading is for images further down the page.'] : []),
        ...(hidden ? ['Put the image in the HTML as an <img>, not as a CSS background or one added by JavaScript, or preload it.'] : []),
      ],
      wordpress: wp
        ? [
            'WordPress adds fetchpriority="high" to the image it expects to be the main one and skips lazy loading for it, but themes, page builders and optimisation plugins can change that. Check the hero image’s HTML in the page source.',
            ...(el ? ['Elementor was detected: if the hero is a section background image, the browser only finds it after the CSS loads.'] : []),
          ]
        : undefined,
      hypotheses: [],
      rankScoreHint: savingsMs(ins('lcp-discovery-insight')) || 1,
    });
  }

  // 7. Render-blocking requests.
  const rb = ins('render-blocking-insight', 'render-blocking-resources');
  if (failing(rb)) {
    const details = rb.items.map((i) => `${i.url ?? i.label}${i.totalBytes ? ` (${fmtBytes(i.totalBytes)})` : ''}${wp && i.url && wpOrigin(i.url) ? ` — from the ${wpOrigin(i.url)}` : ''}`);
    out.push({
      id: 'render-blocking',
      severity: savingsMs(rb) >= 1000 ? 'medium' : 'low',
      source: 'Lighthouse lab test',
      title: `${rb.items.length} file${rb.items.length === 1 ? '' : 's'} must load before anything is shown`,
      measured: `PageSpeed lists ${rb.items.length} render-blocking CSS or JavaScript request${rb.items.length === 1 ? '' : 's'}.`,
      evidence: { label: rb.title, auditId: rb.id, docsUrl: rb.docsUrl, details },
      why: 'The browser does not draw the page until these files have downloaded and run.',
      nextSteps: ['For each file, check whether this page needs it. Defer scripts that are not needed for the first view.', 'Keep critical CSS small; load the rest without blocking.'],
      wordpress: wp
        ? ['The list shows which plugin or theme folder each file is served from. That tells you where the file comes from, not that the plugin is at fault. Check in the plugin’s settings whether its assets can be limited to pages that use it.']
        : undefined,
      hypotheses: [],
      pageSpeedEstimate: rb.displayValue,
      rankScoreHint: savingsMs(rb),
    });
  }

  // 8. Other images.
  if (failing(imageInsight)) {
    const others = imageInsight.items.filter((i) => i.url !== lcp?.resourceUrl);
    const wasted = others.reduce((s, i) => s + (i.wastedBytes ?? 0), 0);
    if (others.length && wasted > 100 * 1024) {
      out.push({
        id: 'images',
        severity: 'low',
        source: 'Lighthouse lab test',
        title: `${others.length} other image${others.length === 1 ? '' : 's'} could be smaller`,
        measured: `PageSpeed estimates ${fmtBytes(wasted)} could be saved across ${others.length} image${others.length === 1 ? '' : 's'} by resizing or using modern formats.`,
        evidence: { label: imageInsight.title, auditId: imageInsight.id, docsUrl: imageInsight.docsUrl, details: others.map((i) => `${i.url ?? i.label}${i.wastedBytes ? ` (save ${fmtBytes(i.wastedBytes)})` : ''}`) },
        why: 'Smaller images use less data and leave bandwidth for what matters first.',
        nextSteps: ['Resize to the displayed size and convert to WebP or AVIF.', 'Lazy-load images below the first screen.'],
        wordpress: wp ? ['Images under wp-content/uploads come from the Media Library; replacing the uploaded file or choosing a smaller size fixes them at the source.'] : undefined,
        hypotheses: [],
        pageSpeedEstimate: imageInsight.displayValue,
        rankScoreHint: savingsMs(imageInsight),
      });
    }
  }

  // 9. Main-thread blocking.
  if (psi.tbtMs !== undefined && psi.tbtMs > FINDING_THRESHOLDS.tbtMs) {
    const boot = ins('bootup-time');
    const third = ins('third-parties-insight', 'third-party-summary');
    const details = [`Total Blocking Time ${fmtMs(psi.tbtMs)} (good is 200 ms or less).`];
    for (const i of boot?.items.slice(0, 5) ?? []) details.push(`${i.url ?? i.label}: ${i.wastedMs !== undefined ? fmtMs(i.wastedMs) : '?'} CPU time${wp && i.url && wpOrigin(i.url) ? ` — from the ${wpOrigin(i.url)}` : ''}`);
    for (const i of third?.items.slice(0, 3) ?? []) if (i.label) details.push(`Third party ${i.label}${i.wastedMs !== undefined ? `: ${fmtMs(i.wastedMs)} main-thread time` : ''}`);
    out.push({
      id: 'tbt',
      severity: psi.tbtMs > 600 ? 'high' : 'medium',
      source: 'Lighthouse lab test',
      title: `JavaScript kept the page busy for ${fmtMs(psi.tbtMs)}`,
      measured: `Total Blocking Time was ${fmtMs(psi.tbtMs)} in the lab test.`,
      evidence: { label: 'Total Blocking Time and JavaScript execution time', auditId: 'total-blocking-time', docsUrl: boot?.docsUrl, details },
      why: 'While the main thread is busy, taps and clicks wait. TBT in the lab is the closest stand-in for real-user INP.',
      nextSteps: ['Start with the scripts that use the most CPU time in the list.', 'Remove or delay scripts the first view does not need, such as chat widgets, trackers and sliders.'],
      wordpress: wp ? ['Where a script is served from a plugin folder, check whether that plugin is needed on this page.'] : undefined,
      hypotheses: [],
      rankScoreHint: psi.tbtMs,
    });
  }

  // 10. Layout shifts.
  if (psi.cls !== undefined && psi.cls > FINDING_THRESHOLDS.cls) {
    const culprits = ins('cls-culprits-insight');
    const unsized = ins('unsized-images');
    out.push({
      id: 'cls',
      severity: psi.cls > 0.25 ? 'high' : 'medium',
      source: 'Lighthouse lab test',
      title: `Content moves while the page loads (CLS ${psi.cls.toFixed(2)})`,
      measured: `Cumulative Layout Shift was ${psi.cls.toFixed(3)} in the lab test (good is 0.1 or less).`,
      evidence: {
        label: 'Cumulative Layout Shift',
        auditId: 'cumulative-layout-shift',
        docsUrl: culprits?.docsUrl,
        details: [...(culprits?.items.map((i) => i.label ?? i.url ?? '') ?? []), ...(unsized?.items.map((i) => `Image without width and height: ${i.url ?? i.label}`) ?? [])].filter(Boolean),
      },
      why: 'Moving content makes people tap the wrong thing. CLS is a Core Web Vital.',
      nextSteps: ['Give images, videos, ads and embeds explicit width and height (or aspect-ratio).', 'Reserve space for banners and content inserted after load.'],
      hypotheses: culprits?.items.length || unsized?.items.length ? [] : ['PageSpeed did not name the shifting elements in this response. The full report’s “Layout shift culprits” may show more.'],
      rankScoreHint: psi.cls * 10_000,
    });
  }

  // 11. Caching of static files.
  const cache = ins('cache-insight', 'uses-long-cache-ttl');
  if (failing(cache)) {
    out.push({
      id: 'cache',
      severity: 'low',
      source: 'Lighthouse lab test',
      title: `${cache.items.length} file${cache.items.length === 1 ? '' : 's'} with a short or missing cache lifetime`,
      measured: `PageSpeed found static files that browsers are told to keep for a short time or not at all.`,
      evidence: { label: cache.title, auditId: cache.id, docsUrl: cache.docsUrl, details: cache.items.map((i) => `${i.url ?? i.label}${i.totalBytes ? ` (${fmtBytes(i.totalBytes)})` : ''}`) },
      why: 'Repeat visitors download these files again instead of reusing them.',
      nextSteps: ['Set a long Cache-Control max-age for versioned static files (images, CSS, JS, fonts) on the server or CDN.'],
      wordpress: wp ? ['Cache lifetimes for files in wp-content are set by the web server, host or CDN, not by WordPress itself.'] : undefined,
      hypotheses: [],
      pageSpeedEstimate: cache.displayValue,
      rankScoreHint: savingsMs(cache),
    });
  }

  // 12. Unused CSS and JavaScript.
  for (const id of ['unused-css-rules', 'unused-javascript'] as const) {
    const u = insights.get(id);
    if (!failing(u)) continue;
    const kind = id === 'unused-css-rules' ? 'CSS' : 'JavaScript';
    out.push({
      id,
      severity: 'low',
      source: 'Lighthouse lab test',
      title: `Unused ${kind} is downloaded`,
      measured: `PageSpeed found ${kind} that this page loads but does not use${u.displayValue ? ` (PageSpeed: ${u.displayValue})` : ''}.`,
      evidence: { label: u.title, auditId: u.id, docsUrl: u.docsUrl, details: u.items.map((i) => `${i.url ?? i.label}${i.wastedBytes ? `: ${fmtBytes(i.wastedBytes)} unused` : ''}${wp && i.url && wpOrigin(i.url) ? ` — from the ${wpOrigin(i.url)}` : ''}`) },
      why: `Unused ${kind} still has to be downloaded${kind === 'CSS' ? ' and can block rendering' : ' and parsed'}.`,
      nextSteps: [`Check whether the largest files in the list are needed on this page.`],
      wordpress: wp ? ['Many plugins and page builders load their files on every page. The folder names show where each file comes from.'] : undefined,
      hypotheses: [],
      pageSpeedEstimate: u.displayValue,
      rankScoreHint: savingsMs(u),
    });
  }

  // 13. Page weight.
  if (psi.totalBytes !== undefined && psi.totalBytes > FINDING_THRESHOLDS.pageBytes) {
    const byType = new Map<string, number>();
    for (const r of requests) byType.set(r.resourceType, (byType.get(r.resourceType) ?? 0) + (r.transferSize ?? 0));
    const breakdown = [...byType.entries()].sort((a, b) => b[1] - a[1]).filter(([, b]) => b > 0).slice(0, 5).map(([t, b]) => `${t}: ${fmtBytes(b)}`);
    out.push({
      id: 'weight',
      severity: psi.totalBytes > 5 * 1024 * 1024 ? 'medium' : 'low',
      source: 'Requests observed by Lighthouse',
      title: `The page downloads ${fmtBytes(psi.totalBytes)}`,
      measured: `Total transfer size was ${fmtBytes(psi.totalBytes)} across ${psi.requestCount ?? requests.length} requests.`,
      evidence: { label: 'Avoid enormous network payloads', auditId: 'total-byte-weight', details: breakdown },
      why: 'Large pages are slow on mobile connections and cost visitors data.',
      nextSteps: ['Start with the largest type in the breakdown, then the largest files in the request waterfall.'],
      hypotheses: [],
      rankScoreHint: psi.totalBytes / 1024,
    });
  }

  // 14. Real-user data.
  if (psi.field) {
    const bad = psi.field.metrics.filter((m) => ['SLOW', 'POOR', 'AVERAGE', 'NEEDS_IMPROVEMENT'].includes(m.category));
    if (bad.length) {
      const poor = bad.some((m) => m.category === 'SLOW' || m.category === 'POOR');
      out.push({
        id: 'field',
        severity: poor ? 'high' : 'medium',
        source: 'Chrome real-user data',
        title: `Real visitors had ${poor ? 'poor' : 'mixed'} results for ${bad.map((m) => m.label.replace(' (p75)', '')).join(', ')}`,
        measured: `Chrome UX Report data for ${psi.field.scope === 'url' ? 'this page' : 'the whole site'} over the last 28 days, at the 75th percentile.`,
        evidence: { label: 'Chrome UX Report (in the PageSpeed response)', details: bad.map((m) => `${m.label}: ${m.unit === 'ms' ? fmtMs(m.percentile) : m.percentile.toFixed(2)} (${m.category.toLowerCase().replace('_', ' ')})`) },
        why: 'This is what real Chrome visitors experienced, and it is what Google Search uses for Core Web Vitals.',
        nextSteps: [
          ...(bad.some((m) => m.key === 'INTERACTION_TO_NEXT_PAINT') ? ['INP can only be measured with real interactions. Use the lab Total Blocking Time and the JavaScript list as a starting point.'] : []),
          'After a fix goes live, real-user data takes up to 28 days to fully reflect it.',
        ],
        hypotheses: [],
        rankScoreHint: 50_000,
      });
    }
  }

  return out;
}

function probeFindings(probe: ProbeSummary): Draft[] {
  if (probe.successful === 0 && probe.samples.length) {
    return [
      {
        id: 'probe-failed',
        severity: 'high',
        source: 'Browser probe',
        title: 'Your browser could not reach the URL',
        measured: `All ${probe.samples.length} requests from this browser failed.`,
        evidence: { label: 'Browser probe', details: probe.samples.map((s) => `Attempt ${s.attempt}: ${s.error ?? 'failed'}`) },
        why: 'If visitors cannot reach the site, nothing else matters.',
        nextSteps: ['Open the URL directly. If it loads, an extension or the site’s security settings may block background requests.'],
        hypotheses: ['A browser extension or the site’s firewall may block requests that are not normal page loads.'],
        rankScoreHint: 99_999,
      },
    ];
  }
  if (probe.firstMs !== undefined && probe.repeatMedianMs !== undefined && probe.firstMs > probe.repeatMedianMs * 2 && probe.firstMs - probe.repeatMedianMs > 150) {
    return [
      {
        id: 'cold-connection',
        severity: 'info',
        source: 'Browser probe',
        title: `First request was ${fmtMs(probe.firstMs - probe.repeatMedianMs)} slower than repeats`,
        measured: `First request ${fmtMs(probe.firstMs)}; median of repeats ${fmtMs(probe.repeatMedianMs)}, from your network.`,
        evidence: { label: 'Browser probe', details: probe.samples.map((s) => `Attempt ${s.attempt}: ${s.ok ? fmtMs(s.totalMs) : (s.error ?? 'failed')}`) },
        why: 'The first request includes DNS lookup and connection setup; repeats reuse the connection.',
        nextSteps: ['If first visits matter, check DNS and TLS setup time, and whether a CDN closer to your visitors would help.'],
        hypotheses: [],
        rankScoreHint: probe.firstMs,
      },
    ];
  }
  return [];
}
