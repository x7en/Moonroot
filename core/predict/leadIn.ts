import type { DerivedCycleSummary } from '../cycles/cycles';
import { addDays, diffDays } from '../model/dates';
import type { DateKey, DayLog, Forecast } from '../model/types';
import { sampleStdDev, weightedQuantiles } from './quantiles';

export const LEAD_IN_LOOKBACK_DAYS = 14;
export const LEAD_IN_MIN_CRAMPS_PAIN = 3;
export const LEAD_IN_MIN_CYCLES = 4;
export const LEAD_IN_LAST_OFFSETS_LIMIT = 8;
export const LEAD_IN_MAX_STD_DEV_DAYS = 2;
export const LEAD_IN_MIN_FOLLOWED_RATIO = 0.6;
export const LEAD_IN_RETIRE_WINDOW_USES = 3;
export const LEAD_IN_RETIRE_MISS_COUNT = 2;

export type LeadInStatus = 'insufficient' | 'learned' | 'unreliable' | 'retired';

export interface LeadInAnalysis {
  status: LeadInStatus;
  offsets: number[];
  lastOffsets: number[];
  cyclesWithSignal: number;
  totalSignalEvents: number;
  followedSignalEvents: number;
  followedRatio: number;
  stdDevDays: number | null;
  offsetRangeDays: [number, number] | null;
  medianOffsetDays: number | null;
  activeSignalDate: DateKey | null;
  likely: [DateKey, DateKey] | null;
  possible: [DateKey, DateKey] | null;
  peak: DateKey | null;
  retiredMessage: string | null;
}

export function isLeadInSignalDay(log: DayLog): boolean {
  if (log.flow === 'light' || log.flow === 'medium' || log.flow === 'heavy') {
    return false;
  }
  return log.flow === 'spotting' || (log.pain?.level ?? 0) >= LEAD_IN_MIN_CRAMPS_PAIN;
}

export interface AnalyzeLeadInInput {
  today: DateKey;
  dayLogs: readonly DayLog[];
  cycles: DerivedCycleSummary;
  resolvedForecasts: readonly Forecast[];
}

