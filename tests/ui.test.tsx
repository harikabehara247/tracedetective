import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../src/app/App';
import { TraceStoreProvider } from '../src/app/store';

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
    for (const name of ['Check website URL', 'Upload trace', 'Explore demo']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getAllByText('It cannot')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Check a URL' })).toHaveAttribute('href', '/analyze/url');
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

describe('URL check', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses private addresses before any request is made', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await userEvent.type(screen.getByLabelText('URL'), 'http://192.168.1.1/admin');
    await userEvent.click(screen.getByRole('button', { name: 'Run check' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/public websites/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows PageSpeed results, a quota error explanation and findings', async () => {
    const psiBody = {
      lighthouseResult: {
        finalDisplayedUrl: 'https://example.com/',
        configSettings: { formFactor: 'mobile' },
        audits: {
          'server-response-time': { numericValue: 900 },
          'network-requests': { details: { items: [{ url: 'https://example.com/', resourceType: 'Document', statusCode: 200, protocol: 'h2' }] } },
        },
      },
    };
    const fetchMock = vi.fn(async (url: string) =>
      String(url).startsWith('https://www.googleapis.com/') ? new Response(JSON.stringify(psiBody), { status: 200 }) : new Response(null, { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/analyze/url');
    await userEvent.type(screen.getByLabelText('URL'), 'example.com');
    await userEvent.click(screen.getByRole('checkbox', { name: /Browser probe/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Run check' }));
    expect(await screen.findByRole('heading', { name: /Slow server response: 900 ms/ })).toBeInTheDocument();
    expect(screen.getByText('h2')).toBeInTheDocument();
    expect(screen.getByText(/No protocol given/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('url=https%3A%2F%2Fexample.com%2F');
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeInTheDocument();

    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 }));
    await userEvent.click(screen.getByRole('button', { name: 'Run check' }));
    expect(await screen.findByText(/shared free quota is used up/)).toBeInTheDocument();
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
