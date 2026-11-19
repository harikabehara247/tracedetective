import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
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

  it('labels the URL checker as planned with no fake form', () => {
    renderAt('/analyze/url');
    expect(screen.getByText('Planned, not available yet')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
