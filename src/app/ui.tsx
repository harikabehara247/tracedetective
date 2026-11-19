import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import type { Severity } from '../core';

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors no-underline hover:no-underline disabled:cursor-not-allowed disabled:opacity-50';
const variants = {
  primary: 'bg-violet text-navy hover:bg-[#b994ff]',
  secondary: 'border border-line bg-surface-2 text-ink hover:border-cyan',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
};
type Variant = keyof typeof variants;

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({ variant = 'secondary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = '', as: As = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; 'aria-labelledby'?: string }) {
  return (
    <As className={`print-plain rounded-2xl border border-line bg-surface p-5 ${className}`} {...rest}>
      {children}
    </As>
  );
}

export function SyntheticBadge({ synthetic }: { synthetic: boolean }) {
  return synthetic ? (
    <span className="inline-flex items-center rounded-full border border-warn/60 bg-warn/10 px-2.5 py-0.5 text-xs font-semibold text-warn">
      Synthetic sample data
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-teal/60 bg-teal/10 px-2.5 py-0.5 text-xs font-semibold text-teal">
      Imported trace
    </span>
  );
}

const sevStyle: Record<Severity, string> = {
  high: 'border-danger/60 bg-danger/10 text-danger',
  medium: 'border-warn/60 bg-warn/10 text-warn',
  low: 'border-cyan/60 bg-cyan/10 text-cyan',
  info: 'border-line bg-surface-2 text-muted',
};
const sevLabel: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low', info: 'Info' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${sevStyle[severity]}`}>{sevLabel[severity]}</span>;
}

export function StatusBadge({ status }: { status: 'ok' | 'error' | 'unset' }) {
  if (status === 'error') return <span className="rounded border border-danger/60 px-1.5 text-xs font-semibold text-danger">✕ error</span>;
  if (status === 'ok') return <span className="rounded border border-teal/50 px-1.5 text-xs text-teal">✓ ok</span>;
  return <span className="rounded border border-line px-1.5 text-xs text-muted">unset</span>;
}

export function PageHeader({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {children && <div className="mt-2 max-w-3xl text-muted">{children}</div>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="print-plain rounded-xl border border-line bg-surface-2 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · TraceDetective` : 'TraceDetective';
  }, [title]);
}

/** Triggers a browser download of a JSON value. Nothing leaves the device. */
export function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function Logo({ className = '' }: { className?: string }) {
  // 700×180 source; keep the aspect ratio fixed.
  return <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="TraceDetective" width={700} height={180} className={`h-auto ${className}`} />;
}
