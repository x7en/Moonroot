import type { DerivedCycle } from '../cycles/cycles';
import { addDays, diffDays } from '../model/dates';
import type { DateKey, DayLog, Flow, MedicineEntry } from '../model/types';

export interface ConfidenceArcGeometry {
  readonly clampedScore: number;
  readonly ratio: number;
  readonly startAngleDeg: number;
  readonly endAngleDeg: number;
  readonly sweepAngleDeg: number;
  readonly trackStart: { x: number; y: number };
  readonly trackEnd: { x: number; y: number };
  readonly fillEnd: { x: number; y: number };
  readonly largeArcFill: 0 | 1;
}

export interface ForecastRibbonPoint {
  readonly date: DateKey;
  readonly index: number;
  readonly isToday: boolean;
  readonly flow: Flow | null;
  readonly dotRadius: number;
  readonly inLikely: boolean;
  readonly inPossible: boolean;
}

export interface CycleBarItem {
  readonly id: string;
  readonly startDate: DateKey;
  readonly lengthDays: number;
  readonly approximate: boolean;
  readonly heightRatio: number;
}

export interface CycleBarsChartData {
  readonly bars: readonly CycleBarItem[];
  readonly medianDays: number | null;
  readonly ageBandLow: number;
  readonly ageBandHigh: number;
  readonly minScaleDays: number;
  readonly maxScaleDays: number;
}

export interface MedicineWeeklySeriesItem {
  readonly key: string;
  readonly genericName: string;
  readonly counts: readonly [number, number, number, number];
  readonly units: readonly [number, number, number, number];
  readonly totalMg: readonly [number, number, number, number];
}

export interface MedicineWeeklyChartData {
  readonly weeks: readonly { label: string; from: DateKey; to: DateKey }[];
  readonly series: readonly MedicineWeeklySeriesItem[];
  readonly maxCount: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Number((cx + r * Math.cos(rad)).toFixed(2)),
    y: Number((cy + r * Math.sin(rad)).toFixed(2)),
  };
}

export function buildConfidenceArcGeometry(
  score: number,
  cx = 120,
  cy = 96,
  r = 68,
): ConfidenceArcGeometry {
  const clampedScore = Math.max(10, Math.min(95, score));
  const ratio = (clampedScore - 10) / 85;
  const startAngleDeg = -210;
  const endAngleDeg = 30;
  const sweepAngleDeg = Number((ratio * 240).toFixed(2));
  const currentAngleDeg = startAngleDeg + sweepAngleDeg;

  return {
    clampedScore,
    ratio,
    startAngleDeg,
    endAngleDeg,
    sweepAngleDeg,
    trackStart: polarToCartesian(cx, cy, r, startAngleDeg),
    trackEnd: polarToCartesian(cx, cy, r, endAngleDeg),
    fillEnd: polarToCartesian(cx, cy, r, currentAngleDeg),
    largeArcFill: sweepAngleDeg > 180 ? 1 : 0,
  };
}

function flowDotRadius(flow: Flow | null): number {
  if (flow === 'heavy') return 7.5;
  if (flow === 'medium') return 6;
  if (flow === 'light') return 4.5;
  if (flow === 'unsure') return 3.5;
  if (flow === 'spotting') return 3;
  return 0;
}

export function buildForecastRibbon(params: {
  today: DateKey;
  dayLogs: readonly DayLog[];
  likely: readonly [DateKey, DateKey] | null;
  possible: readonly [DateKey, DateKey] | null;
}): ForecastRibbonPoint[] {
  const { today, dayLogs, likely, possible } = params;
  const byDate = new Map(dayLogs.map((l) => [l.date, l]));
  const start = addDays(today, -14);
  const points: ForecastRibbonPoint[] = [];

  for (let i = 0; i < 30; i += 1) {
    const date = addDays(start, i);
    const log = byDate.get(date);
    const flow = log?.flow ?? null;
    points.push({
      date,
      index: i,
      isToday: date === today,
      flow,
      dotRadius: flowDotRadius(flow),
      inLikely: likely !== null && date >= likely[0] && date <= likely[1],
      inPossible: possible !== null && date >= possible[0] && date <= possible[1],
    });
  }

  return points;
}

