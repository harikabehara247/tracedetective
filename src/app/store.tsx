import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { analyzeTrace, parseTraceText, validateTrace, type TraceAnalysis, type TraceSource, type ValidationIssue } from '../core';
import { SAMPLES } from '../fixtures';

export interface LoadedTrace {
  id: string;
  label: string;
  analysis: TraceAnalysis;
  source: TraceSource;
}

interface StoredUpload {
  id: string;
  label: string;
  source: TraceSource;
  text: string;
}

type AddResult = { ok: true; id: string } | { ok: false; errors: ValidationIssue[] };

interface TraceStore {
  traces: LoadedTrace[];
  get: (id: string | undefined) => LoadedTrace | undefined;
  addFromText: (text: string, source: TraceSource, byteLength?: number) => AddResult;
  remove: (id: string) => void;
}

const STORAGE_KEY = 'tracedetective:imports';

export const sampleTraceId = (sampleId: string) => `sample-${sampleId}`;

function loadSamples(): LoadedTrace[] {
  return SAMPLES.map((s) => {
    const r = validateTrace(s.data);
    if (!r.ok) throw new Error(`Built-in sample ${s.id} is invalid: ${r.errors[0]?.message}`);
    return { id: sampleTraceId(s.id), label: `${s.title} (sample)`, analysis: analyzeTrace(r.trace, r.warnings), source: { kind: 'sample', sampleId: s.id } };
  });
}

function fromStored(u: StoredUpload): LoadedTrace | undefined {
  const r = parseTraceText(u.text);
  return r.ok ? { id: u.id, label: u.label, analysis: analyzeTrace(r.trace, r.warnings), source: u.source } : undefined;
}

/** Imported traces stay in this browser tab only (sessionStorage); nothing is uploaded. */
function readStored(): StoredUpload[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as StoredUpload[]) : [];
  } catch {
    return [];
  }
}

function writeStored(items: StoredUpload[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or blocked: imports still work for this page view.
  }
}

const Ctx = createContext<TraceStore | null>(null);

export function TraceStoreProvider({ children }: { children: ReactNode }) {
  const samples = useMemo(loadSamples, []);
  const [stored, setStored] = useState<StoredUpload[]>(readStored);
  const imports = useMemo(() => stored.map(fromStored).filter((t): t is LoadedTrace => !!t), [stored]);
  const traces = useMemo(() => [...samples, ...imports], [samples, imports]);

  const get = useCallback((id: string | undefined) => traces.find((t) => t.id === id), [traces]);

  const addFromText = useCallback((text: string, source: TraceSource, byteLength?: number): AddResult => {
    const r = parseTraceText(text, byteLength);
    if (!r.ok) return r;
    const id = `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const name = r.trace.name ?? r.trace.traceId;
    const label = source.kind === 'upload' ? `${name} (${source.fileName})` : `${name} (pasted)`;
    setStored((prev) => {
      const next = [...prev, { id, label, source, text }];
      writeStored(next);
      return next;
    });
    return { ok: true, id };
  }, []);

  const remove = useCallback((id: string) => {
    setStored((prev) => {
      const next = prev.filter((u) => u.id !== id);
      writeStored(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ traces, get, addFromText, remove }), [traces, get, addFromText, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTraces(): TraceStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTraces must be used inside TraceStoreProvider');
  return ctx;
}
