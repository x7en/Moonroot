import { addDays, diffDays } from '../model/dates';
import type { BodyLog, DateKey, DayLog } from '../model/types';

export type LifestyleCauseKey =
  | 'sleep'
  | 'water'
  | 'meals'
  | 'stool'
  | 'stress'
  | 'exercise'
  | 'caffeine';

export type LifestyleOutcomeKey = 'cramps' | 'headache' | 'mood' | 'energy';

export interface LifestylePairDefinition {
  readonly id: string;
  readonly causeKey: LifestyleCauseKey;
  readonly outcomeKey: LifestyleOutcomeKey;
  readonly causeDescription: string;
  readonly outcomeNoun: string;
  readonly comparisonLabel: string;
  readonly excludeFasting: boolean;
  readonly higherMeansWorse: boolean;
  readonly evaluateCause: (
    dayD: DayLog,
    bodyD: BodyLog | undefined,
  ) => 'A' | 'B' | null;
  readonly evaluateOutcome: (
    dayNext: DayLog,
    bodyNext: BodyLog | undefined,
  ) => { value: number; isEvent: boolean } | null;
}

export interface LifestylePattern {
  readonly id: string;
  readonly causeKey: LifestyleCauseKey;
  readonly outcomeKey: LifestyleOutcomeKey;
  readonly groupACount: number;
  readonly groupBCount: number;
  readonly eventCount: number;
  readonly effectD: number;
  readonly diffPoints: number;
  readonly lastSupportingDate: DateKey;
  readonly statement: string;
}

export interface LifestyleReadiness {
  readonly causeKey: LifestyleCauseKey;
  readonly label: string;
  readonly loggedNonBleedingDays: number;
  readonly requiredMinDays: number;
}

export interface LifestyleAnalysisResult {
  readonly patterns: readonly LifestylePattern[];
  readonly testedPairCount: number;
  readonly nonBleedingDaysCount: number;
  readonly readiness: readonly LifestyleReadiness[];
}

const MIN_GROUP_SIZE = 14;
const MIN_OUTCOME_EVENTS = 6;
const MIN_COHENS_D = 0.65;
const MIN_WELCH_T = 3.85;
const MIN_HALF_D = 0.45;
const MIN_HALF_T = 2.0;
const MAX_PATTERNS_SHOWN = 3;
const PATTERN_EXPIRY_DAYS = 60;

interface SamplePoint {
  readonly date: DateKey;
  readonly group: 'A' | 'B';
  readonly value: number;
  readonly isEvent: boolean;
}

function outcomeCramps(dayNext: DayLog): { value: number; isEvent: boolean } | null {
  if (dayNext.pain === undefined) return null;
  const isEvent = dayNext.pain.level >= 2 || dayNext.symptoms.includes('cramps');
  return { value: dayNext.pain.level, isEvent };
}

function outcomeHeadache(dayNext: DayLog): { value: number; isEvent: boolean } {
  const has = dayNext.symptoms.includes('headache');
  return { value: has ? 1 : 0, isEvent: has };
}

function outcomeMood(dayNext: DayLog): { value: number; isEvent: boolean } | null {
  if (dayNext.mood === undefined) return null;
  return { value: dayNext.mood, isEvent: dayNext.mood <= 2 };
}

function outcomeEnergy(
  _dayNext: DayLog,
  bodyNext: BodyLog | undefined,
): { value: number; isEvent: boolean } | null {
  if (bodyNext?.energy === undefined) return null;
  return { value: bodyNext.energy, isEvent: bodyNext.energy <= 2 };
}

function causeSleep(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  if (b?.sleep === undefined) return null;
  if (b.sleep.hours < 6) return 'A';
  if (b.sleep.hours >= 7) return 'B';
  return null;
}

function causeWater(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  if (b?.water === undefined) return null;
  if (b.water.ml < 1250) return 'A';
  if (b.water.ml >= 1750) return 'B';
  return null;
}

function causeMeals(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  if (b?.meals === undefined) return null;
  return b.meals.pattern === 'regular' ? 'B' : 'A';
}

function causeStool(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  const bristol = b?.stool?.bristol;
  if (bristol === undefined) return null;
  return bristol <= 2 || bristol >= 6 ? 'A' : 'B';
}