export function buildCycleBars(
  cycles: readonly DerivedCycle[],
  ageBandHigh = 38,
): CycleBarsChartData {
  const valid = cycles.filter((c) => c.isValidLength).slice(-12);
  if (valid.length === 0) {
    return {
      bars: [],
      medianDays: null,
      ageBandLow: 21,
      ageBandHigh,
      minScaleDays: 0,
      maxScaleDays: Math.max(50, ageBandHigh + 6),
    };
  }

  const lengths = valid.map((c) => c.lengthDays).sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  const medianDays =
    lengths.length % 2 === 1
      ? (lengths[mid] ?? null)
      : Math.round(((lengths[mid - 1] ?? 0) + (lengths[mid] ?? 0)) / 2);

  const maxObserved = Math.max(...lengths, ageBandHigh, 45);
  const maxScaleDays = Math.ceil((maxObserved + 4) / 5) * 5;

  return {
    bars: valid.map((c) => ({
      id: c.id,
      startDate: c.startDate,
      lengthDays: c.lengthDays,
      approximate: c.approximate,
      heightRatio: Number((c.lengthDays / maxScaleDays).toFixed(4)),
    })),
    medianDays,
    ageBandLow: 21,
    ageBandHigh,
    minScaleDays: 0,
    maxScaleDays,
  };
}

export function buildMedicineWeeklySeries(
  medicines: readonly MedicineEntry[],
  today: DateKey,
): MedicineWeeklyChartData {
  const weeks = [
    { label: 'W-3', from: addDays(today, -27), to: addDays(today, -21) },
    { label: 'W-2', from: addDays(today, -20), to: addDays(today, -14) },
    { label: 'W-1', from: addDays(today, -13), to: addDays(today, -7) },
    { label: 'This wk', from: addDays(today, -6), to: today },
  ] as const;

  const grouped = new Map<
    string,
    {
      genericName: string;
      counts: [number, number, number, number];
      units: [number, number, number, number];
      totalMg: [number, number, number, number];
    }
  >();

  for (const entry of medicines) {
    if (entry.kind !== 'dose') continue;
    const daysAgo = diffDays(entry.date, today);
    if (daysAgo < 0 || daysAgo > 27) continue;
    const weekIdx = daysAgo <= 6 ? 3 : daysAgo <= 13 ? 2 : daysAgo <= 20 ? 1 : 0;

    const genericName = (entry.genericName ?? entry.nameShown).trim();
    const key = genericName.toLowerCase();
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = {
        genericName,
        counts: [0, 0, 0, 0],
        units: [0, 0, 0, 0],
        totalMg: [0, 0, 0, 0],
      };
      grouped.set(key, bucket);
    }

    const u = entry.units ?? 1;
    bucket.counts[weekIdx] = (bucket.counts[weekIdx] ?? 0) + 1;
    bucket.units[weekIdx] = (bucket.units[weekIdx] ?? 0) + u;
    if (entry.strengthMg !== null && Number.isFinite(entry.strengthMg)) {
      bucket.totalMg[weekIdx] = (bucket.totalMg[weekIdx] ?? 0) + u * entry.strengthMg;
    }
  }

  const series = Array.from(grouped.entries()).map(([key, item]) => ({
    key,
    genericName: item.genericName,
    counts: item.counts,
    units: item.units,
    totalMg: item.totalMg,
  }));

  let maxCount = 0;
  for (const s of series) {
    for (const c of s.counts) {
      if (c > maxCount) maxCount = c;
    }
  }

  return {
    weeks,
    series,
    maxCount: Math.max(1, maxCount),
  };
}
