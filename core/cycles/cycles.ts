import { addDays, diffDays } from '../model/dates';
import type { Decision } from '../model/types';
import type { BleedingEpisode, EpisodeClassification } from './episodes';

export const MIN_VALID_CYCLE_DAYS = 10;
export const MAX_VALID_CYCLE_DAYS = 200;

export interface DerivedCycle {
  id: string;
  startDate: string;
  nextStartDate: string;
  lengthDays: number;
  isValidLength: boolean;
  dateCheckFlag: 'check this date' | null;
  ignoredInPredictions: boolean;
  beforeBaseline: boolean;
  approximate: boolean;
  weight: 0.5 | 1;
  countsForHistoryRules: boolean;
  bleedingDays: number;
  leadInDays: number;
  episode: BleedingEpisode;
}

export interface OpenCycle {
  startDate: string;
  daysSinceStart: number;
  episode: BleedingEpisode;
}

export interface DerivedCycleSummary {
  newBaselineDate: string | null;
  cycles: DerivedCycle[];
  activeCycleLengths: number[];
  allValidCycleLengths: number[];
  openCycle: OpenCycle | null;
  daysSinceLastPeriodStart: number | null;
  periodsInLast12MonthsAfterBaseline: number;
  cyclesInLast12MonthsAfterBaseline: DerivedCycle[];
  cyclesWithLeadInAfterBaseline: number;
  recentValidCyclesAfterBaseline: DerivedCycle[];
}

export function deriveCycles(
  classification: EpisodeClassification,
  decisions: readonly Decision[],
  today: string,
): DerivedCycleSummary {
  const validDecisions = decisions.filter((d) => d.date <= today);

  const baselineDecisions = validDecisions
    .filter((d) => d.kind === 'new-baseline')
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  const newBaselineDate =
    baselineDecisions[baselineDecisions.length - 1]?.date ?? null;

  const ignoreDates = validDecisions
    .filter((d) => d.kind === 'ignore-in-predictions')
    .map((d) => d.date);

  const periods = [...classification.periodEpisodes].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const cycles: DerivedCycle[] = [];
  let prev = periods[0];
  if (prev) {
    for (const next of periods.slice(1)) {
      const current = prev;
      prev = next;
      const lengthDays = diffDays(current.startDate, next.startDate);
      const isValidLength =
        lengthDays >= MIN_VALID_CYCLE_DAYS && lengthDays <= MAX_VALID_CYCLE_DAYS;
      const ignoredInPredictions = ignoreDates.some(
        (d) => d >= current.startDate && d < next.startDate,
      );
      const beforeBaseline =
        newBaselineDate !== null && current.startDate < newBaselineDate;
      const approximate = current.approximate;
      const weight: 0.5 | 1 = approximate ? 0.5 : 1;

      cycles.push({
        id: `cycle:${current.startDate}`,
        startDate: current.startDate,
        nextStartDate: next.startDate,
        lengthDays,
        isValidLength,
        dateCheckFlag: isValidLength ? null : 'check this date',
        ignoredInPredictions,
        beforeBaseline,
        approximate,
        weight,
        countsForHistoryRules:
          isValidLength && !ignoredInPredictions && !beforeBaseline,
        bleedingDays: current.knownBleedingDays,
        leadInDays: current.leadInDays,
        episode: current,
      });
    }
  }

  const allValidCycleLengths = cycles
    .filter((c) => c.isValidLength && !c.ignoredInPredictions)
    .map((c) => c.lengthDays);

  const activeCycles = cycles.filter((c) => c.countsForHistoryRules);
  const activeCycleLengths = activeCycles.map((c) => c.lengthDays);

  const latestPeriod = periods[periods.length - 1];
  const daysSinceLastPeriodStart = latestPeriod
    ? diffDays(latestPeriod.startDate, today)
    : null;
  const openCycle: OpenCycle | null = latestPeriod
    ? {
        startDate: latestPeriod.startDate,
        daysSinceStart: diffDays(latestPeriod.startDate, today),
        episode: latestPeriod,
      }
    : null;

  const yearAgo = addDays(today, -365);
  const periodsAfterBaseline =
    newBaselineDate === null
      ? periods
      : periods.filter((p) => p.startDate >= newBaselineDate);
  const periodsInLast12MonthsAfterBaseline = periodsAfterBaseline.filter(
    (p) => p.startDate >= yearAgo && p.startDate <= today,
  ).length;

  const cyclesInLast12MonthsAfterBaseline = activeCycles.filter(
    (c) => c.nextStartDate >= yearAgo && c.nextStartDate <= today,
  );

  const cyclesWithLeadInAfterBaseline = activeCycles.filter(
    (c) => c.leadInDays > 0,
  ).length;

  return {
    newBaselineDate,
    cycles,
    activeCycleLengths,
    allValidCycleLengths,
    openCycle,
    daysSinceLastPeriodStart,
    periodsInLast12MonthsAfterBaseline,
    cyclesInLast12MonthsAfterBaseline,
    cyclesWithLeadInAfterBaseline,
    recentValidCyclesAfterBaseline: activeCycles,
  };
}
