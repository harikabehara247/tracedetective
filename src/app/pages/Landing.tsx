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
      <section aria-labelledby="hero-h" className="max-w-3xl">
        <h1 id="hero-h" className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Why is this page slow?
        </h1>
        <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-teal">Analyze a website</p>
        <p className="mt-4 text-lg text-muted">Paste a page URL. Get a visual performance report and the next things to check. No files or setup needed.</p>
        <Card className="mt-6">
          <UrlForm compact />
        </Card>
        <p className="mt-3 text-sm text-muted">
          Works for any public website, whatever it is built with. It checks what a visitor’s browser can observe in a page load. Free and open source. Results come from
          Google PageSpeed Insights and real Chrome users, with the source shown next to every number.
        </p>
      </section>

      <section aria-labelledby="report-h">
        <h2 id="report-h" className="mb-4 text-2xl font-bold">
          What the report shows
        </h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {REPORT_PARTS.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold text-teal">{t}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="limits-h" className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 id="limits-h" className="text-xl font-bold">
            What a URL check cannot see
          </h2>
          <p className="mt-2 text-sm text-muted">
            A public URL shows browser-visible delays: a slow server response, large or late files, blocking scripts and styles, layout shifts. It cannot identify an
            internal database query or code function, so it never names one as the cause. Those details need an instrumented trace. It does not need, and never asks for,
            your source code or a login.
          </p>
        </Card>
        <Card>
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
