import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  STAGE_DESCRIPTIONS,
  detectPlatform,
  safeHttpUrl,
  safeImageData,
  type FindingStage,
  fmtBytes as fmtB,
  fmtMs as fmtM,
  rateFieldCategory,
  rateMetric,
  type NetRequest,
  type PageSpeedResult,
  type ProbeSample,
  type ProbeSummary,
  type PsiSummary,
  type RatedMetric,
  type Rating,
  type Strategy,
  type WebsiteFinding,
} from '../../core';
import { Button, Card, SeverityBadge } from '../ui';

export const fmtMs = (ms: number | undefined) => (ms === undefined ? '—' : fmtM(ms));
export const fmtBytes = (b: number | undefined) => (b === undefined ? '—' : fmtB(b));
export const pageSpeedSiteUrl = (url: string, strategy: Strategy) => `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;

const ratingText: Record<Rating, string> = { good: 'Good', 'needs-improvement': 'Needs improvement', poor: 'Poor' };
const ratingStyle: Record<Rating, string> = { good: 'text-teal', 'needs-improvement': 'text-warn', poor: 'text-danger' };
const ratingBg: Record<Rating, string> = { good: 'bg-teal', 'needs-improvement': 'bg-warn', poor: 'bg-danger' };

export function RatingChip({ rating }: { rating?: Rating }) {
  if (!rating) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ratingStyle[rating]}`}>
      <span className={`inline-block h-2 w-2 rounded-full ${ratingBg[rating]}`} aria-hidden="true" />
      {ratingText[rating]}
    </span>
  );
}

function SectionTitle({ id, children, badge }: { id: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h3 id={id} className="text-lg font-semibold">
        {children}
      </h3>
      {badge}
    </div>
  );
}

function Badge({ children, tone = 'violet' }: { children: ReactNode; tone?: 'violet' | 'teal' | 'cyan' | 'muted' | 'warn' }) {
  const style = { violet: 'border-violet/60 text-violet', teal: 'border-teal/60 text-teal', cyan: 'border-cyan/60 text-cyan', muted: 'border-line text-muted', warn: 'border-warn/60 text-warn' }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${style}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Verdict and summary
// ---------------------------------------------------------------------------

export function Verdict({ psi, findings }: { psi: PsiSummary; findings: WebsiteFinding[] }) {
  const lcp = psi.lcpMs !== undefined ? rateMetric('lcp', psi.lcpMs) : undefined;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;
  const sentences: string[] = [];
  if (psi.lcpMs !== undefined) sentences.push(`In Google’s lab test the main content appeared after ${fmtMs(psi.lcpMs)} (${ratingText[lcp!].toLowerCase()}).`);
  if (psi.field) sentences.push(`Real Chrome visitors over the last 28 days: ${psi.field.overall ? psi.field.overall.toLowerCase().replace('_', ' ') : 'see below'}.`);
  else sentences.push('Google has no real-user data for this page or site, so only the lab test is shown.');
  if (high + medium > 0) sentences.push(`${high + medium} finding${high + medium === 1 ? '' : 's'} need${high + medium === 1 ? 's' : ''} attention; the most important is first.`);
  else sentences.push('No high or medium findings.');
  return <p className="text-base leading-relaxed">{sentences.join(' ')}</p>;
}

function ScoreRing({ score }: { score: number | undefined }) {
  const pct = score === undefined ? 0 : Math.round(score * 100);
  const tone = score === undefined ? 'text-muted' : pct >= 90 ? 'text-teal' : pct >= 50 ? 'text-warn' : 'text-danger';
  const c = 2 * Math.PI * 34;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 80 80" className={`h-20 w-20 shrink-0 ${tone}`} role="img" aria-label={score === undefined ? 'Performance score not returned' : `Performance score ${pct} out of 100`}>
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-line)" strokeWidth="8" />
        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 40 40)" />
        <text x="40" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--color-ink)">
          {score === undefined ? '—' : pct}
        </text>
      </svg>
      <div className="text-sm">
        <div className="font-semibold">Lighthouse performance score</div>
        <div className="text-muted">Lab test, out of 100. 90+ is good.</div>
      </div>
    </div>
  );
}

