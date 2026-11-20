import { Link } from 'react-router-dom';
import { SITE } from '../config';
import { sampleTraceId } from '../store';
import { ButtonLink, Card, useDocumentTitle } from '../ui';
import { UrlForm } from '../website/UrlForm';

const REPORT_PARTS = [
  ['Mobile and desktop', 'Lighthouse lab results for both, side by side, with HTTP status, redirects and the final address.'],
  ['Where the time went', 'The main content’s load split into server response, resource loading and rendering, plus main-thread work.'],
  ['What the visitor sees', 'A screenshot and the loading sequence from Google’s test browser.'],
  ['Every request', 'A waterfall with type, size and timing, with render-blocking files and the main content’s file marked.'],
  ['Lab and real users', 'Lab metrics next to Chrome real-user data from the last 28 days, never mixed. Shown only when Google has it.'],
  ['What to check first', 'A short, ranked list. Each item gives the measurement, its source, the stage it concerns and a practical next check.'],
];

export function Landing() {
  useDocumentTitle('');
  return (
    <div className="space-y-12">
      <section aria-labelledby="hero-h" className="relative isolate overflow-hidden rounded-3xl border border-violet/30 bg-gradient-to-br from-[#172449] via-[#121a31] to-[#171c39] p-5 shadow-xl md:p-8 lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 -z-10 h-96 w-96 rounded-full bg-violet/20 blur-3xl" />
        <div className="grid items-end gap-8 xl:grid-cols-[1.08fr_.92fr]">
          <div>
            <p className="inline-flex rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan">Priority 1 · Start with any public page</p>
            <h1 id="hero-h" className="mt-4 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-5xl">Find where a slow page loses time.</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted">Enter one URL. TraceDetective runs mobile and desktop together, shows the page previews and delay stages side by side, then gives you evidence and a practical first check.</p>
            <Card className="mt-6 border-violet/40 bg-navy/80 shadow-lg">
              <UrlForm compact />
            </Card>
            <p className="mt-3 text-xs text-muted">Works with any public website. No account, source code, plugin or trace file is required for a URL check.</p>
          </div>
          <div aria-label="Illustration of a mobile and desktop performance report" className="rounded-2xl border border-white/10 bg-[#0b1020]/80 p-4 shadow-2xl md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wide text-violet">Visual diagnosis</p><h2 className="mt-1 text-lg font-bold">Compare both screens</h2></div>
              <span className="rounded-full bg-cyan/15 px-2.5 py-1 text-xs font-semibold text-cyan">Illustration</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {(['Mobile', 'Desktop'] as const).map((device, i) => (
                <div key={device} className="rounded-xl border border-line bg-surface p-3">
                  <div className="flex items-center justify-between text-xs font-semibold"><span>{device}</span><span className={i === 0 ? 'text-danger' : 'text-teal'}>{i === 0 ? 'Needs attention' : 'Looks faster'}</span></div>
                  <div className={`mx-auto mt-3 flex h-28 items-end gap-1.5 rounded-lg border border-line bg-gradient-to-b ${i === 0 ? 'from-[#243351] to-[#111b2f]' : 'from-[#21433f] to-[#111b2f]'} p-2`}>
                    <span className="h-5 w-1/5 rounded-t bg-cyan/80" /><span className={`${i === 0 ? 'h-24' : 'h-12'} w-1/5 rounded-t bg-warn`} /><span className="h-8 w-1/5 rounded-t bg-violet" /><span className="h-4 w-1/5 rounded-t bg-danger/80" />
                  </div>
                  <p className="mt-2 text-[11px] text-muted">Page preview and loading timeline</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3">
              <div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold">Largest measured delay</span><span className="text-warn">Resource discovery</span></div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-2"><span className="w-[16%] bg-cyan"/><span className="w-[55%] bg-warn"/><span className="w-[12%] bg-violet"/><span className="w-[17%] bg-danger"/></div>
              <p className="mt-2 text-[11px] text-muted">Illustrative stages only; your report uses measured values.</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="workflow-h">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-violet">A simple workflow</p><h2 id="workflow-h" className="mt-1 text-2xl font-bold">From URL to next fix</h2></div>
          <Link to="/docs#limitations" className="text-sm text-cyan">What this check can and cannot see →</Link>
        </div>
        <ol className="grid gap-4 md:grid-cols-3">
          <li className="rounded-2xl border border-cyan/30 bg-gradient-to-br from-cyan/10 to-surface p-5"><span className="text-3xl font-black text-cyan">01</span><h3 className="mt-2 text-lg font-bold">Analyze one URL</h3><p className="mt-1 text-sm text-muted">Mobile and desktop run together. You don’t need to find or upload a trace.</p></li>
          <li className="rounded-2xl border border-warn/30 bg-gradient-to-br from-warn/10 to-surface p-5"><span className="text-3xl font-black text-warn">02</span><h3 className="mt-2 text-lg font-bold">Spot the delay</h3><p className="mt-1 text-sm text-muted">Compare screenshots, scores and colored LCP stages. Start with the largest measured delay.</p></li>
          <li className="rounded-2xl border border-violet/30 bg-gradient-to-br from-violet/10 to-surface p-5"><span className="text-3xl font-black text-violet">03</span><h3 className="mt-2 text-lg font-bold">Check evidence, then act</h3><p className="mt-1 text-sm text-muted">Open the request waterfall and ranked checks. Use Reports to return to this result later in the same tab session.</p></li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2"><ButtonLink to="/analyze/url" variant="primary">1 · Analyze a website</ButtonLink><ButtonLink to="/reports">2 · Open Reports</ButtonLink><ButtonLink to="/analyze/upload">3 · I already have a trace</ButtonLink></div>
      </section>

      <section aria-labelledby="report-h">
        <div className="mb-4"><p className="text-xs font-bold uppercase tracking-wide text-teal">What the report makes easier to see</p><h2 id="report-h" className="mt-1 text-2xl font-bold">Evidence first, explanations second</h2></div>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {REPORT_PARTS.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold text-teal">{t}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="case-study-h" className="rounded-3xl border border-cyan/25 bg-gradient-to-br from-[#111e32] via-surface to-[#1b1835] p-5 md:p-8">
        <p className="text-xs font-bold uppercase tracking-wide text-cyan">The problem and our response</p>
        <h2 id="case-study-h" className="mt-2 max-w-3xl text-2xl font-bold">A score says a page is slow. It does not always show a developer where to look next.</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
            <h3 className="text-lg font-bold text-danger">The problem we identified</h3>
            <p className="mt-2 text-sm text-muted">Performance reports contain useful measurements, but a first-time developer still has to connect the score to a visible page, a loading stage, a request and a practical first investigation.</p>
          </article>
          <article className="rounded-2xl border border-teal/30 bg-teal/5 p-5">
            <h3 className="text-lg font-bold text-teal">What TraceDetective adds</h3>
            <p className="mt-2 text-sm text-muted">It puts mobile and desktop evidence side by side, highlights the largest measured delay, links it to a file only when Lighthouse proves the match, ranks related checks, then guides a change-and-retest loop.</p>
          </article>
        </div>
        <p className="mt-4 text-sm text-muted">A URL check investigates browser-visible performance. To prove which application function, API handler or database query is slow, bring an instrumented trace; the report does not guess at hidden causes.</p>
      </section>

      <section aria-labelledby="limits-h" className="grid gap-4 md:grid-cols-2">
        <Card className="border-warn/30">
          <h2 id="limits-h" className="text-xl font-bold">
            What a URL check cannot see
          </h2>
          <p className="mt-2 text-sm text-muted">
            A public URL shows browser-visible delays: a slow server response, large or late files, blocking scripts and styles, layout shifts. It cannot identify an
            internal database query or code function, so it never names one as the cause. Those details need an instrumented trace. It does not need, and never asks for,
            your source code or a login.
          </p>
        </Card>
        <Card className="border-violet/30">
          <h2 className="text-xl font-bold">Investigate a trace (advanced)</h2>
          <p className="mt-2 text-sm text-muted">
            A trace is a timed record of one request moving through an application and its services. If your application records traces, import one to see which measured
            steps took time. It is analysed in your browser and never uploaded.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink to="/analyze/upload">What is a trace?</ButtonLink>
            <ButtonLink to={`/trace/${sampleTraceId('slow-database')}`} variant="ghost">
              Open a synthetic sample
            </ButtonLink>
          </div>
        </Card>
      </section>

      <section aria-labelledby="privacy-h" className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 id="privacy-h" className="text-xl font-bold">
            Privacy
          </h2>
          <p className="mt-2 text-sm text-muted">
            A website check sends only the address you enter to Google PageSpeed Insights. No account, no cookies, no analytics. Traces are analysed in your browser and are
            never uploaded. <Link to="/docs#privacy">Privacy details</Link>
          </p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Open source</h2>
          <p className="mt-2 text-sm text-muted">
            {SITE.name} is {SITE.license} licensed and created by {SITE.creator}. It is an investigation aid, not a monitoring system.{' '}
            <Link to="/docs#limitations">Read the limitations</Link>
            {SITE.repoUrl && (
              <>
                {' · '}
                <a href={SITE.repoUrl}>Source on GitHub</a>
              </>
            )}
          </p>
        </Card>
      </section>
    </div>
  );
}
