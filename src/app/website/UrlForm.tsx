import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SELECTABLE_PLATFORMS, normalizeUrl, type SelectablePlatform, type Strategy } from '../../core';
import { SITE } from '../config';
import { Button } from '../ui';

export interface CheckParams {
  url: string;
  device: Strategy;
  /** Optional platform for platform-specific notes. Empty means platform-neutral. */
  platform: SelectablePlatform | '';
  probe: boolean;
}

/** The report page's address. Opening it runs the check, so it doubles as a share link. */
export function reportPath(p: CheckParams): string {
  const q = new URLSearchParams({ url: p.url, device: p.device });
  if (p.platform) q.set('platform', p.platform);
  if (p.probe) q.set('probe', '1');
  return `/analyze/url?${q.toString()}`;
}

export function parseCheckParams(search: URLSearchParams): CheckParams | null {
  const url = search.get('url');
  if (!url) return null;
  const device = search.get('device') === 'desktop' ? 'desktop' : 'mobile';
  const chosen = search.get('platform') ?? '';
  const platform = SELECTABLE_PLATFORMS.find((x) => x.id === chosen)?.id ?? '';
  return { url, device, platform, probe: search.get('probe') === '1' };
}

const PROBE_COUNT = 5;

export function UrlForm({ initial, running = false, onCancel, compact = false }: { initial?: Partial<CheckParams>; running?: boolean; onCancel?: () => void; compact?: boolean }) {
  const navigate = useNavigate();
  const [input, setInput] = useState(initial?.url ?? '');
  const [device, setDevice] = useState<Strategy>(initial?.device ?? 'mobile');
  const [platform, setPlatform] = useState<SelectablePlatform | ''>(initial?.platform ?? '');
  const [probe, setProbe] = useState(!!initial?.probe);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial?.url !== undefined) setInput(initial.url);
    if (initial?.device) setDevice(initial.device);
    setPlatform(initial?.platform ?? '');
    setProbe(!!initial?.probe);
  }, [initial?.url, initial?.device, initial?.platform, initial?.probe]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = normalizeUrl(input);
    if (!n.ok) {
      setError(n.error);
      return;
    }
    setError(null);
    setInput(n.url);
    // A new nonce makes the same address run again when submitted twice.
    navigate(`${reportPath({ url: n.url, device, platform, probe })}&run=${Date.now().toString(36)}`);
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate aria-label="Analyze a website">
      <label htmlFor="url-input" className="sr-only">
        Website URL
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="url-input"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://www.example.com/page"
          aria-invalid={!!error}
          aria-describedby={error ? 'url-error' : 'url-help'}
          disabled={running}
          className="min-w-0 flex-1 rounded-lg border border-line bg-navy px-3 py-3 text-base"
        />
        {running && onCancel ? (
          <Button onClick={onCancel} className="py-3">
            Cancel
          </Button>
        ) : (
          <Button type="submit" variant="primary" className="py-3 text-base">
            Analyze Website
          </Button>
        )}
      </div>

      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2" disabled={running}>
        <legend className="sr-only">Test device</legend>
        <span className="text-sm text-muted" aria-hidden="true">
          Test as
        </span>
        <div className="inline-flex rounded-lg border border-line bg-navy p-1">
          {(['mobile', 'desktop'] as const).map((d) => (
            <label
              key={d}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan ${
                device === d ? 'bg-violet text-navy' : 'text-muted hover:text-ink'
              }`}
            >
              <input type="radio" name="device" value={d} checked={device === d} onChange={() => setDevice(d)} className="sr-only" />
              {d === 'mobile' ? 'Mobile' : 'Desktop'}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p id="url-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="url-help" className="text-xs text-muted">
          Any public page, on any platform. The address is sent to Google PageSpeed Insights{SITE.psiProxyUrl ? ' through the TraceDetective analysis service' : ''}. No
          account, API key, files or plugin needed. <Link to="/docs#privacy">Privacy</Link>
        </p>
      )}

      {!compact && (
        <details className="rounded-xl border border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Advanced options</summary>
          <div className="mt-3">
            <label htmlFor="platform-select" className="font-semibold">
              Platform-specific notes
            </label>
            <p id="platform-help" className="text-muted">
              Advice is platform-neutral by default. A platform is named only when its files appear in the request list, and the report says how it was detected. Choose one
              here to add its notes even when it is not detected.
            </p>
            <select
              id="platform-select"
              aria-describedby="platform-help"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SelectablePlatform | '')}
              disabled={running}
              className="mt-2 rounded-lg border border-line bg-navy px-3 py-2"
            >
              <option value="">None (platform-neutral)</option>
              {SELECTABLE_PLATFORMS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <label className="mt-3 flex gap-3">
            <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} disabled={running} className="mt-1" />
            <span>
              <span className="font-semibold">Also time the site from my browser ({PROBE_COUNT} requests)</span>
              <span className="mt-1 block text-muted">
                Your browser requests the address {PROBE_COUNT} times and measures how long each answer takes from your network. Browsers keep other sites’
                responses private (CORS), so this check cannot see status codes, redirects or page content, and shows DNS and connection times only if the site
                allows it. Some sites or extensions block it. No cookies are sent.
              </span>
            </span>
          </label>
        </details>
      )}
    </form>
  );
}
