import { addDays, diffDays } from '../model/dates';
import type { DangerSign, DayLog, Decision, Flow } from '../model/types';

export type EpisodeKind = 'period' | 'spotting' | 'unclear' | 'not-a-period';

export interface BleedingEpisode {
  id: string;
  kind: EpisodeKind;
  firstDate: string;
  lastDate: string;
  startDate: string;
  endDate: string;
  firstSpotDate: string | null;
  firstRealFlowDate: string | null;
  leadInDays: number;
  knownBleedingDays: number;
  dates: string[];
  heaviestFlow: Exclude<Flow, 'none'>;
  heavyFlowDays: number;
  maxPain: number;
  anyStoppedActivities: boolean;
  anySoakedPerHour: boolean;
  anyUnder2h: boolean;
  anyFlooding: boolean;
  anyDoubleProtection: boolean;
  anyLargeClots: boolean;
  anySmallClots: boolean;
  any2to3h: boolean;
  dangerSignsSeen: DangerSign[];
  maxConsecutiveSpottingDays: number;
  approximate: boolean;
  isOpen: boolean;
  needsPeriodConfirmation: boolean;
  confirmedByUser: boolean;
}

export interface InBetweenSpotting {
  id: string;
  firstDate: string;
  lastDate: string;
  consecutiveDays: number;
}

export interface EpisodeClassification {
  episodes: BleedingEpisode[];
  periodEpisodes: BleedingEpisode[];
  unclearEpisodes: BleedingEpisode[];
  inBetweenSpotting: InBetweenSpotting[];
  currentSpottingStreakDays: number;
}

const FLOW_RANK: Record<Exclude<Flow, 'none'>, number> = {
  unsure: 0,
  spotting: 1,
  light: 2,
  medium: 3,
  heavy: 4,
};

const REAL_FLOW_SET = new Set<Flow>(['light', 'medium', 'heavy']);
const NONE_GAP_SPLIT_DAYS = 2;
const UNLOGGED_GAP_SPLIT_DAYS = 4;
const SPOTTING_FLOW_FOLLOWUP_DAYS = 14;

