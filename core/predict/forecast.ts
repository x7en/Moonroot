import type { DerivedCycle, DerivedCycleSummary } from '../cycles/cycles';
import { addDays, diffDays, yearsSinceMenarche } from '../model/dates';
import {
  RULESET_VERSION,
  type DateKey,
  type DayLog,
  type Decision,
  type Forecast,
  type Profile,
} from '../model/types';
import { computeConfidence, RECENCY_DECAY, type ConfidenceResult } from './confidence';
import { analyzeLeadInPattern, type LeadInAnalysis } from './leadIn';
import { weightedQuantiles, type WeightedValue } from './quantiles';

export const ADULT_PRIOR_LENGTHS = [25, 28, 30, 33, 37] as const;
export const ADOLESCENT_PRIOR_LENGTHS = [23, 28, 32, 37, 43] as const;
export const PRIOR_BASE_WEIGHT = 0.4;
export const FULL_CYCLES_THRESHOLD = 8;
export const MIN_TAIL_POINTS_FOR_LIKELY = 3;
export const FALLBACK_EXTENSION_DAYS = 14;

export interface CycleWindowResult {
  anchor: DateKey | null;
  basis: 'cycle-lengths' | 'lead-in-pattern';
  daysSinceStart: number | null;
  longestGapDays: number | null;
  priorUsed: 'FIGO' | 'ACOG' | 'none';
  priorLengthRange: { q10: number; q25: number; q50: number; q75: number; q90: number };
  likely: [DateKey, DateKey] | null;
  possible: [DateKey, DateKey] | null;
  peak: DateKey | null;
  likelyWidthDays: number | null;
  possibleWidthDays: number | null;
  droppedLikelyWindow: boolean;
  confidence: ConfidenceResult;
  leadIn: LeadInAnalysis;
  forecast: Forecast | null;
}

function getPriorBand(profile: Profile, today: DateKey): 'FIGO' | 'ACOG' {
  const years = yearsSinceMenarche(profile, today);
  return years !== null && years < 3 ? 'ACOG' : 'FIGO';
}

function buildWeightedPool(
  activeCycles: readonly DerivedCycle[],
  priorBand: 'FIGO' | 'ACOG',
  effectiveN: number,
  minLengthExclusive: number,
): WeightedValue[] {
  const pool: WeightedValue[] = [];
  const totalReal = activeCycles.length;

  for (let i = 0; i < totalReal; i += 1) {
    const c = activeCycles[i];
    if (!c || c.lengthDays <= minLengthExclusive) continue;
    const age = totalReal - 1 - i;
    pool.push({
      value: c.lengthDays,
      weight: c.weight * Math.pow(RECENCY_DECAY, age),
    });
  }

  if (effectiveN < FULL_CYCLES_THRESHOLD) {
    const priorWeight = PRIOR_BASE_WEIGHT * (1 - effectiveN / FULL_CYCLES_THRESHOLD);
    const priorValues =
      priorBand === 'ACOG' ? ADOLESCENT_PRIOR_LENGTHS : ADULT_PRIOR_LENGTHS;
    for (const val of priorValues) {
      if (val > minLengthExclusive) {
        pool.push({ value: val, weight: priorWeight });
      }
    }
  }

  return pool;
}

function buildAnchorForecastOnly(input: {
  anchor: DateKey;
  madeOn: DateKey;
  profile: Profile;
  activeCyclesBeforeAnchor: readonly DerivedCycle[];
  allCyclesBeforeAnchor: readonly DerivedCycle[];
  resolvedForecastsBeforeAnchor: readonly Forecast[];
  newBaselineDate: DateKey | null;
}): Forecast {
  const {
    anchor,
    madeOn,
    profile,
    activeCyclesBeforeAnchor,
    allCyclesBeforeAnchor,
    resolvedForecastsBeforeAnchor,
    newBaselineDate,
  } = input;

  const priorBand = getPriorBand(profile, madeOn);
  const conf = computeConfidence({
    activeCycles: activeCyclesBeforeAnchor,
    resolvedForecasts: resolvedForecastsBeforeAnchor,
    cycles: allCyclesBeforeAnchor,
    newBaselineDate,
  });

  const pool = buildWeightedPool(
    activeCyclesBeforeAnchor,
    priorBand,
    conf.effectiveCycles,
    0,
  );
  const qs = weightedQuantiles(pool);
  const possible: [DateKey, DateKey] = [
    addDays(anchor, Math.round(qs.q10)),
    addDays(anchor, Math.round(qs.q90)),
  ];
  const likely: [DateKey, DateKey] = [
    addDays(anchor, Math.round(qs.q25)),
    addDays(anchor, Math.round(qs.q75)),
  ];
  const peak = addDays(anchor, Math.round(qs.q50));

  let realNonApproxCount = 0;
  for (const c of activeCyclesBeforeAnchor) {
    if (!c.approximate) realNonApproxCount += 1;
  }

  return {
    id: `forecast:cycle:${anchor}`,
    anchor,
    madeOn,
    basis: 'cycle-lengths',
    cyclesUsed: realNonApproxCount,
    confidence: conf.score,
    likely,
    possible,
    peak,
    rulesetVersion: RULESET_VERSION,
  };
}

