import type { DerivedCycle } from '../cycles/cycles';
import { diffDays } from '../model/dates';
import type { DateKey, Forecast } from '../model/types';
import { weightedQuantiles } from './quantiles';

export const RECENCY_DECAY = 0.85;
export const CONFIDENCE_BASE = 10;
export const CONFIDENCE_CAP = 95;
export const CONFIDENCE_MAX_CYCLES = 8;
export const CONFIDENCE_MAX_TRACK_WINDOW = 8;
export const HIGH_VARIABILITY_S_THRESHOLD = 0.35;

export interface ConfidenceInput {
  activeCycles: readonly DerivedCycle[];
  resolvedForecasts: readonly Forecast[];
  cycles: readonly DerivedCycle[];
  newBaselineDate: DateKey | null;
}

export interface ConfidenceResult {
  score: number;
  C: number;
  S: number;
  T: number;
  effectiveCycles: number;
  iqrDays: number | null;
  resolvedCount: number;
  hitCount: number;
  meanPossibleWidth: number | null;
  highVariabilityNote: boolean;
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const { activeCycles, resolvedForecasts, cycles, newBaselineDate } = input;

  let effectiveCycles = 0;
  for (const c of activeCycles) {
    effectiveCycles += c.weight;
  }

  if (effectiveCycles === 0) {
    return {
      score: CONFIDENCE_BASE,
      C: 0,
      S: 0,
      T: 0,
      effectiveCycles: 0,
      iqrDays: null,
      resolvedCount: 0,
      hitCount: 0,
      meanPossibleWidth: null,
      highVariabilityNote: false,
    };
  }

  const C = Math.min(effectiveCycles, CONFIDENCE_MAX_CYCLES) / CONFIDENCE_MAX_CYCLES;

  const last8Cycles = activeCycles.slice(-CONFIDENCE_MAX_CYCLES);
  let iqrDays: number | null = null;
  let S = 0;

  if (effectiveCycles >= 3 && last8Cycles.length >= 2) {
    const weighted = last8Cycles.map((c, idx) => ({
      value: c.lengthDays,
      weight: c.weight * Math.pow(RECENCY_DECAY, last8Cycles.length - 1 - idx),
    }));
    const qs = weightedQuantiles(weighted);
    iqrDays = Math.max(0, qs.q75 - qs.q25);
    S = Math.max(0, 1 - iqrDays / 30) * Math.min(1, (effectiveCycles - 2) / 4);
  }

  const approxStartDates = new Set(
    cycles.filter((c) => c.approximate).map((c) => c.startDate),
  );

  const eligibleResolved = resolvedForecasts
    .filter(
      (f) =>
        f.outcome !== undefined &&
        f.basis === 'cycle-lengths' &&
        f.cyclesUsed >= 3 &&
        !approxStartDates.has(f.anchor) &&
        (newBaselineDate === null || f.anchor >= newBaselineDate),
    )
    .sort((a, b) => a.anchor.localeCompare(b.anchor));

  const last8Resolved = eligibleResolved.slice(-CONFIDENCE_MAX_TRACK_WINDOW);
  const m = last8Resolved.length;
  let T = 0;
  let hitCount = 0;
  let meanPossibleWidth: number | null = null;

  if (m >= 2) {
    let totalWidth = 0;
    for (const f of last8Resolved) {
      if (f.outcome?.inPossible) {
        hitCount += 1;
      }
      totalWidth += diffDays(f.possible[0], f.possible[1]);
    }
    const hitRate = hitCount / m;
    meanPossibleWidth = totalWidth / m;
    T = hitRate * Math.max(0, 1 - meanPossibleWidth / 60) * Math.min(1, (m - 1) / 3);
  }

  const raw = CONFIDENCE_BASE + 30 * C + 30 * S + 30 * T;
  const score = Math.min(CONFIDENCE_CAP, Math.round(raw));

  return {
    score,
    C,
    S,
    T,
    effectiveCycles,
    iqrDays,
    resolvedCount: m,
    hitCount,
    meanPossibleWidth,
    highVariabilityNote: effectiveCycles >= CONFIDENCE_MAX_CYCLES && S < HIGH_VARIABILITY_S_THRESHOLD,
  };
}
