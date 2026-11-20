import type { PageSpeedResult, Strategy } from '../../core';
import type { CheckParams } from './UrlForm';

const STORAGE_KEY = 'tracedetective.website-reports.v1';
const MAX_REPORTS = 5;
const MAX_STORAGE_CHARS = 2_000_000;

export interface SavedWebsiteReport {
  id: string;
  url: string;
  host: string;
  notes: string[];
  startedAt: string;
  finishedAt: string;
  params: CheckParams;
  results: Partial<Record<Strategy, PageSpeedResult>>;
}

export function readWebsiteReports(): SavedWebsiteReport[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSavedReport).slice(0, MAX_REPORTS) : [];
  } catch {
    return [];
  }
}

export function saveWebsiteReport(report: SavedWebsiteReport): boolean {
  try {
    const reports = [report, ...readWebsiteReports().filter((item) => item.id !== report.id)].slice(0, MAX_REPORTS);
    let serialized = JSON.stringify(reports);
    if (serialized.length > MAX_STORAGE_CHARS) {
      // Filmstrips are the largest part of a Lighthouse response. Keep the main screenshot,
      // request evidence and metrics so the saved diagnosis remains useful.
      serialized = JSON.stringify(reports.map((item) => withoutFilmstrip(item)));
    }
    if (serialized.length > MAX_STORAGE_CHARS) {
      serialized = JSON.stringify(reports.map((item) => withoutImages(item)));
    }
    if (serialized.length > MAX_STORAGE_CHARS) return false;
    sessionStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

function withoutFilmstrip(report: SavedWebsiteReport): SavedWebsiteReport {
  return {
    ...report,
    results: Object.fromEntries(Object.entries(report.results).map(([device, result]) => [device, trimResult(result, false)])) as SavedWebsiteReport['results'],
  };
}

function withoutImages(report: SavedWebsiteReport): SavedWebsiteReport {
  return {
    ...report,
    results: Object.fromEntries(Object.entries(report.results).map(([device, result]) => [device, trimResult(result, true)])) as SavedWebsiteReport['results'],
  };
}

function trimResult(result: PageSpeedResult | undefined, removeScreenshot: boolean): PageSpeedResult | undefined {
  if (!result?.ok) return result;
  const summary = { ...result.summary, filmstrip: undefined };
  if (removeScreenshot) summary.screenshot = undefined;
  return { ...result, summary };
}

function isSavedReport(value: unknown): value is SavedWebsiteReport {
  if (!value || typeof value !== 'object') return false;
  const report = value as Partial<SavedWebsiteReport>;
  return typeof report.id === 'string' && typeof report.url === 'string' && !!report.results && typeof report.results === 'object';
}