function causeStress(d: DayLog): 'A' | 'B' | null {
  const s = d.context?.stress;
  if (s === undefined) return null;
  return s >= 3 ? 'A' : 'B';
}

function causeExercise(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  if (b?.exercise === undefined) return null;
  return b.exercise.minutes >= 20 ? 'A' : 'B';
}

function causeCaffeine(_d: DayLog, b: BodyLog | undefined): 'A' | 'B' | null {
  if (b?.meals === undefined) return null;
  return b.meals.tags.includes('caffeine') ? 'A' : 'B';
}

export const LIFESTYLE_CANDIDATE_PAIRS: readonly LifestylePairDefinition[] = [
  {
    id: 'sleep-cramps',
    causeKey: 'sleep',
    outcomeKey: 'cramps',
    causeDescription: 'under 6 hours of sleep',
    outcomeNoun: 'cramps',
    comparisonLabel: 'higher',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeSleep,
    evaluateOutcome: (d) => outcomeCramps(d),
  },
  {
    id: 'sleep-headache',
    causeKey: 'sleep',
    outcomeKey: 'headache',
    causeDescription: 'under 6 hours of sleep',
    outcomeNoun: 'headache',
    comparisonLabel: 'more common',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeSleep,
    evaluateOutcome: (d) => outcomeHeadache(d),
  },
  {
    id: 'sleep-mood',
    causeKey: 'sleep',
    outcomeKey: 'mood',
    causeDescription: 'under 6 hours of sleep',
    outcomeNoun: 'mood',
    comparisonLabel: 'lower',
    excludeFasting: false,
    higherMeansWorse: false,
    evaluateCause: causeSleep,
    evaluateOutcome: (d) => outcomeMood(d),
  },
  {
    id: 'sleep-energy',
    causeKey: 'sleep',
    outcomeKey: 'energy',
    causeDescription: 'under 6 hours of sleep',
    outcomeNoun: 'energy',
    comparisonLabel: 'lower',
    excludeFasting: false,
    higherMeansWorse: false,
    evaluateCause: causeSleep,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'water-headache',
    causeKey: 'water',
    outcomeKey: 'headache',
    causeDescription: 'less water',
    outcomeNoun: 'headache',
    comparisonLabel: 'more common',
    excludeFasting: true,
    higherMeansWorse: true,
    evaluateCause: causeWater,
    evaluateOutcome: (d) => outcomeHeadache(d),
  },
  {
    id: 'water-cramps',
    causeKey: 'water',
    outcomeKey: 'cramps',
    causeDescription: 'less water',
    outcomeNoun: 'cramps',
    comparisonLabel: 'higher',
    excludeFasting: true,
    higherMeansWorse: true,
    evaluateCause: causeWater,
    evaluateOutcome: (d) => outcomeCramps(d),
  },
  {
    id: 'water-energy',
    causeKey: 'water',
    outcomeKey: 'energy',
    causeDescription: 'less water',
    outcomeNoun: 'energy',
    comparisonLabel: 'lower',
    excludeFasting: true,
    higherMeansWorse: false,
    evaluateCause: causeWater,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'meals-headache',
    causeKey: 'meals',
    outcomeKey: 'headache',
    causeDescription: 'irregular or skipped meals',
    outcomeNoun: 'headache',
    comparisonLabel: 'more common',
    excludeFasting: true,
    higherMeansWorse: true,
    evaluateCause: causeMeals,
    evaluateOutcome: (d) => outcomeHeadache(d),
  },
  {
    id: 'meals-mood',
    causeKey: 'meals',
    outcomeKey: 'mood',
    causeDescription: 'irregular or skipped meals',
    outcomeNoun: 'mood',
    comparisonLabel: 'lower',
    excludeFasting: true,
    higherMeansWorse: false,
    evaluateCause: causeMeals,
    evaluateOutcome: (d) => outcomeMood(d),
  },
  {
    id: 'meals-energy',
    causeKey: 'meals',
    outcomeKey: 'energy',
    causeDescription: 'irregular or skipped meals',
    outcomeNoun: 'energy',
    comparisonLabel: 'lower',
    excludeFasting: true,
    higherMeansWorse: false,
    evaluateCause: causeMeals,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'stool-cramps',
    causeKey: 'stool',
    outcomeKey: 'cramps',
    causeDescription: 'outside-middle digestion types',
    outcomeNoun: 'cramps',
    comparisonLabel: 'higher',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeStool,
    evaluateOutcome: (d) => outcomeCramps(d),
  },
  {
    id: 'stool-energy',
    causeKey: 'stool',
    outcomeKey: 'energy',
    causeDescription: 'outside-middle digestion types',
    outcomeNoun: 'energy',
    comparisonLabel: 'lower',
    excludeFasting: false,
    higherMeansWorse: false,
    evaluateCause: causeStool,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'stress-cramps',
    causeKey: 'stress',
    outcomeKey: 'cramps',
    causeDescription: 'higher stress',
    outcomeNoun: 'cramps',
    comparisonLabel: 'higher',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeStress,
    evaluateOutcome: (d) => outcomeCramps(d),
  },
  {
    id: 'stress-headache',
    causeKey: 'stress',
    outcomeKey: 'headache',
    causeDescription: 'higher stress',
    outcomeNoun: 'headache',
    comparisonLabel: 'more common',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeStress,
    evaluateOutcome: (d) => outcomeHeadache(d),
  },
  {
    id: 'stress-mood',
    causeKey: 'stress',
    outcomeKey: 'mood',
    causeDescription: 'higher stress',
    outcomeNoun: 'mood',
    comparisonLabel: 'lower',
    excludeFasting: false,
    higherMeansWorse: false,
    evaluateCause: causeStress,
    evaluateOutcome: (d) => outcomeMood(d),
  },
  {
    id: 'stress-energy',
    causeKey: 'stress',
    outcomeKey: 'energy',
    causeDescription: 'higher stress',
    outcomeNoun: 'energy',
    comparisonLabel: 'lower',
    excludeFasting: false,
    higherMeansWorse: false,
    evaluateCause: causeStress,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'exercise-mood',
    causeKey: 'exercise',
    outcomeKey: 'mood',
    causeDescription: 'more movement',
    outcomeNoun: 'mood',
    comparisonLabel: 'different',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeExercise,
    evaluateOutcome: (d) => outcomeMood(d),
  },
  {
    id: 'exercise-energy',
    causeKey: 'exercise',
    outcomeKey: 'energy',
    causeDescription: 'more movement',
    outcomeNoun: 'energy',
    comparisonLabel: 'different',
    excludeFasting: false,
    higherMeansWorse: true,
    evaluateCause: causeExercise,
    evaluateOutcome: outcomeEnergy,
  },
  {
    id: 'caffeine-headache',
    causeKey: 'caffeine',
    outcomeKey: 'headache',
    causeDescription: 'caffeine logged',
    outcomeNoun: 'headache',
    comparisonLabel: 'more common',
    excludeFasting: true,
    higherMeansWorse: true,
    evaluateCause: causeCaffeine,
    evaluateOutcome: (d) => outcomeHeadache(d),
  },
  {
    id: 'caffeine-mood',
    causeKey: 'caffeine',
    outcomeKey: 'mood',
    causeDescription: 'caffeine logged',
    outcomeNoun: 'mood',
    comparisonLabel: 'different',
    excludeFasting: true,
    higherMeansWorse: false,
    evaluateCause: causeCaffeine,
    evaluateOutcome: (d) => outcomeMood(d),
  },
];