export function analyzeLeadInPattern(input: AnalyzeLeadInInput): LeadInAnalysis {
  const { today, dayLogs, cycles, resolvedForecasts } = input;
  const baseline = cycles.newBaselineDate;

  // Use period starts >= baseline in chronological order (from all derived cycles + open episode)
  const startsSet = new Set<DateKey>();
  for (const c of cycles.cycles) {
    if (baseline === null || c.startDate >= baseline) startsSet.add(c.startDate);
    if (baseline === null || c.nextStartDate >= baseline) startsSet.add(c.nextStartDate);
  }
  if (cycles.openCycle && (baseline === null || cycles.openCycle.startDate >= baseline)) {
    startsSet.add(cycles.openCycle.startDate);
  }
  const periodStarts = [...startsSet].sort((a, b) => a.localeCompare(b));

  const signalDays = [...dayLogs]
    .filter(
      (l) =>
        l.date <= today &&
        (baseline === null || l.date >= baseline) &&
        isLeadInSignalDay(l),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  // 1. Cycle offsets: for each period start after the first signal window, find first signal day in [start - 14, start - 1]
  //    excluding days that sit inside the immediately preceding period's bleeding dates.
  const previousBleedingDates = new Set<DateKey>();
  for (const c of cycles.cycles) {
    for (const d of c.episode.dates) {
      previousBleedingDates.add(d);
    }
  }
  if (cycles.openCycle) {
    for (const d of cycles.openCycle.episode.dates) {
      previousBleedingDates.add(d);
    }
  }

  const offsets: number[] = [];
  for (const start of periodStarts) {
    const winStart = addDays(start, -LEAD_IN_LOOKBACK_DAYS);
    const firstSig = signalDays.find(
      (s) => s.date >= winStart && s.date < start && !previousBleedingDates.has(s.date),
    );
    if (firstSig) {
      offsets.push(diffDays(firstSig.date, start));
    }
  }

  // 2. Signal events across history: group signal days into 14-day watch episodes
  let totalSignalEvents = 0;
  let followedSignalEvents = 0;
  let activeSignalDate: DateKey | null = null;
  let currentWindowEnd: DateKey | null = null;

  for (const sig of signalDays) {
    if (previousBleedingDates.has(sig.date)) continue;
    if (currentWindowEnd !== null && sig.date <= currentWindowEnd) {
      continue;
    }

    const matchingFlow = periodStarts.find(
      (st) => st > sig.date && diffDays(sig.date, st) <= LEAD_IN_LOOKBACK_DAYS,
    );

    if (matchingFlow) {
      totalSignalEvents += 1;
      followedSignalEvents += 1;
      currentWindowEnd = matchingFlow;
    } else {
      const daysElapsed = diffDays(sig.date, today);
      if (daysElapsed > LEAD_IN_LOOKBACK_DAYS) {
        totalSignalEvents += 1;
        currentWindowEnd = addDays(sig.date, LEAD_IN_LOOKBACK_DAYS);
      } else {
        // Still within the 14-day pending window with no flow start after sig.date yet
        activeSignalDate = sig.date;
        currentWindowEnd = addDays(sig.date, LEAD_IN_LOOKBACK_DAYS);
      }
    }
  }

  const followedRatio =
    totalSignalEvents > 0 ? followedSignalEvents / totalSignalEvents : 1;
  const lastOffsets = offsets.slice(-LEAD_IN_LAST_OFFSETS_LIMIT);
  const stdDevDays = sampleStdDev(lastOffsets);

  // 3. Check retirement rule: misses likely window in 2 of its last 3 uses
  const leadInUses = [...resolvedForecasts]
    .filter(
      (f) =>
        f.basis === 'lead-in-pattern' &&
        f.outcome !== undefined &&
        f.anchor <= today &&
        (baseline === null || f.anchor >= baseline),
    )
    .sort((a, b) => a.madeOn.localeCompare(b.madeOn));
  const last3Uses = leadInUses.slice(-LEAD_IN_RETIRE_WINDOW_USES);
  const recentMisses = last3Uses.filter((f) => f.outcome && !f.outcome.inLikely).length;
  const isRetired = recentMisses >= LEAD_IN_RETIRE_MISS_COUNT;

  const isUnreliable =
    totalSignalEvents >= 3 && followedRatio < LEAD_IN_MIN_FOLLOWED_RATIO;

  let status: LeadInStatus = 'insufficient';
  if (isRetired) {
    status = 'retired';
  } else if (isUnreliable) {
    status = 'unreliable';
  } else if (
    offsets.length >= LEAD_IN_MIN_CYCLES &&
    stdDevDays !== null &&
    stdDevDays <= LEAD_IN_MAX_STD_DEV_DAYS &&
    followedRatio >= LEAD_IN_MIN_FOLLOWED_RATIO
  ) {
    status = 'learned';
  }

  if (status !== 'learned') {
    return {
      status,
      offsets,
      lastOffsets,
      cyclesWithSignal: offsets.length,
      totalSignalEvents,
      followedSignalEvents,
      followedRatio,
      stdDevDays,
      offsetRangeDays: null,
      medianOffsetDays: null,
      activeSignalDate: status === 'retired' || status === 'unreliable' ? null : activeSignalDate,
      likely: null,
      possible: null,
      peak: null,
      retiredMessage: status === 'retired' ? 'This pattern is not holding.' : null,
    };
  }

  const qs = weightedQuantiles(lastOffsets.map((value) => ({ value, weight: 1 })));
  const lowOffset = Math.round(qs.q25);
  const highOffset = Math.round(qs.q75);
  const p10Offset = Math.round(qs.q10);
  const p90Offset = Math.round(qs.q90);
  const medOffset = Math.round(qs.q50);

  let likely: [DateKey, DateKey] | null = null;
  let possible: [DateKey, DateKey] | null = null;
  let peak: DateKey | null = null;

  if (activeSignalDate !== null) {
    likely = [addDays(activeSignalDate, lowOffset), addDays(activeSignalDate, highOffset)];
    possible = [addDays(activeSignalDate, p10Offset), addDays(activeSignalDate, p90Offset)];
    peak = addDays(activeSignalDate, medOffset);
  }

  return {
    status,
    offsets,
    lastOffsets,
    cyclesWithSignal: offsets.length,
    totalSignalEvents,
    followedSignalEvents,
    followedRatio,
    stdDevDays,
    offsetRangeDays: [lowOffset, highOffset],
    medianOffsetDays: medOffset,
    activeSignalDate,
    likely,
    possible,
    peak,
    retiredMessage: null,
  };
}