export interface ReconcileForecastsInput {
  today: DateKey;
  profile: Profile;
  cycles: DerivedCycleSummary;
  dayLogs: readonly DayLog[];
  decisions: readonly Decision[];
  existingForecasts: readonly Forecast[];
}

export interface ReconcileForecastsResult {
  forecasts: Forecast[];
  changed: boolean;
}

/**
 * Freezes forecasts when period starts occur (no hindsight) and scores frozen forecasts
 * once the subsequent period start is confirmed.
 */
export function reconcileForecasts(
  input: ReconcileForecastsInput,
): ReconcileForecastsResult {
  const { today, profile, cycles, dayLogs, existingForecasts } = input;
  const baseline = cycles.newBaselineDate;

  const byId = new Map<string, Forecast>();
  for (const f of existingForecasts) {
    byId.set(f.id, { ...f });
  }

  // Confirmed period starts >= baseline
  const periodStartsSet = new Set<DateKey>();
  for (const c of cycles.cycles) {
    if (baseline === null || c.startDate >= baseline) periodStartsSet.add(c.startDate);
    if (baseline === null || c.nextStartDate >= baseline) periodStartsSet.add(c.nextStartDate);
  }
  if (cycles.openCycle && (baseline === null || cycles.openCycle.startDate >= baseline)) {
    periodStartsSet.add(cycles.openCycle.startDate);
  }
  const periodStarts = [...periodStartsSet]
    .filter((d) => d <= today)
    .sort((a, b) => a.localeCompare(b));

  let changed = false;

  // 1. Ensure each period start >= baseline has a frozen cycle-lengths forecast computed
  //    from data strictly up to that start date (zero hindsight).
  for (let i = 0; i < periodStarts.length; i += 1) {
    const anchor = periodStarts[i];
    if (!anchor) continue;
    const cycleId = `forecast:cycle:${anchor}`;
    const activeBefore = cycles.recentValidCyclesAfterBaseline.filter(
      (c) => c.nextStartDate <= anchor,
    );
    const allBefore = cycles.cycles.filter((c) => c.nextStartDate <= anchor);
    const resolvedBefore = [...byId.values()].filter(
      (f) => f.outcome !== undefined && f.outcome.actualStart <= anchor,
    );

    if (!byId.has(cycleId)) {
      const frozen = buildAnchorForecastOnly({
        anchor,
        madeOn: anchor,
        profile,
        activeCyclesBeforeAnchor: activeBefore,
        allCyclesBeforeAnchor: allBefore,
        resolvedForecastsBeforeAnchor: resolvedBefore,
        newBaselineDate: baseline,
      });
      byId.set(cycleId, frozen);
      changed = true;
    }

    // Score against next confirmed period start if one exists
    const nextStart = periodStarts[i + 1];
    const currentCycleForecast = byId.get(cycleId);
    if (currentCycleForecast && nextStart) {
      const inLikely =
        nextStart >= currentCycleForecast.likely[0] &&
        nextStart <= currentCycleForecast.likely[1];
      const inPossible =
        nextStart >= currentCycleForecast.possible[0] &&
        nextStart <= currentCycleForecast.possible[1];
      const errorDays = Math.abs(diffDays(currentCycleForecast.peak, nextStart));
      const prevOutcome = currentCycleForecast.outcome;
      if (
        !prevOutcome ||
        prevOutcome.actualStart !== nextStart ||
        prevOutcome.inLikely !== inLikely ||
        prevOutcome.inPossible !== inPossible ||
        prevOutcome.errorDays !== errorDays
      ) {
        byId.set(cycleId, {
          ...currentCycleForecast,
          outcome: { actualStart: nextStart, inLikely, inPossible, errorDays },
        });
        changed = true;
      }
    } else if (currentCycleForecast && !nextStart && currentCycleForecast.outcome) {
      const withoutOutcome: Forecast = {
        id: currentCycleForecast.id,
        anchor: currentCycleForecast.anchor,
        madeOn: currentCycleForecast.madeOn,
        basis: currentCycleForecast.basis,
        cyclesUsed: currentCycleForecast.cyclesUsed,
        confidence: currentCycleForecast.confidence,
        likely: currentCycleForecast.likely,
        possible: currentCycleForecast.possible,
        peak: currentCycleForecast.peak,
        rulesetVersion: currentCycleForecast.rulesetVersion,
      };
      byId.set(cycleId, withoutOutcome);
      changed = true;
    }
  }

  // 2. Also freeze & score lead-in-pattern forecasts when a learned signal day triggers before flow
  if (periodStarts.length >= 4) {
    const allCycleForecasts = [...byId.values()].filter((f) => f.basis === 'cycle-lengths');
    for (let i = 0; i < periodStarts.length; i += 1) {
      const anchor = periodStarts[i];
      if (!anchor) continue;
      const nextStart = periodStarts[i + 1];
      const leadId = `forecast:lead-in:${anchor}`;

      if (!byId.has(leadId)) {
        const logsUpToAnchorEnd = dayLogs.filter((l) =>
          nextStart ? l.date < nextStart : l.date <= today,
        );
        const partialCycles: DerivedCycleSummary = {
          ...cycles,
          cycles: cycles.cycles.filter((c) => c.nextStartDate <= anchor),
          recentValidCyclesAfterBaseline: cycles.recentValidCyclesAfterBaseline.filter(
            (c) => c.nextStartDate <= anchor,
          ),
          openCycle: null,
        };
        const resolvedLeadSoFar = [...byId.values()].filter(
          (f) => f.basis === 'lead-in-pattern' && f.outcome !== undefined && f.anchor < anchor,
        );
        const leadAtCycle = analyzeLeadInPattern({
          today: nextStart ? addDays(nextStart, -1) : today,
          dayLogs: logsUpToAnchorEnd,
          cycles: partialCycles,
          resolvedForecasts: resolvedLeadSoFar,
        });
        if (
          leadAtCycle.status === 'learned' &&
          leadAtCycle.activeSignalDate &&
          leadAtCycle.activeSignalDate >= anchor &&
          leadAtCycle.likely &&
          leadAtCycle.possible &&
          leadAtCycle.peak
        ) {
          const matchingCycleForecast = allCycleForecasts.find((cf) => cf.anchor === anchor);
          const frozenLead: Forecast = {
            id: leadId,
            anchor,
            madeOn: leadAtCycle.activeSignalDate,
            basis: 'lead-in-pattern',
            cyclesUsed: leadAtCycle.cyclesWithSignal,
            confidence: matchingCycleForecast?.confidence ?? 50,
            likely: leadAtCycle.likely,
            possible: leadAtCycle.possible,
            peak: leadAtCycle.peak,
            rulesetVersion: RULESET_VERSION,
          };
          byId.set(leadId, frozenLead);
          changed = true;
        }
      }

      const existingLead = byId.get(leadId);
      if (existingLead && nextStart && !existingLead.outcome) {
        const inLikely =
          nextStart >= existingLead.likely[0] && nextStart <= existingLead.likely[1];
        const inPossible =
          nextStart >= existingLead.possible[0] && nextStart <= existingLead.possible[1];
        const errorDays = Math.abs(diffDays(existingLead.peak, nextStart));
        byId.set(leadId, {
          ...existingLead,
          outcome: { actualStart: nextStart, inLikely, inPossible, errorDays },
        });
        changed = true;
      }
    }
  }

  const forecasts = [...byId.values()].sort(
    (a, b) => a.anchor.localeCompare(b.anchor) || a.id.localeCompare(b.id),
  );
  return { forecasts, changed };
}

