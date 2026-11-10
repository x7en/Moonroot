import { describe, expect, it } from 'vitest';
import { classifyEpisodes } from '../../core/cycles/episodes';
import { deriveCycles } from '../../core/cycles/cycles';
import { addDays } from '../../core/model/dates';
import type { DayLog, Decision, Forecast, Profile } from '../../core/model/types';
import { computeConfidence } from '../../core/predict/confidence';
import {
  computeLivePrediction,
  reconcileForecasts,
} from '../../core/predict/forecast';
import { analyzeLeadInPattern } from '../../core/predict/leadIn';
import {
  sampleStdDev,
  weightedQuantile,
  weightedQuantiles,
} from '../../core/predict/quantiles';

const ADULT_PROFILE: Profile = {
  schemaVersion: 1,
  createdAt: '2025-01-01T08:00:00+05:00',
  birthYear: 1998,
  menarcheAge: 13,
  selfRegularity: 'irregular',
  lastPeriodApprox: null,
  onHormones: false,
  contraception: 'none',
  sexualHealthQuestions: 'when-relevant',
  intimacy: 'active',
  conditionsNote: '',
  medicationsNote: '',
  sproutName: null,
  theme: 'dusk',
  units: { temperature: 'C', water: 'ml' },
  reminders: {
    daily: { on: false, time: '20:00' },
    watchlist: true,
    quietFrom: '22:00',
    quietTo: '07:00',
  },
  discreetMode: false,
  lock: { type: 'none' },
  locale: 'en',
  region: 'PK',
  disclaimerAcceptedAt: '2025-01-01T08:00:00+05:00',
};

const TEEN_PROFILE: Profile = {
  ...ADULT_PROFILE,
  birthYear: 2011, // age 15 in 2026 -> 2 years since menarche (< 3 => ACOG)
  menarcheAge: 13,
};

function makeDay(date: string, extra: Partial<DayLog> = {}): DayLog {
  return {
    date,
    filledFrom: 'live',
    flow: 'none',
    symptoms: [],
    danger: [],
    dangerAnswered: true,
    note: '',
    updatedAt: `${date}T10:00:00+05:00`,
    ...extra,
  };
}

function buildCycleLogs(
  startDate: string,
  lengths: readonly number[],
  options: {
    approximateIndices?: ReadonlySet<number>;
    leadInOffsetsByCycle?: ReadonlyMap<number, number>;
    signalType?: 'spotting' | 'cramps';
  } = {},
): DayLog[] {
  const logs: DayLog[] = [];
  let cursor = startDate;
  for (let i = 0; i <= lengths.length; i += 1) {
    const isApprox = options.approximateIndices?.has(i) ?? false;
    logs.push(
      makeDay(cursor, {
        flow: 'medium',
        filledFrom: isApprox ? 'approximate' : 'live',
      }),
      makeDay(addDays(cursor, 1), {
        flow: 'medium',
        filledFrom: isApprox ? 'approximate' : 'live',
      }),
    );

    const len = lengths[i];
    if (len !== undefined) {
      const nextStart = addDays(cursor, len);
      const offset = options.leadInOffsetsByCycle?.get(i);
      if (offset !== undefined) {
        const sigDate = addDays(nextStart, -offset);
        if (options.signalType === 'cramps') {
          logs.push(makeDay(sigDate, { flow: 'none', pain: { level: 4, sites: ['lower-middle'] } }));
        } else {
          logs.push(makeDay(sigDate, { flow: 'spotting' }));
        }
      }
      cursor = nextStart;
    }
  }
  return logs;
}

