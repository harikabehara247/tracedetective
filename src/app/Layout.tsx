import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { SITE } from './config';
import { Logo } from './ui';
import { Tour, openTour } from './components/Tour';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/analyze/url', label: '1 · Analyze a website' },
  { to: '/reports', label: '2 · Reports' },
  { to: '/analyze/upload', label: '3 · Investigate a trace' },
  { to: '/compare', label: 'Compare traces' },
  { to: '/examples', label: 'Explore examples' },
  { to: '/docs', label: 'Docs' },
  { to: '/about', label: 'About' },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium no-underline hover:no-underline ${
                isActive ? 'bg-violet/15 text-ink ring-1 ring-violet/50' : 'text-muted hover:bg-surface-2 hover:text-ink'
              }`
            }
          >
            {n.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Move focus to the main region on route change for screen-reader and keyboard users.
  // Not on the first load, so the skip link stays the first Tab stop.
  const firstLoad = useRef(true);
  useEffect(() => {
    setOpen(false);
    if (firstLoad.current && !location.hash) {
      firstLoad.current = false;
      return;
    }
    firstLoad.current = false;
    const target = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
    if (target) {
      target.scrollIntoView();
      target.focus({ preventScroll: true });
    } else {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    drawerRef.current?.querySelector<HTMLElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only z-50 rounded bg-violet px-3 py-2 text-navy focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      {/* Mobile top bar */}
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-navy/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link to="/" aria-label="TraceDetective home" className="block w-40">
          <Logo />
        </Link>
        <button
          ref={toggleRef}
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-sm"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div
            id="mobile-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] border-r border-line bg-surface p-4"
          >
            <nav aria-label="Main">
              <NavItems onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-surface/60 p-4 lg:flex">
        <Link to="/" aria-label="TraceDetective home" className="mb-6 block">
          <Logo />
        </Link>
        <nav aria-label="Main">
          <NavItems />
        </nav>
        <div className="mt-auto space-y-1 text-xs text-muted">
          <p>Runs in your browser. Traces are never uploaded.</p>
          <p>Free and open source ({SITE.license}).</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 outline-none md:px-8 md:py-10">
          <Outlet />
        </main>
        <footer className="no-print border-t border-line px-4 py-6 text-sm text-muted md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 md:flex-row md:justify-between">
            <p>
              {SITE.name} · Created and maintained by {SITE.creator} · {SITE.license} licensed
            </p>
            <p className="flex gap-4">
              <button type="button" className="text-cyan underline-offset-2 hover:underline" onClick={openTour}>Take the tour</button>
              <Link to="/docs#privacy">Privacy</Link>
              <Link to="/docs#limitations">Limitations</Link>
              {SITE.repoUrl && <a href={SITE.repoUrl}>GitHub</a>}
            </p>
          </div>
        </footer>
      </div>
      <Tour />
    </div>
  );
}
