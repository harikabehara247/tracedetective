import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sampleTraceId } from '../store';
import { Button } from '../ui';

export const TOUR_KEY = 'td:tour-done';
const OPEN_EVENT = 'td:open-tour';

/** Opens the walkthrough from anywhere (for example a "Take the tour" button). */
export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function tourDone(): boolean {
  try {
    return window.localStorage.getItem(TOUR_KEY) === '1';
  } catch {
    return true; // storage blocked: never nag on every visit
  }
}

function markDone() {
  try {
    window.localStorage.setItem(TOUR_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

const STEPS = [
  {
    title: 'Welcome to TraceDetective',
    body: [
      'TraceDetective helps you find out why a request is slow or failing. It runs in your browser, with no account and no tracking.',
      'This short tour shows the three ways to start and how to read the results. It takes under a minute.',
    ],
  },
  {
    title: 'Three ways to start',
    body: [
      'Analyze website: enter a public address, no account or API key needed. Measures it from outside, with HTTP status, redirects, server response time and page-load metrics. It cannot see database or code timing.',
      'Upload trace: import an OpenTelemetry (OTLP JSON) or TraceDetective JSON trace to see exactly which operation took the time.',
      'Explore demo: four synthetic traces that show common problems. They are clearly labelled as synthetic.',
    ],
  },
  {
    title: 'Reading a trace',
    body: [
      'The waterfall shows each operation as a bar on a shared timeline, nested under the operation that called it.',
      'The cyan line marks the critical path: the work the request was actually waiting on. Shortening anything else will not make the request faster.',
      'Use the arrow keys to move through spans, and filters to narrow by service, errors or the critical path.',
    ],
  },
  {
    title: 'Insights you can check',
    body: [
      'Every insight lists the spans and numbers behind it, other possible explanations, and what to check next.',
      'Insights are rule based. They point you at where to look; confirm the cause with logs, query plans or profiling before changing code.',
    ],
  },
  {
    title: 'Your data stays with you',
    body: [
      'Trace files are parsed in this tab and never uploaded. Sensitive-looking attributes are redacted on import.',
      'Website analysis is the only feature that contacts another service: the address you enter is sent to Google PageSpeed Insights. No account or API key is needed.',
    ],
  },
] as const;

export function Tour() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (location.pathname === '/' && !tourDone()) {
      setStep(0);
      setOpen(true);
    }
    // Only on first render of the landing page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('h2')?.focus());
    return () => returnFocus.current?.focus?.();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        markDone();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('h2')?.focus());
  }, [step, open]);

  if (!open) return null;

  const close = () => {
    markDone();
    setOpen(false);
  };
  const go = (to: string) => {
    close();
    navigate(to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusables = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? [])];
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const s = STEPS[step]!;
  const lastStep = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/80 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={onKeyDown}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl"
      >
        <p className="text-xs font-semibold text-violet">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title" tabIndex={-1} className="mt-1 text-xl font-bold outline-none">
          {s.title}
        </h2>
        <div id="tour-body" className="mt-3 space-y-2 text-sm text-muted">
          {s.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={close}>
            {lastStep ? 'Close' : 'Skip tour'}
          </Button>
          <div className="flex flex-wrap gap-2">
            {step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}
            {lastStep ? (
              <>
                <Button onClick={() => go('/analyze/url')}>Analyze a website</Button>
                <Button variant="primary" onClick={() => go(`/trace/${sampleTraceId('slow-database')}`)}>
                  Open the demo
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
