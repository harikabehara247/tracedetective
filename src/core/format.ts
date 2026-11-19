export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const abs = Math.abs(ms);
  if (abs >= 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (abs >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  if (abs >= 100) return `${Math.round(ms)} ms`;
  if (abs >= 1) return `${Number(ms.toFixed(1))} ms`;
  if (abs === 0) return '0 ms';
  return `${Number(ms.toFixed(3))} ms`;
}

export function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—';
  const pct = fraction * 100;
  return `${Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1))}%`;
}

export function formatSignedMs(ms: number): string {
  return `${ms > 0 ? '+' : ms < 0 ? '−' : '±'}${formatMs(Math.abs(ms))}`;
}

export function formatSignedPct(fraction: number | null): string {
  if (fraction === null) return 'new (baseline 0 ms)';
  return `${fraction > 0 ? '+' : fraction < 0 ? '−' : '±'}${formatPct(Math.abs(fraction))}`;
}
