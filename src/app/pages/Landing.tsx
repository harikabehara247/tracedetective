import { Link } from 'react-router-dom';
import { SITE } from '../config';
import { sampleTraceId } from '../store';
import { ButtonLink, Card, Logo, useDocumentTitle } from '../ui';

const ENTRY = [
  {
    title: 'Analyze website',
    body: 'Measure a public site or API from outside: HTTP status, redirects, server response time and page-load metrics, with the method shown next to every number.',
    to: '/analyze/url',
    cta: 'Analyze a website',
  },
  {
    title: 'Upload trace',
    body: 'Drop in an OpenTelemetry OTLP JSON or TraceDetective JSON trace and see which operation took the time. It is analysed entirely in your browser.',
    to: '/analyze/upload',
    cta: 'Import a trace',
  },
  {
    title: 'Explore demo',
    body: 'Open one of four synthetic traces: a healthy request, a slow database query, a slow external dependency and a failing dependency.',
    to: '/examples',
    cta: 'Browse examples',
  },
];

const STEPS = [
  ['Load', 'Analyze a website, import a trace (OTLP JSON or TraceDetective JSON), or pick a sample.'],
  ['See', 'A nested waterfall and span tree show where the request spent its time, with the critical path highlighted.'],
  ['Investigate', 'Rule-based insights point at dominant spans, errors and unexplained time, with evidence and what to check next.'],
  ['Share', 'Export a JSON report with provenance, or print a clean report to PDF.'],
];

const FEATURES = [
  ['Correct timing', 'Self time uses the union of child intervals, so concurrent work is never double-counted.'],
  ['Critical path', 'Follows what the request was actually waiting on, from the last span to finish back to the start.'],
  ['Evidence, not guesses', 'Every insight lists the spans and numbers behind it, alternatives to consider and a caveat.'],
  ['Keyboard and screen reader friendly', 'The timeline is a navigable tree, with status shown by text as well as colour.'],
  ['Compare two requests', 'Put a healthy trace next to a slow one and see what changed, appeared or started failing.'],
  ['No account, no tracking', 'Static site. No login, no ads, no analytics and no cookies.'],
];

export function Landing() {
  useDocumentTitle('');
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            Find the bottleneck.
            <br />
            <span className="bg-gradient-to-r from-cyan to-violet bg-clip-text text-transparent">Understand the cause.</span>
            <br />
            Fix it faster.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            {SITE.name} is a free, open-source tool for investigating slow websites and API requests. Check a public URL from outside, or load a
            trace and see where the time went, what the request was waiting on, and what to check next.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink to="/analyze" variant="primary">
              Start analysis
            </ButtonLink>
            <ButtonLink to={`/trace/${sampleTraceId('slow-database')}`}>Try the demo</ButtonLink>
            {SITE.repoUrl && (
              <a href={SITE.repoUrl} className="inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold text-muted no-underline hover:bg-surface-2 hover:text-ink hover:no-underline">
                View on GitHub
              </a>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <Logo className="w-full" />
        </div>
      </section>

      <section aria-labelledby="start-h">
        <h2 id="start-h" className="mb-4 text-2xl font-bold">Start here</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {ENTRY.map((e) => (
            <Card key={e.title} as="article" className="flex flex-col">
              <h3 className="text-lg font-semibold">{e.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted">{e.body}</p>
              <Link to={e.to} className="mt-4 font-semibold">
                {e.cta} →
              </Link>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-h">
        <h2 id="how-h" className="mb-4 text-2xl font-bold">How it works</h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <span className="text-sm font-semibold text-violet">Step {i + 1}</span>
              <h3 className="mt-1 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features-h">
        <h2 id="features-h" className="mb-4 text-2xl font-bold">What it does</h2>
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([t, b]) => (
            <li key={t} className="rounded-2xl border border-line bg-surface p-5">
              <h3 className="font-semibold text-teal">{t}</h3>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacy-h" className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 id="privacy-h" className="text-xl font-bold">Privacy first</h2>
          <p className="mt-2 text-sm text-muted">
            Traces are parsed and analysed in your browser and are never sent to a server. Sensitive-looking attributes such as tokens and passwords are
            redacted on import. Website analysis sends only the address you enter to Google PageSpeed Insights. <Link to="/docs#privacy">Privacy details</Link>
          </p>
        </Card>
        <Card>
          <h2 className="text-xl font-bold">Open source</h2>
          <p className="mt-2 text-sm text-muted">
            {SITE.name} is {SITE.license} licensed and created by {SITE.creator}. It is an investigation aid, not a production monitoring system.{' '}
            <Link to="/docs#limitations">Read the limitations</Link>
          </p>
        </Card>
      </section>
    </div>
  );
}