function computeGroupStats(
  a: readonly number[],
  b: readonly number[],
): {
  meanA: number;
  meanB: number;
  diff: number;
  cohensD: number;
  welchT: number;
} | null {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return null;

  const meanA = a.reduce((s, v) => s + v, 0) / nA;
  const meanB = b.reduce((s, v) => s + v, 0) / nB;
  const diff = meanA - meanB;

  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (nA - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (nB - 1);

  const pooledVar = ((nA - 1) * varA + (nB - 1) * varB) / (nA + nB - 2);
  const se = Math.sqrt(varA / nA + varB / nB);

  if (pooledVar <= 1e-9 || se <= 1e-9) {
    // Near-zero variance with clear separation
    if (Math.abs(diff) > 1e-6) {
      return {
        meanA,
        meanB,
        diff,
        cohensD: Math.sign(diff) * 3,
        welchT: Math.sign(diff) * 10,
      };
    }
    return null;
  }

  return {
    meanA,
    meanB,
    diff,
    cohensD: diff / Math.sqrt(pooledVar),
    welchT: diff / se,
  };
}

function formatStatement(
  pair: LifestylePairDefinition,
  meanA: number,
  meanB: number,
  groupACount: number,
  groupBCount: number,
): string {
  const minCount = Math.min(groupACount, groupBCount);
  if (pair.outcomeKey === 'headache') {
    const direction = meanA > meanB ? 'more often' : 'less often';
    return `On days after ${pair.causeDescription}, headache was logged ${direction} (${minCount}+ days of each). This is a pattern, not proof of cause.`;
  }
  const absDiff = Math.max(1, Math.round(Math.abs(meanA - meanB)));
  const unitWord = absDiff === 1 ? 'point' : 'points';
  const dirWord = meanA > meanB ? 'higher' : 'lower';
  return `On days after ${pair.causeDescription}, ${pair.outcomeNoun} ${pair.outcomeKey === 'cramps' ? 'were' : 'was'} rated ${absDiff} ${unitWord} ${dirWord} (${groupACount} and ${groupBCount} days). This is a pattern, not proof of cause.`;
}

export function analyzeLifestylePatterns(input: {
  today: DateKey;
  dayLogs: readonly DayLog[];
  bodyLogs: readonly BodyLog[];
}): LifestyleAnalysisResult {
  const { today, dayLogs, bodyLogs } = input;
  const dayMap = new Map<DateKey, DayLog>();
  for (const log of dayLogs) {
    if (log.date <= today) {
      dayMap.set(log.date, log);
    }
  }
  const bodyMap = new Map<DateKey, BodyLog>();
  for (const b of bodyLogs) {
    if (b.date <= today) {
      bodyMap.set(b.date, b);
    }
  }

  const sortedDates = [...dayMap.keys()].sort((a, b) => a.localeCompare(b));
  const nonBleedingDates = sortedDates.filter((d) => dayMap.get(d)?.flow === 'none');

  const pairsToTest = LIFESTYLE_CANDIDATE_PAIRS.slice(0, 20);
  const candidates: LifestylePattern[] = [];

  for (const pair of pairsToTest) {
    const samples: SamplePoint[] = [];
    for (const date of nonBleedingDates) {
      const nextDate = addDays(date, 1);
      const dayD = dayMap.get(date);
      const dayNext = dayMap.get(nextDate);
      if (!dayD || !dayNext) continue;
      if (dayD.flow !== 'none' || dayNext.flow !== 'none') continue;

      const bodyD = bodyMap.get(date);
      const bodyNext = bodyMap.get(nextDate);
      if (pair.excludeFasting && bodyD?.meals?.tags.includes('fasting')) {
        continue;
      }

      const group = pair.evaluateCause(dayD, bodyD);
      if (!group) continue;
      const outcome = pair.evaluateOutcome(dayNext, bodyNext);
      if (!outcome) continue;

      samples.push({
        date,
        group,
        value: outcome.value,
        isEvent: outcome.isEvent,
      });
    }

    const groupA = samples.filter((s) => s.group === 'A').map((s) => s.value);
    const groupB = samples.filter((s) => s.group === 'B').map((s) => s.value);
    if (groupA.length < MIN_GROUP_SIZE || groupB.length < MIN_GROUP_SIZE) {
      continue;
    }

    const eventCount = samples.filter((s) => s.isEvent).length;
    if (eventCount < MIN_OUTCOME_EVENTS) {
      continue;
    }

    const lastDate = samples[samples.length - 1]?.date;
    if (!lastDate || diffDays(lastDate, today) > PATTERN_EXPIRY_DAYS) {
      continue;
    }

    const overall = computeGroupStats(groupA, groupB);
    if (!overall) continue;
    const minAbsDiff = pair.outcomeKey === 'headache' ? 0.25 : 0.75;
    if (Math.abs(overall.diff) < minAbsDiff) continue;
    if (Math.abs(overall.cohensD) < MIN_COHENS_D) continue;
    if (Math.abs(overall.welchT) < MIN_WELCH_T) continue;

    // Split data into two chronological halves and confirm same direction + minimum half effect
    const mid = Math.floor(samples.length / 2);
    const firstHalf = samples.slice(0, mid);
    const secondHalf = samples.slice(mid);
    const h1A = firstHalf.filter((s) => s.group === 'A').map((s) => s.value);
    const h1B = firstHalf.filter((s) => s.group === 'B').map((s) => s.value);
    const h2A = secondHalf.filter((s) => s.group === 'A').map((s) => s.value);
    const h2B = secondHalf.filter((s) => s.group === 'B').map((s) => s.value);
    if (h1A.length < 3 || h1B.length < 3 || h2A.length < 3 || h2B.length < 3) {
      continue;
    }

    const s1 = computeGroupStats(h1A, h1B);
    const s2 = computeGroupStats(h2A, h2B);
    if (!s1 || !s2) continue;
    if (s1.diff * s2.diff <= 0) continue;
    if (s1.diff * overall.diff <= 0) continue;
    if (Math.abs(s1.cohensD) < MIN_HALF_D || Math.abs(s2.cohensD) < MIN_HALF_D) {
      continue;
    }
    if (Math.abs(s1.welchT) < MIN_HALF_T || Math.abs(s2.welchT) < MIN_HALF_T) {
      continue;
    }

    candidates.push({
      id: pair.id,
      causeKey: pair.causeKey,
      outcomeKey: pair.outcomeKey,
      groupACount: groupA.length,
      groupBCount: groupB.length,
      eventCount,
      effectD: Math.abs(overall.cohensD),
      diffPoints: Math.abs(overall.diff),
      lastSupportingDate: lastDate,
      statement: formatStatement(
        pair,
        overall.meanA,
        overall.meanB,
        groupA.length,
        groupB.length,
      ),
    });
  }

  candidates.sort((a, b) => {
    if (b.effectD !== a.effectD) return b.effectD - a.effectD;
    if (b.lastSupportingDate !== a.lastSupportingDate) {
      return b.lastSupportingDate.localeCompare(a.lastSupportingDate);
    }
    return a.id.localeCompare(b.id);
  });

  const patterns = candidates.slice(0, MAX_PATTERNS_SHOWN);

  const countNonBleeding = (predicate: (d: DayLog, b: BodyLog | undefined) => boolean): number =>
    nonBleedingDates.filter((date) => {
      const d = dayMap.get(date);
      return d ? predicate(d, bodyMap.get(date)) : false;
    }).length;

  const readiness: LifestyleReadiness[] = [
    {
      causeKey: 'sleep',
      label: 'Sleep',
      loggedNonBleedingDays: countNonBleeding((_d, b) => b?.sleep !== undefined),
      requiredMinDays: MIN_GROUP_SIZE,
    },
    {
      causeKey: 'water',
      label: 'Water',
      loggedNonBleedingDays: countNonBleeding(
        (_d, b) => b?.water !== undefined && !b?.meals?.tags.includes('fasting'),
      ),
      requiredMinDays: MIN_GROUP_SIZE,
    },
    {
      causeKey: 'meals',
      label: 'Meals',
      loggedNonBleedingDays: countNonBleeding(
        (_d, b) => b?.meals !== undefined && !b?.meals?.tags.includes('fasting'),
      ),
      requiredMinDays: MIN_GROUP_SIZE,
    },
    {
      causeKey: 'stool',
      label: 'Digestion',
      loggedNonBleedingDays: countNonBleeding((_d, b) => b?.stool !== undefined),
      requiredMinDays: MIN_GROUP_SIZE,
    },
    {
      causeKey: 'stress',
      label: 'Stress',
      loggedNonBleedingDays: countNonBleeding((d) => d.context?.stress !== undefined),
      requiredMinDays: MIN_GROUP_SIZE,
    },
    {
      causeKey: 'exercise',
      label: 'Exercise',
      loggedNonBleedingDays: countNonBleeding((_d, b) => b?.exercise !== undefined),
      requiredMinDays: MIN_GROUP_SIZE,
    },
  ];

  return {
    patterns,
    testedPairCount: pairsToTest.length,
    nonBleedingDaysCount: nonBleedingDates.length,
    readiness,
  };
}
