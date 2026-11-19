import type { Finding } from '../../core';
import { SeverityBadge } from '../ui';

/** Evidence rows that name a span link to it; numeric rows stay plain text. */
const SPAN_LABELS = new Set(['Span', 'Errored span', 'Called via', 'Also marked as error', 'Largest critical-path contributor']);
const linksToSpan = (label: string) => SPAN_LABELS.has(label) || /^Call \d+$/.test(label);

export function Findings({ findings, onSelectSpan, printable = false }: { findings: Finding[]; onSelectSpan?: (id: string) => void; printable?: boolean }) {
  return (
    <ol className="space-y-4">
      {findings.map((f) => (
        <li key={f.id} id={`finding-${f.id}`} tabIndex={-1} className="print-plain rounded-xl border border-line bg-surface-2 p-4 outline-none">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <h3 className="font-semibold">{f.title}</h3>
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-teal">Observation</dt>
              <dd>{f.observation}</dd>
            </div>
            <div>
              <dt className="font-semibold text-teal">Evidence</dt>
              <dd>
                <ul className="mt-1 space-y-0.5">
                  {f.evidence.map((e, i) => (
                    <li key={i} className="flex flex-wrap gap-x-2">
                      <span className="text-muted">{e.label}:</span>
                      {e.spanId && onSelectSpan && !printable && linksToSpan(e.label) ? (
                        <button type="button" className="break-all text-left text-cyan underline-offset-2 hover:underline" onClick={() => onSelectSpan(e.spanId!)}>
                          {e.value}
                        </button>
                      ) : (
                        <span className="break-all">{e.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-teal">Possible explanations</dt>
              <dd>
                <ul className="mt-1 list-disc pl-5">
                  {f.possibleExplanations.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-teal">Verify next</dt>
              <dd>
                <ul className="mt-1 list-disc pl-5">
                  {f.verifyNext.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </dd>
            </div>
            <div className="rounded-lg border border-warn/40 bg-warn/5 p-2 text-warn">
              <dt className="sr-only">Caveat</dt>
              <dd>Caveat: {f.caveat}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