describe('Step 3 quantiles, priors, confidence, lead-in patterns, and forecasts', () => {
  it('computes weighted quantiles with midpoint interpolation and sample standard deviation', () => {
    const priors = [25, 28, 30, 33, 37].map((value) => ({ value, weight: 0.4 }));
    const qs = weightedQuantiles(priors);
    expect(qs.q10).toBeCloseTo(25, 6);
    expect(qs.q25).toBeCloseTo(27.25, 6);
    expect(qs.q50).toBeCloseTo(30, 6);
    expect(qs.q75).toBeCloseTo(34, 6);
    expect(qs.q90).toBeCloseTo(37, 6);

    // Clamping outside empirical midpoint bounds and single-element lists
    expect(weightedQuantile([{ value: 29, weight: 1 }], 0.1)).toBe(29);
    expect(weightedQuantile([{ value: 29, weight: 1 }], 0.9)).toBe(29);
    expect(weightedQuantile([{ value: 20, weight: 1 }, { value: 40, weight: 1 }], 0.05)).toBe(20);
    expect(weightedQuantile([{ value: 20, weight: 1 }, { value: 40, weight: 1 }], 0.99)).toBe(40);
    expect(() => weightedQuantile([], 0.5)).toThrow();

    expect(sampleStdDev([5])).toBeNull();
    expect(sampleStdDev([5, 5, 5])).toBe(0);
    expect(sampleStdDev([5, 7, 9])).toBeCloseTo(2, 6);
  });

  it('uses FIGO vs ACOG priors below 8 cycles, drops priors at 8+, and drops likely window when fewer than 3 lengths exceed d', () => {
    const today = '2026-10-30';
    const emptyEpisodes = classifyEpisodes([], [], today);
    const emptyCycles = deriveCycles(emptyEpisodes, [], today);

    const adultZero = computeLivePrediction({
      today,
      profile: ADULT_PROFILE,
      cycles: emptyCycles,
      dayLogs: [],
      decisions: [],
      existingForecasts: [],
    });
    expect(adultZero.confidence.score).toBe(10);
    expect(adultZero.forecast).toBeNull();
    expect(adultZero.priorUsed).toBe('FIGO');
    expect(adultZero.priorLengthRange).toEqual({
      q10: 25,
      q25: 27,
      q50: 30,
      q75: 34,
      q90: 37,
    });

    const teenZero = computeLivePrediction({
      today,
      profile: TEEN_PROFILE,
      cycles: emptyCycles,
      dayLogs: [],
      decisions: [],
      existingForecasts: [],
    });
    expect(teenZero.confidence.score).toBe(10);
    expect(teenZero.priorUsed).toBe('ACOG');
    expect(teenZero.priorLengthRange).toEqual({
      q10: 23,
      q25: 27,
      q50: 32,
      q75: 39,
      q90: 43,
    });

    // Conditional recomputation: 10 real cycles of [28, 29, 30, 29, 28, 30, 31, 45, 52, 29]
    const logs = buildCycleLogs('2025-11-01', [28, 29, 30, 29, 28, 30, 31, 45, 52, 29]);
    const lastStart = logs
      .filter((l) => l.flow === 'medium')
      .map((l) => l.date)
      .sort()
      .slice(-2)[0] as string;

    // On day 46 since lastStart, only [52] (> 46) remains (< 3) -> drops likely window and shows Day d + longest gap M=52
    const day46 = addDays(lastStart, 46);
    const ep = classifyEpisodes(logs, [], day46);
    const cyc = deriveCycles(ep, [], day46);
    const rec = reconcileForecasts({
      today: day46,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions: [],
      existingForecasts: [],
    });
    const conditional = computeLivePrediction({
      today: day46,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions: [],
      existingForecasts: rec.forecasts,
    });
    expect(conditional.priorUsed).toBe('none');
    expect(conditional.daysSinceStart).toBe(46);
    expect(conditional.longestGapDays).toBe(52);
    expect(conditional.likely).toBeNull();
    expect(conditional.droppedLikelyWindow).toBe(true);
    expect(conditional.possible).toEqual([day46, addDays(lastStart, Math.max(52, 46 + 14))]);
  });

  it('calculates confidence strictly from C, S, T, counts approximate cycles at 0.5, excludes approximate from T, and emits variability note', () => {
    const start = '2025-01-01';
    const irregularLengths = [22, 65, 24, 72, 25, 68, 23, 74, 24];
    const logs = buildCycleLogs(start, irregularLengths, {
      approximateIndices: new Set([0]),
    });
    const lastDate = addDays(
      logs.map((l) => l.date).sort()[logs.length - 1] as string,
      5,
    );
    const ep = classifyEpisodes(logs, [], lastDate);
    const cyc = deriveCycles(ep, [], lastDate);
    const rec = reconcileForecasts({
      today: lastDate,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions: [],
      existingForecasts: [],
    });

    const conf = computeConfidence({
      activeCycles: cyc.recentValidCyclesAfterBaseline,
      resolvedForecasts: rec.forecasts,
      cycles: cyc.cycles,
      newBaselineDate: cyc.newBaselineDate,
    });
    // Cycle 0 is approximate -> its anchor forecast must not count in T, and n = 8.5
    expect(conf.effectiveCycles).toBe(8.5);
    expect(conf.score).toBeLessThanOrEqual(95);
    expect(conf.score).toBeGreaterThan(10);
    expect(conf.highVariabilityNote).toBe(true);
    expect(conf.resolvedCount).toBeGreaterThanOrEqual(4);

    // Check monotonicity & cap <= 95 for super regular cycles
    const regLogs = buildCycleLogs('2025-01-01', Array<number>(12).fill(28));
    const regEnd = addDays(regLogs[regLogs.length - 1]?.date ?? '2026-01-01', 2);
    const regCyc = deriveCycles(classifyEpisodes(regLogs, [], regEnd), [], regEnd);
    const regRec = reconcileForecasts({
      today: regEnd,
      profile: ADULT_PROFILE,
      cycles: regCyc,
      dayLogs: regLogs,
      decisions: [],
      existingForecasts: [],
    });
    const regConf = computeConfidence({
      activeCycles: regCyc.recentValidCyclesAfterBaseline,
      resolvedForecasts: regRec.forecasts,
      cycles: regCyc.cycles,
      newBaselineDate: null,
    });
    expect(regConf.score).toBeLessThanOrEqual(95);
    expect(regConf.score).toBeGreaterThanOrEqual(80);
  });

  it('learns lead-in patterns (>=4 offsets, sd<=2, >=60% followed), ignores <60% unreliable signals, and retires on 2/3 misses', () => {
    // 5 cycles with offsets 6, 7, 6, 8, 7 (sd < 2, 100% followed) + a new signal 3 days ago
    const offsets = new Map<number, number>([
      [0, 6],
      [1, 7],
      [2, 6],
      [3, 8],
      [4, 7],
    ]);
    const logs = buildCycleLogs('2025-06-01', [32, 41, 28, 50, 38], {
      leadInOffsetsByCycle: offsets,
      signalType: 'cramps',
    });
    const lastPeriodDate = logs
      .filter((l) => l.flow === 'medium')
      .map((l) => l.date)
      .sort()
      .slice(-2)[0] as string;
    const activeSignalDate = addDays(lastPeriodDate, 20);
    const todayWithSignal = addDays(activeSignalDate, 2);
    logs.push(
      makeDay(activeSignalDate, { flow: 'spotting' }),
      makeDay(todayWithSignal, { flow: 'none' }),
    );

    const cyc = deriveCycles(classifyEpisodes(logs, [], todayWithSignal), [], todayWithSignal);
    const leadIn = analyzeLeadInPattern({
      today: todayWithSignal,
      dayLogs: logs,
      cycles: cyc,
      resolvedForecasts: [],
    });
    expect(leadIn.status).toBe('learned');
    expect(leadIn.offsets).toEqual([6, 7, 6, 8, 7]);
    expect(leadIn.activeSignalDate).toBe(activeSignalDate);

    const live = computeLivePrediction({
      today: todayWithSignal,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions: [],
      existingForecasts: [],
    });
    expect(live.basis).toBe('lead-in-pattern');
    expect(live.likely).not.toBeNull();

    // Unreliable signals (< 60% followed by flow): add 6 mid-cycle unfollowed spotting clusters > 14d from flow
    const noisyLogs = [...logs];
    noisyLogs.push(
      makeDay('2025-06-08', { flow: 'spotting' }),
      makeDay('2025-07-10', { flow: 'spotting' }),
      makeDay('2025-08-18', { flow: 'spotting' }),
      makeDay('2025-09-12', { flow: 'spotting' }),
      makeDay('2025-10-01', { flow: 'spotting' }),
      makeDay('2025-11-12', { flow: 'spotting' }),
    );
    const noisyCyc = deriveCycles(
      classifyEpisodes(noisyLogs, [], todayWithSignal),
      [],
      todayWithSignal,
    );
    const unreliable = analyzeLeadInPattern({
      today: todayWithSignal,
      dayLogs: noisyLogs,
      cycles: noisyCyc,
      resolvedForecasts: [],
    });
    expect(unreliable.status).toBe('unreliable');

    // Retired after missing its likely window in 2 of the last 3 lead-in uses
    const resolvedMisses: Forecast[] = [
      {
        id: 'f1',
        anchor: '2025-08-01',
        madeOn: '2025-08-20',
        basis: 'lead-in-pattern',
        cyclesUsed: 4,
        confidence: 60,
        likely: ['2025-08-26', '2025-08-28'],
        possible: ['2025-08-25', '2025-08-29'],
        peak: '2025-08-27',
        rulesetVersion: '1.0',
        outcome: { actualStart: '2025-09-02', inLikely: false, inPossible: false, errorDays: 6 },
      },
      {
        id: 'f2',
        anchor: '2025-09-02',
        madeOn: '2025-09-25',
        basis: 'lead-in-pattern',
        cyclesUsed: 5,
        confidence: 62,
        likely: ['2025-10-01', '2025-10-03'],
        possible: ['2025-09-30', '2025-10-04'],
        peak: '2025-10-02',
        rulesetVersion: '1.0',
        outcome: { actualStart: '2025-10-02', inLikely: true, inPossible: true, errorDays: 0 },
      },
      {
        id: 'f3',
        anchor: '2025-10-02',
        madeOn: '2025-10-25',
        basis: 'lead-in-pattern',
        cyclesUsed: 6,
        confidence: 64,
        likely: ['2025-10-31', '2025-11-02'],
        possible: ['2025-10-30', '2025-11-03'],
        peak: '2025-11-01',
        rulesetVersion: '1.0',
        outcome: { actualStart: '2025-11-10', inLikely: false, inPossible: false, errorDays: 9 },
      },
    ];
    const retired = analyzeLeadInPattern({
      today: todayWithSignal,
      dayLogs: logs,
      cycles: cyc,
      resolvedForecasts: resolvedMisses,
    });
    expect(retired.status).toBe('retired');
    expect(retired.retiredMessage).toBe('This pattern is not holding.');
  });

  it('freezes forecasts without hindsight and respects new-baseline decisions', () => {
    const logs = buildCycleLogs('2025-05-01', [28, 30, 29, 31, 28, 29]);
    const today = '2026-01-10';
    const decisions: Decision[] = [
      {
        id: 'd-base',
        date: '2025-09-25',
        kind: 'new-baseline',
        at: '2025-09-25T09:00:00+05:00',
      },
    ];
    const cyc = deriveCycles(classifyEpisodes(logs, decisions, today), decisions, today);
    const rec = reconcileForecasts({
      today,
      profile: ADULT_PROFILE,
      cycles: cyc,
      dayLogs: logs,
      decisions,
      existingForecasts: [],
    });
    // Every frozen forecast must use only cycles strictly before its anchor
    for (let i = 1; i < rec.forecasts.length; i += 1) {
      const prev = rec.forecasts[i - 1];
      const cur = rec.forecasts[i];
      if (!prev || !cur) continue;
      expect(prev.anchor <= cur.anchor).toBe(true);
    }
    expect(rec.forecasts.every((f) => f.anchor >= '2025-09-25')).toBe(true);
  });

  it('covers edge cases: single open period, multi-day signal cluster, lead-in reconciliation, outcome clearing, ignore-in-predictions, and <10d/150d cycles', () => {
    // 1. Unknown menarche/birthYear defaults to FIGO, 1 open period at day 50 -> drops likely window with null longestGapDays
    const unknownProfile: Profile = {
      ...ADULT_PROFILE,
      birthYear: null,
      menarcheAge: null,
    };
    const oneLog: DayLog[] = [
      makeDay('2026-01-01', { flow: 'medium' }),
      makeDay('2026-01-02', { flow: 'medium' }),
    ];
    const day50 = addDays('2026-01-01', 50);
    const ep1 = classifyEpisodes(oneLog, [], day50);
    const cyc1 = deriveCycles(ep1, [], day50);
    const pred1 = computeLivePrediction({
      today: day50,
      profile: unknownProfile,
      cycles: cyc1,
      dayLogs: oneLog,
      decisions: [],
      existingForecasts: [],
    });
    expect(pred1.priorUsed).toBe('FIGO');
    expect(pred1.longestGapDays).toBeNull();
    expect(pred1.droppedLikelyWindow).toBe(true);
    expect(pred1.possible).toEqual([day50, addDays('2026-01-01', 64)]);

    // 2. Normal live cycle prediction on day 12 (cycle-lengths basis)
    const twoCycleLogs = buildCycleLogs('2025-10-01', [28, 30]);
    const day12 = addDays('2025-11-28', 12);
    const ep2 = classifyEpisodes(twoCycleLogs, [], day12);
    const cyc2 = deriveCycles(ep2, [], day12);
    const live2 = computeLivePrediction({
      today: day12,
      profile: ADULT_PROFILE,
      cycles: cyc2,
      dayLogs: twoCycleLogs,
      decisions: [],
      existingForecasts: [],
    });
    expect(live2.basis).toBe('cycle-lengths');
    expect(live2.droppedLikelyWindow).toBe(false);
    expect(live2.forecast?.anchor).toBe('2025-11-28');

    // 3. Reconcile with multi-day signal clusters + lead-in frozen forecasts + ignore-in-predictions + 150d & <10d cycles
    const offsets = new Map<number, number>([
      [0, 6],
      [1, 7],
      [2, 6],
      [3, 7],
      [4, 6],
      [5, 7],
    ]);
    const leadLogs = buildCycleLogs('2025-01-01', [29, 31, 30, 32, 28, 30], {
      leadInOffsetsByCycle: offsets,
      signalType: 'cramps',
    });
    // Add consecutive cramp day in cycle 0 to test 14-day window deduplication
    const c0Sig = addDays('2025-01-30', -5);
    leadLogs.push(makeDay(c0Sig, { flow: 'none', pain: { level: 3, sites: ['lower-middle'] } }));

    // Add an <10d gap episode and a 150d cycle episode at end
    const lastPeriodStart = leadLogs
      .filter((l) => l.flow === 'medium')
      .map((l) => l.date)
      .sort()
      .slice(-2)[0] as string;
    const tooShort = addDays(lastPeriodStart, 7);
    const long150 = addDays(tooShort, 150);
    leadLogs.push(
      makeDay(tooShort, { flow: 'medium' }),
      makeDay(addDays(tooShort, 1), { flow: 'medium' }),
      makeDay(long150, { flow: 'medium' }),
      makeDay(addDays(long150, 1), { flow: 'medium' }),
    );
    const endDay = addDays(long150, 5);
    const epLead = classifyEpisodes(leadLogs, [], endDay);
    const cycLead = deriveCycles(epLead, [], endDay);
    const recLead = reconcileForecasts({
      today: endDay,
      profile: ADULT_PROFILE,
      cycles: cycLead,
      dayLogs: leadLogs,
      decisions: [],
      existingForecasts: [],
    });
    expect(recLead.changed).toBe(true);
    expect(recLead.forecasts.some((f) => f.basis === 'lead-in-pattern' && f.outcome !== undefined)).toBe(true);

    // 4. Clearing outcome if a subsequent period start is removed/marked not-a-period
    const staleForecast: Forecast = {
      id: 'forecast:cycle:2025-11-28',
      anchor: '2025-11-28',
      madeOn: '2025-11-28',
      basis: 'cycle-lengths',
      cyclesUsed: 2,
      confidence: 30,
      likely: ['2025-12-26', '2025-12-29'],
      possible: ['2025-12-24', '2026-01-01'],
      peak: '2025-12-27',
      rulesetVersion: '1.0',
      outcome: { actualStart: '2025-12-28', inLikely: true, inPossible: true, errorDays: 1 },
    };
    const cleared = reconcileForecasts({
      today: day12,
      profile: ADULT_PROFILE,
      cycles: cyc2,
      dayLogs: twoCycleLogs,
      decisions: [],
      existingForecasts: [staleForecast],
    });
    const updatedStale = cleared.forecasts.find((f) => f.id === staleForecast.id);
    expect(updatedStale?.outcome).toBeUndefined();
    expect(cleared.changed).toBe(true);
  });
});
