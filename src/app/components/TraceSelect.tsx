import { useTraces } from '../store';

export function TraceSelect({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const { traces } = useTraces();
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-line bg-navy px-3 py-2">
        <option value="">Select a trace…</option>
        {traces.map((t) => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
      </select>
    </label>
  );
}
