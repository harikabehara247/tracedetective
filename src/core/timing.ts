export interface Interval {
  start: number;
  end: number;
}

/** Clip an interval to [lo, hi]; returns null when nothing remains. */
export function clip(interval: Interval, lo: number, hi: number): Interval | null {
  const start = Math.max(interval.start, lo);
  const end = Math.min(interval.end, hi);
  return end > start ? { start, end } : null;
}

/** Merge overlapping intervals and return them sorted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const i of sorted) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) {
      last.end = Math.max(last.end, i.end);
    } else {
      merged.push({ ...i });
    }
  }
  return merged;
}

/** Total length covered by the union of intervals (overlaps counted once). */
export function unionLength(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, i) => sum + (i.end - i.start), 0);
}

/**
 * Exclusive ("self") time of a parent: its duration minus the union of its direct
 * children's intervals clipped to the parent's bounds. Concurrent children are not
 * double-counted, and child time outside the parent (clock skew, async) is ignored.
 */
export function exclusiveTime(parent: Interval, children: Interval[]): number {
  const clipped = children.map((c) => clip(c, parent.start, parent.end)).filter((c): c is Interval => c !== null);
  return Math.max(0, parent.end - parent.start - unionLength(clipped));
}

/** Rounds to 0.001 ms to keep floating-point noise out of displayed numbers. */
export function roundMs(ms: number): number {
  return Math.round(ms * 1000) / 1000;
}
