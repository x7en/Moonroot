import type { DerivedCycleSummary } from '../cycles/cycles';
import { addDays, diffDays } from '../model/dates';
import type { DateKey, DayLog } from '../model/types';
import { weightedQuantiles } from '../predict/quantiles';

export type OvulationSignalKind = 'bbt' | 'lh' | 'mucus';
export type OvulationStatus = 'none' | 'probable' | 'confirmed';

export interface BbTShiftDetection {
  readonly shiftStartDate: DateKey;
  readonly ovulationDate: DateKey;
  readonly baselineMaxC: number;
  readonly thirdReadingC: number;
}

export interface OvulationSignalEstimate {
  readonly kind: OvulationSignalKind;
  readonly sourceDate: DateKey;
  readonly estimateDate: DateKey;
  readonly label: string;
}

export interface CycleOvulationAssessment {
  readonly cycleIndex: number | null;
  readonly startDate: DateKey | null;
  readonly endDateExclusive: DateKey | null;
  readonly status: OvulationStatus;
  readonly ovulationDate: DateKey | null;
  readonly signals: readonly OvulationSignalEstimate[];
  readonly bbtShift: BbTShiftDetection | null;
  readonly nonIllnessBbtCount: number;
  readonly lhPositiveCount: number;
  readonly fertileMucusCount: number;
  readonly message: string;
}

export interface LutealSummary {
  readonly count: number;
  readonly q10: number;
  readonly q25: number;
  readonly q50: number;
  readonly q75: number;
  readonly q90: number;
}

export interface OvulationAnalysisResult {
  readonly current: CycleOvulationAssessment;
  readonly completedCycles: readonly CycleOvulationAssessment[];
  readonly learnedLutealLengths: readonly number[];
  readonly lutealSummary: LutealSummary | null;
  readonly anySignalLogged: boolean;
  readonly anyBbtLogged: boolean;
  readonly anyLhLogged: boolean;
  readonly anyMucusLogged: boolean;
  readonly bbtDaysWithoutShift: number;
  readonly fortyPlusTempDaysNoShift: boolean;
}

const FLOAT_EPS = 1e-9;