function hasGapSplit(
  fromExclusive: string,
  toInclusive: string,
  byDate: Map<string, DayLog>,
  periodEndDates: Set<string>,
): boolean {
  let noneStreak = 0;
  let unloggedStreak = 0;
  let cursor = addDays(fromExclusive, 1);

  while (cursor <= toInclusive) {
    if (periodEndDates.has(cursor)) {
      return true;
    }
    const log = byDate.get(cursor);
    if (!log || log.flow === null) {
      unloggedStreak += 1;
      noneStreak = 0;
      if (unloggedStreak >= UNLOGGED_GAP_SPLIT_DAYS) {
        return true;
      }
    } else if (log.flow === 'none') {
      noneStreak += 1;
      unloggedStreak = 0;
      if (noneStreak >= NONE_GAP_SPLIT_DAYS) {
        return true;
      }
    } else {
      noneStreak = 0;
      unloggedStreak = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return false;
}

function maxSpottingStreak(runLogs: DayLog[]): number {
  let best = 0;
  let current = 0;
  let prevSpotDate: string | null = null;
  for (const log of runLogs) {
    if (log.flow === 'spotting') {
      if (prevSpotDate !== null && diffDays(prevSpotDate, log.date) === 1) {
        current += 1;
      } else {
        current = 1;
      }
      prevSpotDate = log.date;
      if (current > best) best = current;
    } else {
      current = 0;
      prevSpotDate = null;
    }
  }
  return best;
}

export function classifyEpisodes(
  dayLogs: readonly DayLog[],
  decisions: readonly Decision[],
  today: string,
): EpisodeClassification {
  const byDate = new Map<string, DayLog>();
  for (const log of dayLogs) {
    if (log.date <= today) {
      byDate.set(log.date, log);
    }
  }

  const periodEndDates = new Set<string>();
  const sortedDecisions = [...decisions]
    .filter((d) => d.date <= today)
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const d of sortedDecisions) {
    if (d.kind === 'period-end') {
      periodEndDates.add(d.date);
    }
  }

  const bleedingLogs = [...byDate.values()]
    .filter((l): l is DayLog & { flow: Exclude<Flow, 'none'> } => l.flow !== null && l.flow !== 'none')
    .sort((a, b) => a.date.localeCompare(b.date));

  type BleedLog = DayLog & { flow: Exclude<Flow, 'none'> };
  const runs: Array<[BleedLog, ...BleedLog[]]> = [];
  for (const log of bleedingLogs) {
    const prevRun = runs[runs.length - 1];
    const prevLast = prevRun?.[prevRun.length - 1];
    if (
      !prevRun ||
      !prevLast ||
      periodEndDates.has(prevLast.date) ||
      hasGapSplit(prevLast.date, log.date, byDate, periodEndDates)
    ) {
      runs.push([log]);
    } else {
      prevRun.push(log);
    }
  }

  const episodes: BleedingEpisode[] = runs.map((run) => {
    const firstDate = run[0].date;
    const lastDate = (run[run.length - 1] ?? run[0]).date;
    const runDecisions = sortedDecisions.filter(
      (d) => d.date >= firstDate && d.date <= lastDate,
    );

    const hasNotAPeriod = runDecisions.some((d) => d.kind === 'not-a-period');
    const periodStartDecisions = runDecisions.filter((d) => d.kind === 'period-start');
    const latestPeriodStart = periodStartDecisions[periodStartDecisions.length - 1];

    const firstRealFlow = run.find((l) => REAL_FLOW_SET.has(l.flow));
    const firstSpotDate = run[0].flow === 'spotting' ? firstDate : null;
    const hasMediumOrHeavy = run.some(
      (l) => l.flow === 'medium' || l.flow === 'heavy',
    );
    const lightWithProtectionCount = run.filter(
      (l) => l.flow === 'light' && l.protection !== undefined && l.protection !== 'none',
    ).length;
    const onlySpotting = run.every((l) => l.flow === 'spotting');

    let kind: EpisodeKind;
    let startDate = firstDate;
    let confirmedByUser = false;

    if (hasNotAPeriod) {
      kind = 'not-a-period';
    } else if (latestPeriodStart) {
      kind = 'period';
      startDate = latestPeriodStart.date;
      confirmedByUser = true;
    } else if (hasMediumOrHeavy || lightWithProtectionCount >= 2) {
      kind = 'period';
      startDate = firstRealFlow ? firstRealFlow.date : firstDate;
    } else if (onlySpotting) {
      kind = 'spotting';
      startDate = firstDate;
    } else {
      kind = 'unclear';
      startDate = firstRealFlow ? firstRealFlow.date : firstDate;
    }

    const includedLogs =
      kind === 'period' ? run.filter((l) => l.date >= startDate) : run;
    const leadInDays = run.filter(
      (l) => l.date < startDate && l.flow === 'spotting',
    ).length;

    let heaviestFlow: Exclude<Flow, 'none'> = 'unsure';
    let heavyFlowDays = 0;
    let maxPain = 0;
    let anyStoppedActivities = false;
    let anySoakedPerHour = false;
    let anyUnder2h = false;
    let anyFlooding = false;
    let anyDoubleProtection = false;
    let anyLargeClots = false;
    let anySmallClots = false;
    let any2to3h = false;
    const dangerSet = new Set<DangerSign>();
    let approximate = false;

    for (const l of includedLogs) {
      if (FLOW_RANK[l.flow] > FLOW_RANK[heaviestFlow]) {
        heaviestFlow = l.flow;
      }
      if (l.flow === 'heavy') heavyFlowDays += 1;
      if ((l.pain?.level ?? 0) > maxPain) maxPain = l.pain?.level ?? 0;
      if (l.pain?.stoppedActivities) anyStoppedActivities = true;
      if (l.soakedPerHour) anySoakedPerHour = true;
      if (l.changeEvery === 'under-2h') anyUnder2h = true;
      if (l.changeEvery === '2-3h') any2to3h = true;
      if (l.flooding) anyFlooding = true;
      if (l.doubleProtection) anyDoubleProtection = true;
      if (l.clots === 'large') anyLargeClots = true;
      if (l.clots === 'small') anySmallClots = true;
      if (l.filledFrom === 'approximate') approximate = true;
      for (const sign of l.danger) {
        dangerSet.add(sign);
      }
    }

    const isOpen =
      lastDate === today ||
      (!periodEndDates.has(lastDate) &&
        !hasGapSplit(lastDate, today, byDate, periodEndDates));

    return {
      id: `ep:${firstDate}`,
      kind,
      firstDate,
      lastDate,
      startDate,
      endDate: lastDate,
      firstSpotDate,
      firstRealFlowDate: firstRealFlow ? firstRealFlow.date : null,
      leadInDays,
      knownBleedingDays: includedLogs.length,
      dates: includedLogs.map((l) => l.date),
      heaviestFlow,
      heavyFlowDays,
      maxPain,
      anyStoppedActivities,
      anySoakedPerHour,
      anyUnder2h,
      anyFlooding,
      anyDoubleProtection,
      anyLargeClots,
      anySmallClots,
      any2to3h,
      dangerSignsSeen: [...dangerSet],
      maxConsecutiveSpottingDays: maxSpottingStreak(run),
      approximate,
      isOpen,
      needsPeriodConfirmation: kind === 'unclear',
      confirmedByUser,
    };
  });

  const periodEpisodes = episodes.filter((e) => e.kind === 'period');
  const unclearEpisodes = episodes.filter((e) => e.kind === 'unclear');

  const inBetweenSpotting: InBetweenSpotting[] = [];
  for (const ep of episodes) {
    if (ep.kind !== 'spotting') continue;
    const windowEnd = addDays(ep.lastDate, SPOTTING_FLOW_FOLLOWUP_DAYS);
    if (windowEnd > today) continue;

    let hasFlowSoon = false;
    let cursor = addDays(ep.lastDate, 1);
    while (cursor <= windowEnd) {
      const log = byDate.get(cursor);
      if (log?.flow && REAL_FLOW_SET.has(log.flow)) {
        hasFlowSoon = true;
        break;
      }
      cursor = addDays(cursor, 1);
    }
    if (!hasFlowSoon) {
      hasFlowSoon = periodEpisodes.some(
        (p) => p.startDate > ep.lastDate && p.startDate <= windowEnd,
      );
    }
    if (!hasFlowSoon) {
      inBetweenSpotting.push({
        id: `spot:${ep.firstDate}`,
        firstDate: ep.firstDate,
        lastDate: ep.lastDate,
        consecutiveDays: ep.maxConsecutiveSpottingDays,
      });
    }
  }

  let currentSpottingStreakDays = 0;
  let spotCursor = today;
  while (true) {
    const log = byDate.get(spotCursor);
    if (!log || log.flow !== 'spotting') break;
    currentSpottingStreakDays += 1;
    spotCursor = addDays(spotCursor, -1);
  }

  return {
    episodes,
    periodEpisodes,
    unclearEpisodes,
    inBetweenSpotting,
    currentSpottingStreakDays,
  };
}
