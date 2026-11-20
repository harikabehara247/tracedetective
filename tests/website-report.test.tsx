import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/app/App';
import { TraceStoreProvider } from '../src/app/store';
import genericMobile from './fixtures/psi-synthetic-generic-mobile.json';
import genericDesktop from './fixtures/psi-synthetic-generic-desktop.json';
import wpMobile from './fixtures/psi-synthetic-wordpress-mobile.json';
import sampleOtlp from '../public/samples/tracedetective-sample-slow-database.otlp.json';

// The PageSpeed responses are synthetic fixtures (see their _note); no real site is measured.

function renderAt(path: string) {
  return render(
    <TraceStoreProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </TraceStoreProvider>,
  );
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reportFor = (url: string, extra = '') => `/analyze/url?url=${encodeURIComponent(url)}&device=mobile${extra}`;

beforeEach(() => localStorage.setItem('td:tour-done', '1'));
afterEach(() => vi.unstubAllGlobals());

describe('website report', () => {
  it('shows where the time went, grouped findings and evidence links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericMobile)));
    renderAt(reportFor('https://demo-site.example/'));
    const time = await screen.findByRole('region', { name: 'Where the time went' }).catch(() => null);
    const card = time ?? (await screen.findByRole('heading', { name: 'Where the time went' })).closest('section, div')!;
    const stages = within(screen.getByRole('list', { name: 'LCP stages' }));
    for (const stage of ['Server response', 'Resource discovery', 'Resource download', 'Rendering']) expect(stages.getByText(stage)).toBeInTheDocument();
    expect(card).toBeTruthy();
    expect(screen.getByText(/Main-thread work:/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Findings by stage' })).toBeInTheDocument();
    expect(screen.getByText(/Largest measured delay:/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /LCP .*Server response/ })).toBeInTheDocument();

    const findings = screen.getByRole('heading', { name: 'What to check next' }).closest('div')!.parentElement!;
    const first = within(findings).getAllByRole('article')[0]!;
    expect(within(first).getByText('Measured fact')).toBeInTheDocument();
    expect(within(first).getByText(/^Stage: /)).toBeInTheDocument();
    expect(within(first).getByText('What was measured')).toBeInTheDocument();
    expect(within(first).getByText('Why it may matter')).toBeInTheDocument();
    expect(within(first).getByText('Next step')).toBeInTheDocument();

    for (const a of screen.getAllByRole('link', { name: /About this check/ })) expect(a.getAttribute('href')).toMatch(/^https:\/\//);
    for (const a of screen.getAllByRole('link', { name: /Full PageSpeed report/ })) expect(a.getAttribute('href')).toMatch(/^https:\/\/pagespeed\.web\.dev\/analysis\?url=/);
  });

  it('shows the page preview, request waterfall and LCP element from the response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericMobile)));
    renderAt(reportFor('https://demo-site.example/'));
    expect(await screen.findByRole('img', { name: /Final screenshot of https:\/\/demo-site.example\/ on mobile/ })).toHaveAttribute('src', expect.stringMatching(/^data:image\//));
    expect(screen.getByText('body > img.hero')).toBeInTheDocument();
    expect(screen.getAllByText(/static\/img\/hero\.jpg/).length).toBeGreaterThan(0);
    expect(screen.getByText(/“Improve image delivery” audit lists this request for the LCP element/)).toBeInTheDocument();
    expect(screen.getAllByText('LCP').length).toBeGreaterThan(0); // waterfall marks the LCP request
    expect(screen.getByRole('columnheader', { name: 'Duration' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Longest/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /API-like · Fetch\/XHR/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'From PageSpeed data to a developer starting point' })).toBeInTheDocument();
  });

  it('keeps advice platform-neutral when no platform is detected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericMobile)));
    renderAt(reportFor('https://demo-site.example/'));
    expect(await screen.findByText(/Platform: not identified/)).toBeInTheDocument();
    const main = screen.getByRole('main');
    const form = within(main).getByRole('form', { name: 'Analyze a website' });
    expect(main.textContent!.replace(form.textContent!, '')).not.toMatch(/WordPress|Elementor/);
  });

  it('adds platform notes when the visitor chooses a platform, and says it was not detected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericMobile)));
    renderAt(reportFor('https://demo-site.example/', '&platform=wordpress'));
    expect(await screen.findByText(/WordPress notes added because you chose it \(not detected\)/)).toBeInTheDocument();
    expect(screen.getAllByText('WordPress notes').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/You chose WordPress for this check; it was not detected/).length).toBeGreaterThan(0);
  });

  it('labels a detected platform with its detection method', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(wpMobile)));
    renderAt(reportFor('https://wp-demo.example/'));
    expect(await screen.findByText('WordPress detected')).toBeInTheDocument();
    expect(screen.getByText('Elementor detected')).toBeInTheDocument();
    expect(screen.getAllByText(/Method: files under \/wp-content\//).length).toBeGreaterThan(0);
  });

  it('shows real-user data separately with its collection period', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericMobile)));
    renderAt(reportFor('https://demo-site.example/'));
    expect(await screen.findByText('Chrome UX Report · 2026-10-21 to 2026-11-17')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Real users' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lab test' })).toBeInTheDocument();
  });

  it('says real-user data is not available instead of showing empty values', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(genericDesktop)));
    renderAt('/analyze/url?url=https%3A%2F%2Fdemo-site.example%2F&device=desktop');
    expect(await screen.findByText(/Google publishes real-user data only for pages and sites with enough Chrome visits/)).toBeInTheDocument();
    expect(screen.getByText('Chrome UX Report · rolling 28 days')).toBeInTheDocument();
  });

  it('explains missing measurements and links to PageSpeed instead of guessing', async () => {
    const bare = { lighthouseResult: { finalDisplayedUrl: 'https://example.com/', configSettings: { formFactor: 'mobile' }, categories: { performance: { score: 0.5 } }, audits: { 'largest-contentful-paint': { numericValue: 5200 } } } };
    vi.stubGlobal('fetch', vi.fn(async () => json(bare)));
    renderAt(reportFor('https://example.com/'));
    expect(await screen.findByText(/PageSpeed did not return an LCP breakdown for this test/)).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed did not return a screenshot/)).toBeInTheDocument();
    expect(screen.getByText(/PageSpeed did not return the request list/)).toBeInTheDocument();
    expect(screen.getAllByText(/PageSpeed did not identify the LCP element/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Check “LCP breakdown” in the full PageSpeed report/ })).toHaveAttribute('href', expect.stringContaining('pagespeed.web.dev'));
    expect(screen.getAllByText('Not returned').length).toBeGreaterThan(0);
  });

  it('shows a failed PageSpeed test as an error, not as empty results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 500, message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST' } }, 500)));
    renderAt(reportFor('https://example.com/'));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Where the time went' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What to check next' })).not.toBeInTheDocument();
  });

  it('reruns, switches device and offers share and export', async () => {
    const fetchMock = vi.fn(async (u: string) => json(String(u).includes('strategy=desktop') ? genericDesktop : genericMobile));
    vi.stubGlobal('fetch', fetchMock);
    renderAt(reportFor('https://demo-site.example/'));
    await screen.findByRole('heading', { name: 'Where the time went' });
    expect(screen.getByRole('button', { name: 'Export Report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy share link' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run a fresh test' }));
    await screen.findByRole('heading', { name: 'Where the time went' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await userEvent.click(within(screen.getByRole('group', { name: 'Choose report device' })).getByRole('button', { name: 'desktop' }));
    expect(await screen.findByText('Chrome UX Report · rolling 28 days')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('strategy=desktop'))).toBe(true);
  });
});

describe('trace onboarding', () => {
  it('explains traces, offers a synthetic sample and a download, and states the boundary', () => {
    renderAt('/analyze/upload');
    expect(screen.getByText('A trace is a timed record of one request moving through an application and its services. It can show which measured steps took time.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Illustration of one request as a trace/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open a synthetic sample' })).toHaveAttribute('href', '/trace/sample-slow-database');
    const dl = screen.getByRole('link', { name: 'Download sample trace (synthetic, OTLP JSON)' });
    expect(dl).toHaveAttribute('href', '/samples/tracedetective-sample-slow-database.otlp.json');
    expect(dl).toHaveAttribute('download');
    expect(screen.getByRole('heading', { name: 'File formats it reads' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Getting a trace' })).toBeInTheDocument();
    expect(screen.getAllByText(/OpenTelemetry Collector/).length).toBeGreaterThan(0);
    expect(screen.getByText(/analysed in your browser and are not uploaded anywhere/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Analyze a website' }).some((a) => a.getAttribute('href') === '/analyze/url')).toBe(true);
  });

  it('imports the downloadable sample and keeps it labelled synthetic', async () => {
    renderAt('/analyze/upload');
    const text = JSON.stringify(sampleOtlp);
    fireEvent.change(screen.getByLabelText('Or paste JSON'), { target: { value: text } });
    await userEvent.click(screen.getByRole('button', { name: 'Validate pasted JSON' }));
    expect(screen.getByRole('heading', { name: 'Trace is valid' })).toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Trace is valid' }).parentElement!).getByText('Synthetic sample data')).toBeInTheDocument();
  });

  it('states on the home page that a URL cannot identify code or database causes', () => {
    renderAt('/');
    expect(screen.getByText(/It cannot identify an\s+internal database query or code function/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'From URL to next fix' })).toBeInTheDocument();
  });
});