function sortLogsUpToToday(dayLogs: readonly DayLog[], today: DateKey): DayLog[] {
  return [...dayLogs]
    .filter((d) => d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function detectBbtShift(logsInWindow: readonly DayLog[]): {
  shift: BbTShiftDetection | null;
  nonIllnessCount: number;
} {
  const bbtReadings = logsInWindow.filter(
    (log) =>
      log.fertility?.bbt !== undefined &&
      Number.isFinite(log.fertility.bbt) &&
      log.context?.illness !== true,
  );
  const nonIllnessCount = bbtReadings.length;
  if (bbtReadings.length < 9) {
    return { shift: null, nonIllnessCount };
  }

  for (let i = 6; i <= bbtReadings.length - 3; i += 1) {
    let baselineMax = -Infinity;
    for (let j = i - 6; j < i; j += 1) {
      const val = bbtReadings[j]?.fertility?.bbt;
      if (val !== undefined && val > baselineMax) {
        baselineMax = val;
      }
    }
    const r0 = bbtReadings[i];
    const r1 = bbtReadings[i + 1];
    const r2 = bbtReadings[i + 2];
    const t0 = r0?.fertility?.bbt;
    const t1 = r1?.fertility?.bbt;
    const t2 = r2?.fertility?.bbt;
    if (
      r0 &&
      t0 !== undefined &&
      t1 !== undefined &&
      t2 !== undefined &&
      t0 > baselineMax + FLOAT_EPS &&
      t1 > baselineMax + FLOAT_EPS &&
      t2 > baselineMax + FLOAT_EPS &&
      t2 >= baselineMax + 0.2 - FLOAT_EPS
    ) {
      return {
        shift: {
          shiftStartDate: r0.date,
          ovulationDate: addDays(r0.date, -1),
          baselineMaxC: baselineMax,
          thirdReadingC: t2,
        },
        nonIllnessCount,
      };
    }
  }

  return { shift: null, nonIllnessCount };
}

function detectLhEstimate(logsInWindow: readonly DayLog[]): {
  estimate: OvulationSignalEstimate | null;
  positiveCount: number;
} {
  const positiveLogs = logsInWindow.filter((log) => log.fertility?.lh === 'positive');
  const lastPositive = positiveLogs[positiveLogs.length - 1];
  if (!lastPositive) {
    return { estimate: null, positiveCount: 0 };
  }
  return {
    estimate: {
      kind: 'lh',
      sourceDate: lastPositive.date,
      estimateDate: addDays(lastPositive.date, 1),
      label: 'positive LH strip (24 to 36 hours)',
    },
    positiveCount: positiveLogs.length,
  };
}

function detectMucusEstimate(logsInWindow: readonly DayLog[]): {
  estimate: OvulationSignalEstimate | null;
  fertileCount: number;
} {
  const fertileLogs = logsInWindow.filter(
    (log) => log.fertility?.mucus === 'watery' || log.fertility?.mucus === 'egg-white',
  );
  const peakLog = fertileLogs[fertileLogs.length - 1];
  if (!peakLog) {
    return { estimate: null, fertileCount: 0 };
  }
  return {
    estimate: {
      kind: 'mucus',
      sourceDate: peakLog.date,
      estimateDate: addDays(peakLog.date, 1),
      label: 'watery or egg-white mucus peak (1 to 2 days)',
    },
    fertileCount: fertileLogs.length,
  };
}

function resolveAgreement(signals: readonly OvulationSignalEstimate[]): {
  status: OvulationStatus;
  ovulationDate: DateKey | null;
  message: string;
} {
  if (signals.length === 0) {
    return {
      status: 'none',
      ovulationDate: null,
      message: 'Not enough signals to estimate ovulation',
    };
  }
  if (signals.length === 1) {
    const only = signals[0] as OvulationSignalEstimate;
    return {
      status: 'probable',
      ovulationDate: only.estimateDate,
      message: `Probable ovulation from ${only.label}.`,
    };
  }

  let bestPair: [OvulationSignalEstimate, OvulationSignalEstimate] | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < signals.length; i += 1) {
    for (let j = i + 1; j < signals.length; j += 1) {
      const a = signals[i];
      const b = signals[j];
      if (!a || !b) continue;
      const gap = Math.abs(diffDays(a.estimateDate, b.estimateDate));
      if (gap <= 5 && gap < bestGap) {
        bestGap = gap;
        bestPair = [a, b];
      }
    }
  }

  if (bestPair) {
    const agreeing = signals.filter((sig) =>
      bestPair.some((member) => Math.abs(diffDays(sig.estimateDate, member.estimateDate)) <= 5),
    );
    const bbtSignal = agreeing.find((s) => s.kind === 'bbt');
    let chosenDate: DateKey;
    if (bbtSignal) {
      chosenDate = bbtSignal.estimateDate;
    } else {
      const anchor = agreeing[0] as OvulationSignalEstimate;
      const meanOffset =
        agreeing.reduce((acc, sig) => acc + diffDays(anchor.estimateDate, sig.estimateDate), 0) /
        agreeing.length;
      chosenDate = addDays(anchor.estimateDate, Math.round(meanOffset));
    }
    return {
      status: 'confirmed',
      ovulationDate: chosenDate,
      message: `Confirmed ovulation estimate (${agreeing.length} signals agreed within 5 days).`,
    };
  }

  const bbtFallback = signals.find((s) => s.kind === 'bbt');
  const latestSignal = signals[signals.length - 1] as OvulationSignalEstimate;
  const chosen = bbtFallback ?? latestSignal;
  return {
    status: 'probable',
    ovulationDate: chosen.estimateDate,
    message: `Probable ovulation from ${chosen.label} (signals were more than 5 days apart).`,
  };
}

function assessWindow(params: {
  cycleIndex: number | null;
  startDate: DateKey | null;
  endDateExclusive: DateKey | null;
  logsInWindow: readonly DayLog[];
}): CycleOvulationAssessment {
  const { cycleIndex, startDate, endDateExclusive, logsInWindow } = params;
  const bbtRes = detectBbtShift(logsInWindow);
  const lhRes = detectLhEstimate(logsInWindow);
  const mucusRes = detectMucusEstimate(logsInWindow);

  const signals: OvulationSignalEstimate[] = [];
  if (bbtRes.shift) {
    signals.push({
      kind: 'bbt',
      sourceDate: bbtRes.shift.shiftStartDate,
      estimateDate: bbtRes.shift.ovulationDate,
      label: 'temperature shift (3-over-6)',
    });
  }
  if (lhRes.estimate) {
    signals.push(lhRes.estimate);
  }
  if (mucusRes.estimate) {
    signals.push(mucusRes.estimate);
  }

  const resolved = resolveAgreement(signals);
  return {
    cycleIndex,
    startDate,
    endDateExclusive,
    status: resolved.status,
    ovulationDate: resolved.ovulationDate,
    signals,
    bbtShift: bbtRes.shift,
    nonIllnessBbtCount: bbtRes.nonIllnessCount,
    lhPositiveCount: lhRes.positiveCount,
    fertileMucusCount: mucusRes.fertileCount,
    message: resolved.message,
  };
}

export function analyzeOvulation(input: {
  today: DateKey;
  dayLogs: readonly DayLog[];
  cycles: DerivedCycleSummary;
}): OvulationAnalysisResult {
  const { today, dayLogs, cycles } = input;
  const sortedLogs = sortLogsUpToToday(dayLogs, today);

  const anyBbtLogged = sortedLogs.some((l) => l.fertility?.bbt !== undefined);
  const anyLhLogged = sortedLogs.some((l) => l.fertility?.lh !== undefined);
  const anyMucusLogged = sortedLogs.some((l) => l.fertility?.mucus !== undefined);
  const anySignalLogged = anyBbtLogged || anyLhLogged || anyMucusLogged;

  const completedCycles: CycleOvulationAssessment[] = [];
  const learnedLutealLengths: number[] = [];

  for (let i = 0; i < cycles.cycles.length; i += 1) {
    const cycle = cycles.cycles[i];
    if (!cycle) continue;
    const logsInCycle = sortedLogs.filter(
      (l) => l.date >= cycle.startDate && l.date < cycle.nextStartDate,
    );
    const assessment = assessWindow({
      cycleIndex: i,
      startDate: cycle.startDate,
      endDateExclusive: cycle.nextStartDate,
      logsInWindow: logsInCycle,
    });
    completedCycles.push(assessment);

    if (
      !cycle.beforeBaseline &&
      !cycle.ignoredInPredictions &&
      cycle.isValidLength &&
      assessment.status === 'confirmed' &&
      assessment.ovulationDate !== null
    ) {
      const lutealDays = diffDays(assessment.ovulationDate, cycle.nextStartDate);
      if (lutealDays >= 1 && lutealDays < cycle.lengthDays) {
        learnedLutealLengths.push(lutealDays);
      }
    }
  }

  let current: CycleOvulationAssessment;
  if (cycles.openCycle) {
    const openStart = cycles.openCycle.startDate;
    const logsInOpen = sortedLogs.filter((l) => l.date >= openStart && l.date <= today);
    current = assessWindow({
      cycleIndex: null,
      startDate: openStart,
      endDateExclusive: null,
      logsInWindow: logsInOpen,
    });
  } else {
    current = assessWindow({
      cycleIndex: null,
      startDate: null,
      endDateExclusive: null,
      logsInWindow: sortedLogs,
    });
  }

  let lutealSummary: LutealSummary | null = null;
  if (learnedLutealLengths.length >= 2) {
    const decay = 0.85;
    const count = learnedLutealLengths.length;
    const weighted = learnedLutealLengths.map((value, idx) => ({
      value,
      weight: Math.pow(decay, count - 1 - idx),
    }));
    const qs = weightedQuantiles(weighted);
    lutealSummary = {
      count,
      q10: Math.round(qs.q10),
      q25: Math.round(qs.q25),
      q50: Math.round(qs.q50),
      q75: Math.round(qs.q75),
      q90: Math.round(qs.q90),
    };
  }

  const allAssessments = [...completedCycles, current];
  const anyShiftEver = allAssessments.some((a) => a.bbtShift !== null);
  const totalNonIllnessBbt = sortedLogs.filter(
    (l) => l.fertility?.bbt !== undefined && l.context?.illness !== true,
  ).length;
  const bbtDaysWithoutShift =
    current.bbtShift === null && current.nonIllnessBbtCount >= 40
      ? current.nonIllnessBbtCount
      : !anyShiftEver
        ? totalNonIllnessBbt
        : 0;
  const fortyPlusTempDaysNoShift = bbtDaysWithoutShift >= 40;

  return {
    current,
    completedCycles,
    learnedLutealLengths,
    lutealSummary,
    anySignalLogged,
    anyBbtLogged,
    anyLhLogged,
    anyMucusLogged,
    bbtDaysWithoutShift,
    fortyPlusTempDaysNoShift,
  };
}
