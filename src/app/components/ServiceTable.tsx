import { formatMs, formatPct, type TraceAnalysis } from '../../core';
import { serviceColors } from './Waterfall';

export function ServiceTable({ analysis }: { analysis: TraceAnalysis }) {
  const colors = serviceColors(analysis);
  return (
    <div className="relative overflow-x-auto focus-visible:ring-2 focus-visible:ring-cyan" tabIndex={0} role="region" aria-label="Time by service (scrollable)">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Time by service</caption>
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="py-2 pr-3">Service</th>
            <th scope="col" className="py-2 pr-3 text-right">Spans</th>
            <th scope="col" className="py-2 pr-3 text-right">Self time</th>
            <th scope="col" className="py-2 pr-3 text-right">On critical path</th>
            <th scope="col" className="py-2 text-right">Errors</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {analysis.services.map((s) => (
            <tr key={s.service} className="border-t border-line">
              <th scope="row" className="py-2 pr-3 font-medium">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colors.get(s.service) }} aria-hidden="true" />
                {s.service}
              </th>
              <td className="py-2 pr-3 text-right">{s.spanCount}</td>
              <td className="py-2 pr-3 text-right">{formatMs(s.selfMs)}</td>
              <td className="py-2 pr-3 text-right">
                {formatMs(s.criticalMs)} <span className="text-muted">({formatPct(s.criticalMs / (analysis.durationMs || 1))})</span>
              </td>
              <td className={`py-2 text-right ${s.errorCount ? 'font-semibold text-danger' : ''}`}>{s.errorCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
