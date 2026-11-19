import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/app/App';
import { TraceStoreProvider } from '../src/app/store';
import { SITE } from '../src/app/config';
import { parsePsi } from '../src/core/url';

function renderAt(path: string) {
  return render(
    <TraceStoreProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </TraceStoreProvider>,
  );
}

describe('trace workspace', () => {
  it('selects spans with the keyboard and updates details', async () => {
    renderAt('/trace/sample-slow-database?span=gw-1');
    const tree = screen.getByRole('tree', { name: 'Span hierarchy and timeline' });
    const first = within(tree).getAllByRole('treeitem')[0]!;
    expect(first).toHaveAttribute('aria-selected', 'true');
    first.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('heading', { level: 3, name: 'auth.v1.Tokens/Verify' })).toBeInTheDocument();
  });

  it('collapses a subtree with ArrowLeft', async () => {
    renderAt('/trace/sample-slow-database?span=ord-1');
    const tree = screen.getByRole('tree');
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(8);
    within(tree).getByRole('treeitem', { name: /order-service POST \/orders/ }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(3);
  });

  it('marks synthetic data and shows the database finding', () => {
    renderAt('/trace/sample-slow-database');
    expect(screen.getByText('Synthetic sample data')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Database call dominates the request/ })).toBeInTheDocument();
  });

  it('shows a helpful page for unknown traces and routes', () => {
    renderAt('/trace/nope');
    expect(screen.getByRole('heading', { name: 'Trace not found' })).toBeInTheDocument();
  });

});

describe('onboarding', () => {
  beforeEach(() => window.localStorage.clear());

  it('shows the three start options with what each can and cannot do', () => {
    renderAt('/analyze');
    for (const name of ['Analyze website', 'Upload trace', 'Explore demo']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getAllByText('It cannot')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Analyze a website' })).toHaveAttribute('href', '/analyze/url');
  });

  it('opens the walkthrough on the first visit, closes with Escape and remembers it', async () => {
    const { unmount } = renderAt('/');
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to TraceDetective' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Three ways to start' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('td:tour-done')).toBe('1');
    unmount();
    renderAt('/');
    expect(screen.queryByRole('dialog', { name: /Welcome/ })).not.toBeInTheDocument();
  });

  it('reopens the walkthrough from the footer', async () => {
    window.localStorage.setItem('td:tour-done', '1');
    renderAt('/docs');
    await userEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(await screen.findByRole('dialog', { name: 'Welcome to TraceDetective' })).toBeInTheDocument();
  });
});