export interface LivePredictionInput {
  today: DateKey;
  profile: Profile;
  cycles: DerivedCycleSummary;
  dayLogs: readonly DayLog[];
  decisions: readonly Decision[];
  existingForecasts: readonly Forecast[];
}

export function computeLivePrediction(input: LivePredictionInput): CycleWindowResult {
  const { today, profile, cycles, dayLogs, existingForecasts } = input;
  const activeCycles = cycles.recentValidCyclesAfterBaseline;
  const priorBand = getPriorBand(profile, today);

  const confidence = computeConfidence({
    activeCycles,
    resolvedForecasts: existingForecasts,
    cycles: cycles.cycles,
    newBaselineDate: cycles.newBaselineDate,
  });

  const leadIn = analyzeLeadInPattern({
    today,
    dayLogs,
    cycles,
    resolvedForecasts: existingForecasts,
  });

  const priorValues =
    priorBand === 'ACOG' ? ADOLESCENT_PRIOR_LENGTHS : ADULT_PRIOR_LENGTHS;
  const priorQs = weightedQuantiles(
    priorValues.map((value) => ({ value, weight: PRIOR_BASE_WEIGHT })),
  );
  const priorLengthRange = {
    q10: Math.round(priorQs.q10),
    q25: Math.round(priorQs.q25),
    q50: Math.round(priorQs.q50),
    q75: Math.round(priorQs.q75),
    q90: Math.round(priorQs.q90),
  };

  const openAnchor =
    cycles.openCycle &&
    (cycles.newBaselineDate === null || cycles.openCycle.startDate >= cycles.newBaselineDate)
      ? cycles.openCycle.startDate
      : null;

  const daysSinceStart = openAnchor ? Math.max(0, diffDays(openAnchor, today)) : null;
  const allValidLengths = cycles.allValidCycleLengths;
  const longestGapDays =
    allValidLengths.length > 0 ? Math.max(...allValidLengths) : null;

  if (!openAnchor || daysSinceStart === null) {
    return {
      anchor: null,
      basis: 'cycle-lengths',
      daysSinceStart: null,
      longestGapDays,
      priorUsed: confidence.effectiveCycles < FULL_CYCLES_THRESHOLD ? priorBand : 'none',
      priorLengthRange,
      likely: null,
      possible: null,
      peak: null,
      likelyWidthDays: null,
      possibleWidthDays: null,
      droppedLikelyWindow: false,
      confidence,
      leadIn,
      forecast: null,
    };
  }

  // Lead-in override when learned and a recent signal is active on the open cycle
  if (
    leadIn.status === 'learned' &&
    leadIn.activeSignalDate &&
    leadIn.activeSignalDate >= openAnchor &&
    leadIn.likely &&
    leadIn.possible &&
    leadIn.peak
  ) {
    const forecast: Forecast = {
      id: `live:lead-in:${openAnchor}`,
      anchor: openAnchor,
      madeOn: leadIn.activeSignalDate,
      basis: 'lead-in-pattern',
      cyclesUsed: leadIn.cyclesWithSignal,
      confidence: confidence.score,
      likely: leadIn.likely,
      possible: leadIn.possible,
      peak: leadIn.peak,
      rulesetVersion: RULESET_VERSION,
    };
    return {
      anchor: openAnchor,
      basis: 'lead-in-pattern',
      daysSinceStart,
      longestGapDays,
      priorUsed: 'none',
      priorLengthRange,
      likely: leadIn.likely,
      possible: leadIn.possible,
      peak: leadIn.peak,
      likelyWidthDays: diffDays(leadIn.likely[0], leadIn.likely[1]),
      possibleWidthDays: diffDays(leadIn.possible[0], leadIn.possible[1]),
      droppedLikelyWindow: false,
      confidence,
      leadIn,
      forecast,
    };
  }

  const priorUsed: 'FIGO' | 'ACOG' | 'none' =
    confidence.effectiveCycles < FULL_CYCLES_THRESHOLD ? priorBand : 'none';

  const conditionalPool = buildWeightedPool(
    activeCycles,
    priorBand,
    confidence.effectiveCycles,
    daysSinceStart,
  );

  if (conditionalPool.length < MIN_TAIL_POINTS_FOR_LIKELY) {
    const possibleEnd = addDays(
      openAnchor,
      Math.max(longestGapDays ?? daysSinceStart + FALLBACK_EXTENSION_DAYS, daysSinceStart + FALLBACK_EXTENSION_DAYS),
    );
    const possible: [DateKey, DateKey] = [today, possibleEnd];
    return {
      anchor: openAnchor,
      basis: 'cycle-lengths',
      daysSinceStart,
      longestGapDays,
      priorUsed,
      priorLengthRange,
      likely: null,
      possible,
      peak: null,
      likelyWidthDays: null,
      possibleWidthDays: diffDays(possible[0], possible[1]),
      droppedLikelyWindow: true,
      confidence,
      leadIn,
      forecast: null,
    };
  }

  const qs = weightedQuantiles(conditionalPool);
  const possible: [DateKey, DateKey] = [
    addDays(openAnchor, Math.round(qs.q10)),
    addDays(openAnchor, Math.round(qs.q90)),
  ];
  const likely: [DateKey, DateKey] = [
    addDays(openAnchor, Math.round(qs.q25)),
    addDays(openAnchor, Math.round(qs.q75)),
  ];
  const peak = addDays(openAnchor, Math.round(qs.q50));

  let realCount = 0;
  for (const c of activeCycles) {
    if (!c.approximate) realCount += 1;
  }

  const forecast: Forecast = {
    id: `live:cycle:${openAnchor}`,
    anchor: openAnchor,
    madeOn: today,
    basis: 'cycle-lengths',
    cyclesUsed: realCount,
    confidence: confidence.score,
    likely,
    possible,
    peak,
    rulesetVersion: RULESET_VERSION,
  };

  return {
    anchor: openAnchor,
    basis: 'cycle-lengths',
    daysSinceStart,
    longestGapDays,
    priorUsed,
    priorLengthRange,
    likely,
    possible,
    peak,
    likelyWidthDays: diffDays(likely[0], likely[1]),
    possibleWidthDays: diffDays(possible[0], possible[1]),
    droppedLikelyWindow: false,
    confidence,
    leadIn,
    forecast,
  };
}
