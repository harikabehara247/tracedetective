import { formatMs, formatPct, type Finding, type SpanNode, type TraceAnalysis } from '../../core';
import { StatusBadge } from '../ui';

export function SpanDetails({ analysis, node, onSelect }: { analysis: TraceAnalysis; node: SpanNode | undefined; onSelect: (id: string) => void }) {
  if (!node) {
    return <p className="text-muted">Select a span in the timeline to see its details.</p>;
  }
  const s = node.span;
  const related: Finding[] = analysis.findings.filter((f) => f.spanIds.includes(s.spanId));
  const attrs = Object.entries(s.attributes);
  const rows: [string, React.ReactNode][] = [
    ['Service', s.service],
    ['Kind', s.kind],
    ['Status', <StatusBadge key="s" status={s.status} />],
    ['Starts at', `${formatMs(node.startMs)} after trace start`],
    ['Duration', formatMs(s.durationMs)],
    ['Self time', `${formatMs(node.selfMs)}${s.durationMs > 0 ? ` (${formatPct(node.selfMs / s.durationMs)} of span)` : ''}`],
    ['On critical path', node.criticalMs > 0 ? `${formatMs(node.criticalMs)} (${formatPct(node.criticalMs / (analysis.durationMs || 1))} of trace)` : 'No'],
    ['Span ID', <code key="id" className="break-all text-xs">{s.spanId}</code>],
    ['Parent', node.parent ? (
      <button key="p" type="button" className="text-left text-cyan underline-offset-2 hover:underline" onClick={() => onSelect(node.parent!.span.spanId)}>
        {node.parent.span.name}
      </button>
    ) : 'None (root span)'],
    ['Children', String(node.children.length)],
  ];
  return (
    <div className="space-y-4">
      <div>
        <h3 className="break-words text-lg font-semibold">{s.name}</h3>
        <p className="text-sm text-muted">Self time excludes time covered by child spans; overlapping children are counted once.</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0 break-words tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h4 className="mb-1 text-sm font-semibold">Attributes</h4>
        {attrs.length === 0 ? (
          <p className="text-sm text-muted">No attributes.</p>
        ) : (
          <table className="w-full table-fixed text-left text-xs">
            <tbody>
              {attrs.map(([k, v]) => (
                <tr key={k} className="border-t border-line align-top">
                  <th scope="row" className="w-2/5 break-words py-1 pr-2 font-mono font-normal text-muted">{k}</th>
                  <td className="break-words py-1 font-mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {related.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">Related findings</h4>
          <ul className="list-disc pl-5 text-sm">
            {related.map((f) => (
              <li key={f.id}>
                <a href={`#finding-${f.id}`}>{f.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