describe('website analysis', () => {
  const psiBody = {
    lighthouseResult: {
      finalDisplayedUrl: 'https://example.com/',
      configSettings: { formFactor: 'mobile' },
      categories: { performance: { score: 0.72 } },
      audits: {
        'server-response-time': { numericValue: 900 },
        'largest-contentful-paint': { numericValue: 3100 },
        'network-requests': { details: { items: [{ url: 'https://example.com/', resourceType: 'Document', statusCode: 200, protocol: 'h2' }] } },
      },
    },
  };
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const site = SITE as { psiProxyUrl: string };

  beforeEach(() => localStorage.setItem('td:tour-done', '1'));
  afterEach(() => {
    vi.unstubAllGlobals();
    site.psiProxyUrl = '';
  });

  async function analyze(url: string) {
    await userEvent.type(screen.getByLabelText('Website URL'), url);
    await userEvent.click(screen.getByRole('button', { name: 'Analyze Website' }));
  }

  it('has no API key field and keeps device and browser probe under Advanced options', () => {
    renderAt('/analyze/url');
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/api key/i)).not.toBeInTheDocument();
    expect(screen.getByText('Advanced options')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Mobile/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Desktop/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /time the site from my browser/ })).not.toBeChecked();
    expect(screen.getByText(/CORS/)).toBeInTheDocument();
  });

  it('refuses private addresses before any request is made', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await analyze('http://192.168.1.1/admin');
    expect(screen.getByRole('alert')).toHaveTextContent(/public websites/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs keyless against Google when no proxy is configured and labels lab and real-user data', async () => {
    const fetchMock = vi.fn(async (_url: string) => json(psiBody));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await analyze('example.com');
    expect(await screen.findByRole('heading', { name: /Slow server response: 900 ms/ })).toBeInTheDocument();
    const called = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(called.hostname).toBe('www.googleapis.com');
    expect(called.searchParams.get('url')).toBe('https://example.com/');
    expect(called.searchParams.has('key')).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the browser probe is off by default
    expect(screen.getByRole('heading', { name: 'Lab test' })).toBeInTheDocument();
    expect(screen.getByText('Lighthouse · simulated')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Real users' })).toBeInTheDocument();
    expect(screen.getByText(/Google publishes real-user data only for pages and sites with enough Chrome visits/)).toBeInTheDocument();
    expect(screen.getByText('72 / 100')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Report' })).toBeInTheDocument();
  });

  it('uses the analysis service when one is configured and runs the desktop test on request', async () => {
    site.psiProxyUrl = 'https://psi.example.workers.dev/';
    const fetchMock = vi.fn(async (_url: string) => json({ summary: { ...parsePsi(psiBody) }, cached: true, fetchedAt: '2026-11-19T06:00:00.000Z' }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await userEvent.click(screen.getByText('Advanced options'));
    await userEvent.click(screen.getByRole('radio', { name: /Desktop/ }));
    await analyze('example.com');
    expect(await screen.findByRole('heading', { name: 'Lab test' })).toBeInTheDocument();
    const called = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(called.origin + called.pathname).toBe('https://psi.example.workers.dev/v1/pagespeed');
    expect(called.searchParams.get('strategy')).toBe('desktop');
    expect(called.searchParams.has('key')).toBe(false);
  });

  it('explains a used-up quota and shows no empty results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 429, message: 'Quota exceeded for quota metric' } }, 429)));
    renderAt('/analyze/url');
    await analyze('example.com');
    expect(await screen.findByRole('heading', { name: 'The lab test is unavailable right now' })).toBeInTheDocument();
    expect(screen.getByText(/quota is used up/)).toBeInTheDocument();
    expect(screen.getByText(/No lab or real-user results are shown, because none were measured/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lab test' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Real users' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open on PageSpeed Insights/ })).toHaveAttribute('href', expect.stringContaining('pagespeed.web.dev'));
    expect(screen.getByRole('button', { name: 'Time it from my browser instead' })).toBeInTheDocument();
  });

  it('asks the visitor to wait when the analysis service rate-limits them', async () => {
    site.psiProxyUrl = 'https://psi.example.workers.dev';
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { code: 'rate_limited', message: 'Too many tests' } }, 429, { 'Retry-After': '60' })));
    renderAt('/analyze/url');
    await analyze('example.com');
    expect(await screen.findByRole('heading', { name: 'Please wait a moment' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/minute|seconds/);
  });

  it('runs the optional browser probe only when chosen', async () => {
    const fetchMock = vi.fn(async (url: string) => (String(url).startsWith('https://www.googleapis.com/') ? json(psiBody) : new Response(null, { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await userEvent.click(screen.getByText('Advanced options'));
    await userEvent.click(screen.getByRole('checkbox', { name: /time the site from my browser/ }));
    await analyze('example.com');
    expect(await screen.findByRole('heading', { name: 'From your browser' })).toBeInTheDocument();
    expect(await screen.findByText('5 of 5')).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([u]) => !String(u).startsWith('https://www.googleapis.com/')).length).toBe(5);
  });
});

describe('trace import', () => {
  it('imports pasted OTLP JSON', async () => {
    renderAt('/analyze/upload');
    const otlp = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
          scopeSpans: [{ spans: [{ traceId: '5b8efff798038103d269b633813fc60c', spanId: 'eee19b7ec3c1b174', name: 'GET /cart', kind: 2, startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000250000000' }] }],
        },
      ],
    };
    const box = screen.getByLabelText('Or paste JSON');
    await userEvent.click(box);
    await userEvent.paste(JSON.stringify(otlp));
    await userEvent.click(screen.getByRole('button', { name: 'Validate pasted JSON' }));
    expect(screen.getByRole('heading', { name: 'Trace is valid' })).toBeInTheDocument();
    expect(screen.getByText('checkout · GET /cart')).toBeInTheDocument();
  });
});