function Fact({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: Rating; hint?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{value}</dd>
      {tone && (
        <dd>
          <RatingChip rating={tone} />
        </dd>
      )}
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

export function Summary({ psi, selectedPlatform }: { psi: PsiSummary; selectedPlatform: string }) {
  const status = psi.mainDocument?.statusCode;
  const redirects = Math.max(0, psi.redirects.length - 1);
  const platform = detectPlatform(psi.requests ?? []);
  return (
    <Card aria-labelledby="summary-h">
      <h3 id="summary-h" className="sr-only">
        Summary
      </h3>
      <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
        <ScoreRing score={psi.performanceScore} />
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="HTTP status" value={status === undefined ? '—' : String(status)} tone={status === undefined ? undefined : status >= 400 ? 'poor' : 'good'} />
          <Fact label="Redirects" value={redirects === 0 ? 'None' : String(redirects)} tone={redirects > 0 ? 'needs-improvement' : undefined} />
          <Fact label="Server response" value={fmtMs(psi.serverResponseMs)} tone={psi.serverResponseMs === undefined ? undefined : rateMetric('serverResponse', psi.serverResponseMs)} />
          <Fact label="Page weight" value={fmtBytes(psi.totalBytes)} hint={psi.requestCount ? `${psi.requestCount} requests` : undefined} />
        </dl>
      </div>
      <p className="mt-4 break-all text-xs text-muted">
        Final address: {psi.finalUrl || '—'}
        {psi.mainDocument?.protocol ? ` · ${psi.mainDocument.protocol}` : ''}
        {psi.redirects.length > 1 ? ` · ${psi.redirects.map((r) => r.url).join(' → ')}` : ''}
      </p>
      <PlatformLine detected={platform.detected} selected={selectedPlatform} />
    </Card>
  );
}

export function InterpretationGuide() {
  return (
    <Card aria-labelledby="td-adds-h">
      <SectionTitle id="td-adds-h" badge={<Badge tone="cyan">How this report helps</Badge>}>
        From PageSpeed data to a developer starting point
      </SectionTitle>
      <p className="mt-1 text-sm text-muted">
        PageSpeed Insights provides the measurements. TraceDetective puts the most useful evidence next to each other so you can decide what to inspect first.
      </p>
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        <li className="rounded-lg border border-line p-3">
          <span className="text-sm font-semibold">1. See the delay</span>
          <p className="mt-1 text-xs text-muted">A page screenshot and a visual split of the time until the main content appeared.</p>
        </li>
        <li className="rounded-lg border border-line p-3">
          <span className="text-sm font-semibold">2. Find related evidence</span>
          <p className="mt-1 text-xs text-muted">The LCP element, a linked file when Lighthouse proves the match, and requests ranked by duration or size.</p>
        </li>
        <li className="rounded-lg border border-line p-3">
          <span className="text-sm font-semibold">3. Choose what to inspect</span>
          <p className="mt-1 text-xs text-muted">Findings are grouped by loading stage and include evidence and a next check. Guesses are labelled as hypotheses.</p>
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted">
        This is an explained view of PageSpeed Insights and Chrome UX measurements, not a second benchmark. A public URL cannot reveal private API handlers, application code or database queries; investigate those with an instrumented trace.
      </p>
    </Card>
  );
}

function PlatformLine({ detected, selected }: { detected: ReturnType<typeof detectPlatform>['detected']; selected: string }) {
  const selectedMissing = selected && !detected.some((d) => d.id === selected);
  return (
    <div className="mt-3 text-xs">
      {detected.length === 0 ? (
        <p className="text-muted">
          Platform: not identified. TraceDetective names a platform only when its own file locations appear in the request list, so the advice below is platform-neutral.
        </p>
      ) : (
        <ul className="space-y-1">
          {detected.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <Badge tone="cyan">{d.name} detected</Badge>
              <span className="text-muted">
                Method: {d.method.charAt(0).toLowerCase() + d.method.slice(1)}, for example <span className="break-all font-mono">{shortPath(d.evidence[0]!)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {selectedMissing && (
        <p className="mt-1">
          <Badge tone="muted">{selected === 'wordpress' ? 'WordPress' : selected} notes added because you chose it (not detected)</Badge>
        </p>
      )}
    </div>
  );
}

function shortPath(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Where the time went
// ---------------------------------------------------------------------------

const STAGE_OF_SUBPART: Record<string, { stage: string; color: string; explain: string }> = {
  ttfb: { stage: 'Server response', color: 'bg-cyan', explain: 'Redirects, connection and waiting for the first byte of the HTML.' },
  loadDelay: { stage: 'Resource discovery', color: 'bg-warn', explain: 'Time after the HTML arrived before the main content’s file started downloading.' },
  loadDuration: { stage: 'Resource download', color: 'bg-violet', explain: 'Downloading the main content’s file.' },
  renderDelay: { stage: 'Rendering', color: 'bg-danger', explain: 'Time after that until the content was drawn (CSS, scripts and other work first).' },
};

const STAGE_ORDER: FindingStage[] = ['Server response', 'Resource loading', 'Rendering', 'Main-thread work', 'Layout stability', 'Whole page', 'Real-user experience', 'Your network'];

export function TimeBreakdown({ psi, findings, strategy }: { psi: PsiSummary; findings: WebsiteFinding[]; strategy: Strategy }) {
  const parts = psi.lcp?.subparts?.filter((p) => p.ms >= 0) ?? [];
  const total = parts.reduce((s, p) => s + p.ms, 0);
  const longest = parts.slice().sort((a, b) => b.ms - a.ms)[0];
  const longestMeta = longest ? STAGE_OF_SUBPART[longest.key] : undefined;
  const linkedRequest = psi.lcp?.resourceUrl ? psi.requests?.find((r) => r.url === psi.lcp?.resourceUrl) : undefined;
  const stageFindings = longestMeta
    ? findings.filter((f) => f.stage === (longestMeta.stage === 'Resource download' || longestMeta.stage === 'Resource discovery' ? 'Resource loading' : longestMeta.stage))
    : [];
  const byStage = new Map<FindingStage, WebsiteFinding[]>();
  for (const f of findings) byStage.set(f.stage, [...(byStage.get(f.stage) ?? []), f]);
  return (
    <Card aria-labelledby="time-h">
      <SectionTitle id="time-h" badge={parts.length > 0 ? <Badge>{psi.lcp?.subpartsBasis === 'observed' ? 'Lighthouse · observed' : 'Lighthouse · lab estimate'}</Badge> : undefined}>
        Where the time went
      </SectionTitle>
      {parts.length > 0 && total > 0 ? (
        <>
          <p className="mt-1 text-sm text-muted">
            This is the time until the largest visible content appeared (LCP). Start with the largest segment; it is the biggest measured part of this test, not by itself proof of a code-level cause.
          </p>
          {longest && longestMeta && (
            <div className="mt-4 rounded-xl border border-warn/50 bg-warn/5 p-4">
              <p className="text-base font-semibold">Largest measured delay: {longestMeta.stage}</p>
              <p className="mt-1 text-sm">
                {fmtMs(longest.ms)} ({Math.round((longest.ms / total) * 100)}% of this LCP breakdown). {longestMeta.explain}
              </p>
              {longestMeta.stage === 'Resource download' && linkedRequest ? (
                <p className="mt-2 break-all text-sm">
                  Linked LCP file: <span className="font-mono text-xs">{shortPath(linkedRequest.url)}</span>
                  {linkedRequest.transferSize !== undefined ? ` · ${fmtBytes(linkedRequest.transferSize)}` : ''}
                  {` · ${fmtMs(linkedRequest.endMs - linkedRequest.startMs)} observed request time`}
                </p>
              ) : longestMeta.stage === 'Resource download' ? (
                <p className="mt-2 text-sm">PageSpeed did not link a specific request to the LCP element, so this report will not guess which file caused it.</p>
              ) : null}
              {stageFindings.length > 0 && (
                <p className="mt-2 text-sm">Related PageSpeed checks: {stageFindings.slice(0, 2).map((f) => f.title).join(' · ')}</p>
              )}
              <p className="mt-2 text-xs text-muted">
                {psi.lcp?.subpartsBasis === 'observed' ? 'Observed by Lighthouse.' : 'Estimated by Lighthouse’s lab model.'} A public URL test cannot see server code, internal APIs or database queries.
              </p>
            </div>
          )}
          <div className="mt-4" aria-label="LCP time breakdown chart">
            <div className="flex h-7 overflow-hidden rounded-lg bg-surface-2" role="img" aria-label={`LCP ${fmtMs(total)}: ${parts.map((p) => `${STAGE_OF_SUBPART[p.key]?.stage ?? p.label} ${fmtMs(p.ms)}, ${Math.round((p.ms / total) * 100)} percent`).join('; ')}`}>
              {parts.map((p) => {
                const meta = STAGE_OF_SUBPART[p.key] ?? { stage: p.label, color: 'bg-muted', explain: '' };
                return <span key={p.key} className={`${meta.color} border-r border-navy/30 last:border-0`} style={{ width: `${Math.max(0.5, (p.ms / total) * 100)}%` }} />;
              })}
            </div>
            <p className="mt-1 text-right text-xs font-semibold tabular-nums">Total LCP · {fmtMs(total)}</p>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="LCP stages">
              {parts.map((p) => {
                const meta = STAGE_OF_SUBPART[p.key] ?? { stage: p.label, color: 'bg-muted', explain: '' };
                return (
                  <li key={p.key} className="flex items-start gap-2 rounded-lg border border-line p-3">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-sm ${meta.color}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{meta.stage}</span>
                      <span className="block text-xs text-muted">{meta.explain}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{fmtMs(p.ms)} · {Math.round((p.ms / total) * 100)}%</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          PageSpeed did not return an LCP breakdown for this test, so the time cannot be split into stages here. The metrics and request list below are still measured.{' '}
          <a href={pageSpeedSiteUrl(psi.requestedUrl || psi.finalUrl, strategy)} target="_blank" rel="noopener noreferrer">
            Check “LCP breakdown” in the full PageSpeed report ↗
          </a>
        </p>
      )}
      {psi.tbtMs !== undefined && (
        <p className="mt-4 text-sm">
          <span className="font-semibold">Main-thread work:</span> the main thread was blocked for <span className="font-semibold tabular-nums">{fmtMs(psi.tbtMs)}</span> (Total
          Blocking Time, lab). This is separate from the stages above: it is time the page could not respond to taps or clicks.
        </p>
      )}
      {byStage.size > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Findings by stage</h4>
          <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            {STAGE_ORDER.filter((st) => byStage.has(st)).map((stage) => [stage, byStage.get(stage)!] as const).map(([stage, fs]) => (
              <li key={stage} className="rounded-lg border border-line p-3">
                <span className="font-semibold">{stage}</span>
                <span className="block text-xs text-muted">{STAGE_DESCRIPTIONS[stage]}</span>
                <span className="mt-1 block">{fs.map((f) => f.title).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page preview and filmstrip
// ---------------------------------------------------------------------------

export function Preview({ psi, strategy }: { psi: PsiSummary; strategy: Strategy }) {
  if (!psi.screenshot && !psi.filmstrip?.length) {
    return (
      <Card aria-labelledby="preview-h">
        <SectionTitle id="preview-h">What the test browser saw</SectionTitle>
        <p className="mt-2 text-sm text-muted">PageSpeed did not return a screenshot for this test.</p>
      </Card>
    );
  }
  const frameW = strategy === 'mobile' ? 'max-w-[220px]' : 'max-w-[420px]';
  return (
    <Card aria-labelledby="preview-h">
      <SectionTitle id="preview-h" badge={<Badge tone="muted">{strategy === 'mobile' ? 'Mobile' : 'Desktop'} · Google’s test browser</Badge>}>
        What the test browser saw
      </SectionTitle>
      <div className="mt-4 grid gap-5 md:grid-cols-[auto_minmax(0,1fr)]">
        {psi.screenshot && (
          <figure className={`${frameW} rounded-xl border-4 border-surface-2 bg-navy shadow-lg`}>
            <img src={safeImageData(psi.screenshot.data)} alt={`Final screenshot of ${psi.finalUrl} on ${strategy}`} className="block h-auto w-full rounded-md" />
            <figcaption className="sr-only">Final screenshot from the lab test</figcaption>
          </figure>
        )}
        {psi.filmstrip && psi.filmstrip.length > 0 && (
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">Loading sequence</h4>
            <p className="text-xs text-muted">Frames captured while Google loaded the page. Times are as observed in the test, before slow-network simulation.</p>
            <ol className="mt-3 flex gap-2 overflow-x-auto pb-2" tabIndex={0} aria-label="Loading sequence frames">
              {psi.filmstrip.map((f, i) => (
                <li key={i} className="shrink-0 text-center">
                  <img src={safeImageData(f.data)} alt={`Frame at ${fmtMs(f.timingMs)}`} className="h-28 w-auto rounded border border-line" />
                  <span className="mt-1 block text-xs tabular-nums text-muted">{fmtMs(f.timingMs)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Metrics: lab and real users side by side
// ---------------------------------------------------------------------------

type MetricRow = { label: string; key: RatedMetric; value?: number; isScore?: boolean; missing?: string };

function MetricLine({ row }: { row: MetricRow }) {
  const rating = row.value === undefined ? undefined : rateMetric(row.key, row.value);
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <dt className="text-sm">{row.label}</dt>
      <dd className="text-right">
        {row.value === undefined ? (
          <span className="text-sm text-muted">{row.missing ?? 'Not returned'}</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{row.isScore ? row.value.toFixed(3) : fmtMs(row.value)}</span> <RatingChip rating={rating} />
          </>
        )}
      </dd>
    </div>
  );
}

export function Metrics({ psi, strategy }: { psi: PsiSummary; strategy: Strategy }) {
  const lab: MetricRow[] = [
    { label: 'Largest Contentful Paint (LCP)', key: 'lcp', value: psi.lcpMs },
    { label: 'First Contentful Paint (FCP)', key: 'fcp', value: psi.fcpMs },
    { label: 'Total Blocking Time (TBT)', key: 'tbt', value: psi.tbtMs },
    { label: 'Cumulative Layout Shift (CLS)', key: 'cls', value: psi.cls, isScore: true },
    { label: 'Time to First Byte (TTFB)', key: 'ttfb', value: psi.ttfbMs },
    { label: 'Interaction to Next Paint (INP)', key: 'inp', missing: 'Not measured in a lab test (see TBT)' },
  ];
  const fm = (k: string) => psi.field?.metrics.find((m) => m.key === k);
  const field: { label: string; m: ReturnType<typeof fm> }[] = [
    { label: 'Largest Contentful Paint (LCP)', m: fm('LARGEST_CONTENTFUL_PAINT_MS') },
    { label: 'Interaction to Next Paint (INP)', m: fm('INTERACTION_TO_NEXT_PAINT') },
    { label: 'Cumulative Layout Shift (CLS)', m: fm('CUMULATIVE_LAYOUT_SHIFT_SCORE') },
    { label: 'First Contentful Paint (FCP)', m: fm('FIRST_CONTENTFUL_PAINT_MS') },
    { label: 'Time to First Byte (TTFB)', m: fm('EXPERIMENTAL_TIME_TO_FIRST_BYTE') },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card aria-labelledby="lab-h">
        <SectionTitle id="lab-h" badge={<Badge>Lighthouse · simulated</Badge>}>
          Lab test
        </SectionTitle>
        <p className="mt-1 text-sm text-muted">
          One page load in Google’s test environment, {strategy === 'mobile' ? 'as a mid-range phone on a slow 4G connection' : 'as a desktop computer'}. Useful for finding
          causes and comparing changes. Not what visitors experience on average.
        </p>
        <dl className="mt-2">
          {lab.map((r) => (
            <MetricLine key={r.label} row={r} />
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted">
          Speed Index {fmtMs(psi.speedIndexMs)} · Lighthouse {psi.lighthouseVersion || '?'}
          {psi.fetchTime ? ` · tested ${new Date(psi.fetchTime).toLocaleString()}` : ''}
        </p>
        {psi.runWarnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-warn">
            {psi.runWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card aria-labelledby="field-h">
        <SectionTitle id="field-h" badge={<Badge tone="teal">{psi.field?.period ? `Chrome UX Report · ${psi.field.period.first} to ${psi.field.period.last}` : 'Chrome UX Report · rolling 28 days'}</Badge>}>
          Real users
        </SectionTitle>
        {psi.field ? (
          <>
            <p className="mt-1 text-sm text-muted">
              What real Chrome users experienced {psi.field.scope === 'url' ? 'on this page' : 'across the whole site (this page has too few visits on its own)'}. Each value is
              the 75th percentile: 3 out of 4 visits were at least this fast.
            </p>
            <dl className="mt-2">
              {field.map(({ label, m }) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-2 last:border-0">
                  <dt className="text-sm">{label}</dt>
                  <dd className="text-right">
                    {m ? (
                      <>
                        <span className="font-semibold tabular-nums">{m.unit === 'ms' ? fmtMs(m.percentile) : m.percentile.toFixed(2)}</span> <RatingChip rating={rateFieldCategory(m.category)} />
                      </>
                    ) : (
                      <span className="text-sm text-muted">Not returned</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Not available. Google publishes real-user data only for pages and sites with enough Chrome visits. The lab test is still valid; it just cannot say what real
            visitors experience.
          </p>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LCP element
// ---------------------------------------------------------------------------

export function LcpSection({ psi, strategy }: { psi: PsiSummary; strategy: Strategy }) {
  const lcp = psi.lcp;
  const res = lcp?.resourceUrl ? psi.requests?.find((r) => r.url === lcp.resourceUrl) : undefined;
  return (
    <Card aria-labelledby="lcp-h">
      <SectionTitle id="lcp-h" badge={<Badge>Lighthouse · simulated</Badge>}>
        Main content: the LCP element
      </SectionTitle>
      {!lcp?.selector ? (
        <p className="mt-2 text-sm text-muted">
          PageSpeed did not identify the LCP element in this response, so TraceDetective cannot say which element or file it was.{' '}
          <a href={pageSpeedSiteUrl(psi.requestedUrl || psi.finalUrl, strategy)} target="_blank" rel="noopener noreferrer">
            Look at “LCP breakdown” in the full PageSpeed report ↗
          </a>
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            {lcp.label && (
              <>
                <dt className="text-muted">Element</dt>
                <dd>“{lcp.label}”</dd>
              </>
            )}
            <dt className="text-muted">Selector</dt>
            <dd className="break-all font-mono text-xs">{lcp.selector}</dd>
            {lcp.width !== undefined && lcp.height !== undefined && (
              <>
                <dt className="text-muted">Displayed size</dt>
                <dd>
                  {Math.round(lcp.width)} × {Math.round(lcp.height)} CSS px
                </dd>
              </>
            )}
            <dt className="text-muted">Resource</dt>
            <dd className="min-w-0">
              {lcp.resourceUrl ? (
                <>
                  <span className="break-all font-mono text-xs">{lcp.resourceUrl}</span>
                  {res?.transferSize !== undefined && <span className="text-muted"> · {fmtBytes(res.transferSize)}</span>}
                  {lcp.resourceEvidence && <span className="block text-xs text-muted">{lcp.resourceEvidence}</span>}
                </>
              ) : (
                <span className="text-muted">Not identified in this response (it may be text, a CSS background or an image PageSpeed did not link to the element).</span>
              )}
            </dd>
          </dl>
          {lcp.snippet && (
            <pre tabIndex={0} aria-label="LCP element HTML" className="mt-3 overflow-x-auto rounded-lg border border-line bg-navy p-3 text-xs">
              <code>{lcp.snippet}</code>
            </pre>
          )}
        </>
      )}
      {lcp?.checklist && (
        <ul className="mt-4 space-y-1 text-sm">
          {lcp.checklist.map((c) => (
            <li key={c.key}>
              <span className={c.passed ? 'text-teal' : 'text-warn'}>{c.passed ? '✓ Passed' : '✕ Not passed'}</span> · {c.label}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const TOP_FINDINGS = 3;

export function Findings({ findings, reportUrl }: { findings: WebsiteFinding[]; reportUrl: string }) {
  const top = findings.slice(0, TOP_FINDINGS);
  const more = findings.slice(TOP_FINDINGS);
  return (
    <Card aria-labelledby="findings-h">
      <SectionTitle id="findings-h">What to check next</SectionTitle>
      <p className="mt-1 text-sm text-muted">
        Ranked by severity, then by the time PageSpeed estimates is at stake. Each finding says what was measured and where it came from. Possible causes are marked as
        hypotheses.
      </p>
      <ol className="mt-4 space-y-4">
        {top.map((f, i) => (
          <li key={f.id}>
            <FindingCard f={f} n={i + 1} reportUrl={reportUrl} />
          </li>
        ))}
      </ol>
      {more.length > 0 && (
        <details className="mt-4 rounded-xl border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {more.length} more finding{more.length === 1 ? '' : 's'}: {more.map((f) => f.title).join(' · ')}
          </summary>
          <ol className="mt-4 space-y-4" start={TOP_FINDINGS + 1}>
            {more.map((f, i) => (
              <li key={f.id}>
                <FindingCard f={f} n={TOP_FINDINGS + i + 1} reportUrl={reportUrl} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </Card>
  );
}

function FindingCard({ f, n, reportUrl }: { f: WebsiteFinding; n: number; reportUrl: string }) {
  return (
    <article className="rounded-xl border border-line p-4" aria-labelledby={`f-${f.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-muted">#{n}</span>
        <SeverityBadge severity={f.severity} />
        <h4 id={`f-${f.id}`} className="font-semibold">
          {f.title}
        </h4>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone="teal">{f.statement}</Badge>
        <Badge tone="muted">Stage: {f.stage}</Badge>
        <Badge tone={f.source === 'Chrome real-user data' ? 'teal' : f.source === 'Browser probe' ? 'cyan' : 'violet'}>{f.source}</Badge>
      </div>
      <dl className="mt-3 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">What was measured</dt>
          <dd>{f.measured}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence</dt>
          <dd>
            <span>From {f.evidence.label}.</span>{' '}
            {safeHttpUrl(f.evidence.docsUrl) && (
              <a href={safeHttpUrl(f.evidence.docsUrl)} target="_blank" rel="noopener noreferrer">
                About this check ↗
              </a>
            )}{' '}
            {f.source !== 'Browser probe' && f.source !== 'Chrome real-user data' && (
              <a href={reportUrl} target="_blank" rel="noopener noreferrer">
                Full PageSpeed report ↗
              </a>
            )}
            {f.evidence.details.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {f.evidence.details.map((d) => (
                  <li key={d} className="break-words">
                    {d}
                  </li>
                ))}
              </ul>
            )}
            {f.pageSpeedEstimate && <p className="mt-1 text-xs text-muted">PageSpeed’s own estimate: {f.pageSpeedEstimate}.</p>}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Why it may matter</dt>
          <dd>{f.why}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Next step</dt>
          <dd>
            <ul className="list-disc pl-5">
              {f.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </dd>
        </div>
        {f.hypotheses.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-warn">Possible causes (hypotheses, not measured)</dt>
            <dd>
              <ul className="list-disc pl-5">
                {f.hypotheses.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {f.platformNotes && (
          <div className="rounded-lg border border-cyan/40 bg-cyan/5 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-cyan">{f.platformNotes.platform} notes</dt>
            <dd>
              <p className="text-xs text-muted">{f.platformNotes.basis}</p>
              <ul className="mt-1 list-disc pl-5">
                {f.platformNotes.notes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Request waterfall
// ---------------------------------------------------------------------------

const TYPE_COLOR: Record<string, string> = {
  Document: 'bg-cyan',
  Stylesheet: 'bg-violet',
  Script: 'bg-warn',
  Image: 'bg-teal',
  Font: 'bg-[#ff9ad5]',
  Fetch: 'bg-[#8fa6ff]',
  XHR: 'bg-[#8fa6ff]',
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? 'bg-muted';

function shortUrl(url: string, finalHost: string) {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}`;
    return u.host === finalHost ? path : `${u.host}${path}`;
  } catch {
    return url;
  }
}

export function Waterfall({ psi }: { psi: PsiSummary }) {
  const all = psi.requests ?? [];
  const [type, setType] = useState('All');
  const [focus, setFocus] = useState<'timeline' | 'longest' | 'largest' | 'fetch' | 'errors'>('timeline');
  const [showAll, setShowAll] = useState(false);
  const types = useMemo(() => ['All', ...[...new Set(all.map((r) => r.resourceType))].sort()], [all]);
  if (all.length === 0) {
    return (
      <Card aria-labelledby="wf-h">
        <SectionTitle id="wf-h">Requests</SectionTitle>
        <p className="mt-2 text-sm text-muted">PageSpeed did not return the request list for this test.</p>
      </Card>
    );
  }
  const finalHost = (() => {
    try {
      return new URL(psi.finalUrl).host;
    } catch {
      return '';
    }
  })();
  const filtered = all.filter((r) => {
    if (type !== 'All' && r.resourceType !== type) return false;
    if (focus === 'fetch') return r.resourceType === 'Fetch' || r.resourceType === 'XHR';
    if (focus === 'errors') return r.statusCode !== undefined && r.statusCode >= 400;
    return true;
  });
  const rows = filtered.sort((a, b) => {
    if (focus === 'longest') return (b.endMs - b.startMs) - (a.endMs - a.startMs);
    if (focus === 'largest') return (b.transferSize ?? b.resourceSize ?? -1) - (a.transferSize ?? a.resourceSize ?? -1);
    return a.startMs - b.startMs;
  });
  const shown = showAll ? rows : rows.slice(0, 40);
  const end = Math.max(...all.map((r) => r.endMs), 1);
  const blocking = new Set((psi.insights ?? []).filter((i) => i.id === 'render-blocking-insight' || i.id === 'render-blocking-resources').flatMap((i) => i.items.map((it) => it.url)));
  const tag = (r: NetRequest) => [r.url === psi.lcp?.resourceUrl ? 'LCP' : '', blocking.has(r.url) ? 'Render-blocking' : ''].filter(Boolean);
  return (
    <Card aria-labelledby="wf-h">
      <SectionTitle id="wf-h" badge={<Badge tone="muted">Observed in the test</Badge>}>
        Requests
      </SectionTitle>
      <p className="mt-1 text-sm text-muted">
        Requests observed in Google’s test browser. The timeline and durations below are observed request timings before Lighthouse’s slow-network simulation. Fetch/XHR rows show browser-visible calls; their presence alone does not prove they caused the delay.
      </p>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Request view">
        {([
          ['timeline', 'Timeline'], ['longest', 'Longest'], ['largest', 'Largest'], ['fetch', 'API-like · Fetch/XHR'], ['errors', 'HTTP errors'],
        ] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={focus === key} onClick={() => { setFocus(key); setShowAll(false); }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${focus === key ? 'border-cyan bg-cyan text-navy' : 'border-line text-muted hover:text-ink'}`}>
            {label}{key === 'fetch' ? ` ${all.filter((r) => r.resourceType === 'Fetch' || r.resourceType === 'XHR').length}` : key === 'errors' ? ` ${all.filter((r) => r.statusCode !== undefined && r.statusCode >= 400).length}` : ''}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Filter by request type">
        {types.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${type === t ? 'border-violet bg-violet text-navy' : 'border-line text-muted hover:text-ink'}`}
          >
            {t} {t === 'All' ? all.length : all.filter((r) => r.resourceType === t).length}
          </button>
        ))}
      </div>
      <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Request waterfall">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 font-semibold">Request</th>
              <th scope="col" className="py-1 pr-2 font-semibold">Type</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">Size</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">Duration</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">Status</th>
              <th scope="col" className="w-[38%] py-1 font-semibold">Timing</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.url}-${i}`} className="border-t border-line/60">
                <td className="max-w-[280px] py-1.5 pr-2">
                  <span className="block truncate font-mono" title={r.url}>
                    {shortUrl(r.url, finalHost)}
                  </span>
                  {tag(r).map((t) => (
                    <span key={t} className="mr-1 rounded border border-warn/60 px-1 text-[10px] font-semibold text-warn">
                      {t}
                    </span>
                  ))}
                </td>
                <td className="py-1.5 pr-2">{r.resourceType}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtBytes(r.transferSize)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMs(r.endMs - r.startMs)}</td>
                <td className={`py-1.5 pr-2 text-right tabular-nums ${r.statusCode !== undefined && r.statusCode >= 400 ? 'text-danger' : ''}`}>{r.statusCode ?? '—'}</td>
                <td className="py-1.5">
                  <div className="relative h-3 rounded bg-surface-2" aria-hidden="true">
                    <div className={`absolute top-0 h-3 rounded ${typeColor(r.resourceType)}`} style={{ left: `${(r.startMs / end) * 100}%`, width: `${Math.max(0.6, ((r.endMs - r.startMs) / end) * 100)}%` }} />
                  </div>
                  <span className="sr-only">
                    starts at {fmtMs(r.startMs)}, takes {fmtMs(r.endMs - r.startMs)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <Button variant="ghost" className="mt-2" onClick={() => setShowAll(true)}>
          Show all {rows.length} requests
        </Button>
      )}
      {rows.length === 0 && <p className="mt-3 text-sm text-muted">No requests match this view.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mobile vs desktop
// ---------------------------------------------------------------------------

export function DeviceComparison({ mobile, desktop }: { mobile: PsiSummary; desktop: PsiSummary }) {
  const rows: [string, (p: PsiSummary) => string][] = [
    ['Performance score', (p) => (p.performanceScore === undefined ? '—' : String(Math.round(p.performanceScore * 100)))],
    ['Largest Contentful Paint', (p) => fmtMs(p.lcpMs)],
    ['First Contentful Paint', (p) => fmtMs(p.fcpMs)],
    ['Total Blocking Time', (p) => fmtMs(p.tbtMs)],
    ['Cumulative Layout Shift', (p) => (p.cls === undefined ? '—' : p.cls.toFixed(3))],
    ['Server response', (p) => fmtMs(p.serverResponseMs)],
  ];
  const totalLcp = (p: PsiSummary) => p.lcpMs ?? p.lcp?.subparts?.reduce((sum, part) => sum + part.ms, 0) ?? 0;
  const sharedScaleMs = Math.max(totalLcp(mobile), totalLcp(desktop), 1);
  const panel = (p: PsiSummary, strategy: Strategy) => {
    const parts = p.lcp?.subparts ?? [];
    return (
      <section key={strategy} aria-labelledby={`device-${strategy}-h`} className="min-w-0 rounded-xl border border-line p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id={`device-${strategy}-h`} className="text-base font-semibold capitalize">{strategy}</h4>
          <span className="text-sm font-semibold tabular-nums">LCP {fmtMs(p.lcpMs)} · score {p.performanceScore === undefined ? '—' : Math.round(p.performanceScore * 100)}</span>
        </div>
        {p.screenshot ? (
          <figure className="mt-3 overflow-hidden rounded-lg border border-line bg-navy">
            <img src={safeImageData(p.screenshot.data)} alt={`${strategy} PageSpeed screenshot of ${p.finalUrl}`} className="block max-h-[300px] w-full object-contain object-top" />
            <figcaption className="sr-only">Final {strategy} screenshot captured by Google’s lab test</figcaption>
          </figure>
        ) : (
          <p className="mt-3 rounded-lg border border-line p-3 text-sm text-muted">No {strategy} screenshot was returned.</p>
        )}
        <div className="mt-3">
          <p className="text-xs text-muted">LCP stages · shared scale across both devices (maximum {fmtMs(sharedScaleMs)})</p>
          {parts.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {parts.map((part) => {
                const meta = STAGE_OF_SUBPART[part.key] ?? { stage: part.label, color: 'bg-muted', explain: '' };
                return (
                  <li key={part.key} className="grid grid-cols-[8rem_minmax(0,1fr)_4rem] items-center gap-2 text-xs">
                    <span className="truncate" title={meta.stage}>{meta.stage}</span>
                    <span className="block h-3 rounded bg-surface-2" aria-hidden="true">
                      <span className={`block h-3 rounded ${meta.color}`} style={{ width: `${Math.max(0.5, (part.ms / sharedScaleMs) * 100)}%` }} />
                    </span>
                    <span className="text-right tabular-nums">{fmtMs(part.ms)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">No LCP stage breakdown was returned for this run.</p>
          )}
        </div>
      </section>
    );
  };
  return (
    <Card aria-labelledby="cmp-h">
      <SectionTitle id="cmp-h" badge={<Badge>Lab tests</Badge>}>
        Mobile and desktop side by side
      </SectionTitle>
      <p className="mt-1 text-sm text-muted">Both tests use the same page URL. These are separate lab runs; the bars use one shared time scale so the stage lengths compare directly.</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">{panel(mobile, 'mobile')}{panel(desktop, 'desktop')}</div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-semibold">Metric</th>
              <th scope="col" className="py-1 text-right font-semibold">Mobile</th>
              <th scope="col" className="py-1 text-right font-semibold">Desktop</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t border-line/60">
                <th scope="row" className="py-1.5 font-normal">{label}</th>
                <td className="py-1.5 text-right tabular-nums">{f(mobile)}</td>
                <td className="py-1.5 text-right tabular-nums">{f(desktop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">The mobile test simulates a slower network and CPU, so it is usually slower. Each column is one test.</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Errors, probe, method
// ---------------------------------------------------------------------------

export function PsiErrorCard({ url, strategy, result, canProbe, onRetry, onProbe }: { url: string; strategy: Strategy; result: Extract<PageSpeedResult, { ok: false }>; canProbe: boolean; onRetry: () => void; onProbe: () => void }) {
  const { error } = result;
  const titles: Record<string, string> = {
    quota: 'The lab test is unavailable right now',
    rate_limited: 'Please wait a moment',
    busy: 'The analysis service is busy',
    invalid: 'This address cannot be analysed',
    lighthouse: 'Google could not load this page',
    timeout: 'The test took too long',
    network: 'The analysis service could not be reached',
    unknown: 'The analysis did not complete',
  };
  return (
    <Card className="border-warn/60">
      <div role="alert">
        <h3 className="text-lg font-semibold text-warn">{titles[error.kind] ?? titles.unknown}</h3>
        <p className="mt-2 text-sm">{error.message}</p>
        <p className="mt-2 text-sm text-muted">No lab or real-user results are shown, because none were measured.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {error.kind !== 'invalid' && <Button onClick={onRetry}>Try again</Button>}
        <a
          href={pageSpeedSiteUrl(url, strategy)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink no-underline hover:border-cyan hover:no-underline"
        >
          Open on PageSpeed Insights ↗
        </a>
        {canProbe && (
          <Button variant="ghost" onClick={onProbe}>
            Time it from my browser instead
          </Button>
        )}
      </div>
    </Card>
  );
}

export type ProbeState = { state: 'off' } | { state: 'running'; samples: ProbeSample[] } | { state: 'ok'; summary: ProbeSummary } | { state: 'cancelled' };

export function ProbeSection({ state, count }: { state: ProbeState; count: number }) {
  if (state.state === 'off') return null;
  const samples = state.state === 'running' ? state.samples : state.state === 'ok' ? state.summary.samples : [];
  const s = state.state === 'ok' ? state.summary : null;
  const breakdown = s?.samples.find((x) => x.breakdown)?.breakdown;
  return (
    <Card aria-labelledby="probe-h">
      <SectionTitle id="probe-h" badge={<Badge tone="cyan">Browser probe · your network</Badge>}>
        From your browser
      </SectionTitle>
      {state.state === 'cancelled' ? (
        <p className="mt-2 text-sm text-muted">Cancelled.</p>
      ) : (
        <>
          {s && (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label="Successful" value={`${s.successful} of ${s.samples.length}`} />
              <Fact label="First request" value={fmtMs(s.firstMs)} hint="includes connection setup" />
              <Fact label="Median of repeats" value={fmtMs(s.repeatMedianMs)} />
              <Fact label="Range" value={`${fmtMs(s.minMs)} – ${fmtMs(s.maxMs)}`} />
            </dl>
          )}
          {state.state === 'running' && (
            <p className="mt-2 text-sm text-cyan">
              Request {samples.length} of {count}…
            </p>
          )}
          <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {samples.map((x) => (
              <li key={x.attempt}>
                <span className="text-muted">#{x.attempt}</span> {x.ok ? <span className="tabular-nums">{fmtMs(x.totalMs)}</span> : <span className="text-danger">{x.error}</span>}
              </li>
            ))}
          </ol>
          <h4 className="mt-4 text-sm font-semibold">Connection timing (DNS, TCP, TLS)</h4>
          {breakdown ? (
            <p className="mt-1 text-sm tabular-nums">
              DNS {fmtMs(breakdown.dnsMs)} · connect {fmtMs(breakdown.connectMs)} · TLS {fmtMs(breakdown.tlsMs)} · waiting {fmtMs(breakdown.waitMs)} · download {fmtMs(breakdown.downloadMs)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              Not available. Browsers only share these times for another site when that site sends a <code>Timing-Allow-Origin</code> header. Status codes are never visible to
              this check.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

export function Boundary() {
  return (
    <Card aria-labelledby="boundary-h" className="border-cyan/40">
      <SectionTitle id="boundary-h">What this report can and cannot see</SectionTitle>
      <div className="mt-2 grid gap-4 text-sm md:grid-cols-2">
        <div>
          <h4 className="font-semibold text-teal">It can see</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>What a visitor’s browser can observe in a page load: status, redirects, how long the server took to answer, every file the page loads, and when content appears.</li>
            <li>Google’s own checks on images, CSS, JavaScript and caching.</li>
            <li>Real Chrome visitors’ experience, when Google has enough data.</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-warn">It cannot see</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Inside the server: application code, functions, database queries or calls to internal services. A slow server response says the server was slow, not why. Those
              details need an instrumented trace.
            </li>
            <li>Pages behind a login, or how the page behaves for logged-in users.</li>
            <li>
              For server-side timing, use your hosting or monitoring tools, or <Link to="/analyze/upload">investigate a trace</Link> if your application records traces.
              TraceDetective never asks for your source code.
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function Methodology({ strategy, probeCount }: { strategy: Strategy; probeCount: number }) {
  return (
    <details className="rounded-2xl border border-line bg-surface p-5 text-sm">
      <summary className="cursor-pointer font-semibold">How these numbers were measured</summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
        <li>
          <strong className="text-ink">Lab test</strong>: Google PageSpeed Insights runs Lighthouse from Google’s data centres
          {strategy === 'mobile' ? ', emulating a mid-range phone on slow 4G' : ' with a desktop profile'}. Metrics are simulated from one observed page load. One run is one
          sample.
        </li>
        <li>
          <strong className="text-ink">Requests and frames</strong>: the network log and screenshots Lighthouse recorded during that load, with observed (not simulated)
          timings.
        </li>
        <li>
          <strong className="text-ink">Real users</strong>: the Chrome UX Report, collected from Chrome users who opted in, over a rolling 28-day window, at the 75th
          percentile. Shown only when Google has enough data.
        </li>
        <li>
          <strong className="text-ink">Findings</strong> appear only when a value crosses a published threshold or a PageSpeed check fails. Savings are PageSpeed’s own
          estimates. Each finding is assigned to the loading stage its measurement belongs to.
        </li>
        <li>
          <strong className="text-ink">Platform detection</strong>: a platform is named only when files from its own locations appear in the request list (for example{' '}
          <code>/wp-content/</code>, <code>/_next/static/</code> or <code>cdn.shopify.com</code>). The report shows the method and an example file. A match means the page
          loads that platform’s files; no match means nothing.
        </li>
        <li>
          <strong className="text-ink">Browser probe</strong> (optional): {probeCount} sequential <code>GET</code> requests from your browser with <code>mode: no-cors</code>, no
          cookies, no referrer and caching disabled. DNS, TCP and TLS times appear only when the site sends a <code>Timing-Allow-Origin</code> header.
        </li>
        <li>Ratings use the Core Web Vitals boundaries (LCP 2.5 s / 4 s, CLS 0.1 / 0.25, INP 200 / 500 ms) and Lighthouse boundaries for lab-only metrics.</li>
      </ul>
    </details>
  );
}
