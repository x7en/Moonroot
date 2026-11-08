import { deriveCycles } from '../core/cycles/cycles';
import { classifyEpisodes } from '../core/cycles/episodes';
import { addDays, diffDays } from '../core/model/dates';
import type { DayLog, Forecast, Profile } from '../core/model/types';
import { computeConfidence } from '../core/predict/confidence';
import { computeLivePrediction, reconcileForecasts } from '../core/predict/forecast';
import { analyzeLeadInPattern } from '../core/predict/leadIn';

const GROUP_SIZE = 450;
const CYCLES_PER_PERSON = 16;
const BASE_SEED = 20261108;

function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function makeProfile(adolescent: boolean): Profile {
  return {
    schemaVersion: 1,
    createdAt: '2025-01-01T08:00:00+00:00',
    birthYear: adolescent ? 2011 : 1998,
    menarcheAge: 13,
    selfRegularity: adolescent ? 'irregular' : 'regular',
    lastPeriodApprox: null,
    onHormones: false,
    contraception: 'none',
    sexualHealthQuestions: 'when-relevant',
    intimacy: 'none',
    conditionsNote: '',
    medicationsNote: '',
    sproutName: null,
    theme: 'dusk',
    units: { temperature: 'C', water: 'ml' },
    reminders: {
      daily: { on: false, time: '20:00' },
      watchlist: true,
      quietFrom: '22:00',
      quietTo: '08:00',
    },
    discreetMode: true,
    lock: { type: 'none' },
    locale: 'en',
    region: 'PK',
    disclaimerAcceptedAt: '2025-01-01T08:00:00+00:00',
  };
}

function drawRegular(rng: () => number): number {
  return Math.max(21, Math.round(gaussian(rng, 29, 2.2)));
}

function drawModerate(rng: () => number): number {
  return Math.min(60, Math.max(21, Math.round(gaussian(rng, 36, 7))));
}

function drawVeryIrregular(rng: () => number): number {
  const u = rng();
  if (u < 0.55) {
    return Math.max(24, Math.round(gaussian(rng, 42, 10)));
  }
  if (u < 0.80) {
    return 25 + Math.floor(rng() * 12); // 25..36
  }
  return 60 + Math.floor(rng() * 36); // 60..95
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

interface GroupStats {
  name: string;
  meanConfByCycle: number[];
  maxMeanStepJump: number;
  maxSinglePersonJump: number;
  minConf: number;
  maxConf: number;
  possibleHoldRateAfter4: number;
  likelyHoldRateAfter4: number;
  possibleWidthAt8: number;
  likelyWidthAt8: number;
}

function simulateGroup(
  name: string,
  drawLength: (rng: () => number) => number,
  adolescent: boolean,
  seedOffset: number,
): GroupStats {
  const rng = createRng(BASE_SEED + seedOffset);
  const profile = makeProfile(adolescent);

  const confBuckets: number[][] = Array.from({ length: CYCLES_PER_PERSON + 1 }, () => []);
  let after4Total = 0;
  let after4PossibleHits = 0;
  let after4LikelyHits = 0;
  const widthsPossAt8: number[] = [];
  const widthsLikeAt8: number[] = [];
  let maxSingleStepJump = -Infinity;
  let minConf = Infinity;
  let maxConf = -Infinity;

  for (let person = 0; person < GROUP_SIZE; person += 1) {
    const start0 = '2024-01-01';
    const lengths: number[] = [];
    for (let c = 0; c < CYCLES_PER_PERSON; c += 1) {
      lengths.push(drawLength(rng));
    }

    const dayLogs: DayLog[] = [];
    const startDates: string[] = [start0];
    let cur = start0;
    for (let i = 0; i <= lengths.length; i += 1) {
      dayLogs.push(
        {
          date: cur,
          filledFrom: 'live',
          flow: 'medium',
          symptoms: [],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: `${cur}T12:00:00+00:00`,
        },
        {
          date: addDays(cur, 1),
          filledFrom: 'live',
          flow: 'medium',
          symptoms: [],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: `${addDays(cur, 1)}T12:00:00+00:00`,
        },
      );
      const len = lengths[i];
      if (len !== undefined) {
        cur = addDays(cur, len);
        startDates.push(cur);
      }
    }

    // Walk step-by-step chronologically (no hindsight!)
    let forecasts: Forecast[] = [];
    // Cycle 0 before first period is logged: score with 0 cycles
    const zeroEp = classifyEpisodes([], [], '2023-12-20');
    const zeroCyc = deriveCycles(zeroEp, [], '2023-12-20');
    const zeroConf = computeConfidence({
      activeCycles: zeroCyc.recentValidCyclesAfterBaseline,
      resolvedForecasts: [],
      cycles: [],
      newBaselineDate: null,
    }).score;
    confBuckets[0]?.push(zeroConf);
    minConf = Math.min(minConf, zeroConf);
    maxConf = Math.max(maxConf, zeroConf);

    let prevScore = zeroConf;

    for (let k = 1; k <= CYCLES_PER_PERSON; k += 1) {
      const today = addDays(startDates[k] ?? start0, 2);
      const logsSoFar = dayLogs.filter((l) => l.date <= today);
      const ep = classifyEpisodes(logsSoFar, [], today);
      const cyc = deriveCycles(ep, [], today);
      const rec = reconcileForecasts({
        today,
        profile,
        cycles: cyc,
        dayLogs: logsSoFar,
        decisions: [],
        existingForecasts: forecasts,
      });
      forecasts = rec.forecasts;

      const conf = computeConfidence({
        activeCycles: cyc.recentValidCyclesAfterBaseline,
        resolvedForecasts: forecasts,
        cycles: cyc.cycles,
        newBaselineDate: null,
      }).score;

      confBuckets[k]?.push(conf);
      minConf = Math.min(minConf, conf);
      maxConf = Math.max(maxConf, conf);
      if (k >= 1) {
        maxSingleStepJump = Math.max(maxSingleStepJump, conf - prevScore);
      }
      prevScore = conf;

      // Record widths at cycle 8
      if (k === 8) {
        const anchor8 = startDates[8];
        const f8 = forecasts.find((f) => f.anchor === anchor8 && f.basis === 'cycle-lengths');
        if (f8) {
          widthsPossAt8.push(diffDays(f8.possible[0], f8.possible[1]));
          widthsLikeAt8.push(diffDays(f8.likely[0], f8.likely[1]));
        }
      }
    }

    // Score outcomes on forecasts made after >= 4 cycles (cyclesUsed >= 4)
    for (const f of forecasts) {
      if (f.basis === 'cycle-lengths' && f.cyclesUsed >= 4 && f.outcome) {
        after4Total += 1;
        if (f.outcome.inPossible) after4PossibleHits += 1;
        if (f.outcome.inLikely) after4LikelyHits += 1;
      }
    }
  }

  const meanConfByCycle = confBuckets.map((b) => mean(b));
  let maxMeanStepJump = -Infinity;
  for (let k = 1; k < meanConfByCycle.length; k += 1) {
    maxMeanStepJump = Math.max(
      maxMeanStepJump,
      (meanConfByCycle[k] ?? 0) - (meanConfByCycle[k - 1] ?? 0),
    );
  }

  return {
    name,
    meanConfByCycle,
    maxMeanStepJump,
    maxSinglePersonJump: maxSingleStepJump,
    minConf,
    maxConf,
    possibleHoldRateAfter4: after4Total > 0 ? after4PossibleHits / after4Total : 0,
    likelyHoldRateAfter4: after4Total > 0 ? after4LikelyHits / after4Total : 0,
    possibleWidthAt8: median(widthsPossAt8),
    likelyWidthAt8: median(widthsLikeAt8),
  };
}

function simulateLeadIn(): {
  realPatternLearnedAt5: number;
  realPatternLearnedAt8: number;
  medianErrBaseline: number;
  medianErrLeadIn: number;
  meanErrBaseline: number;
  meanErrLeadIn: number;
  leadInLikelyHeldRate: number;
  maxFalsePositiveRate4to12: number;
  falseRatesByLength: Record<number, number>;
} {
  const profile = makeProfile(true);
  const realRuns = 600;
  let learned5 = 0;
  let learned8 = 0;
  const baseErrors: number[] = [];
  const leadErrors: number[] = [];
  let leadLikelyHits = 0;
  let leadTested = 0;

  const rng = createRng(BASE_SEED + 999);
  for (let r = 0; r < realRuns; r += 1) {
    const logs: DayLog[] = [];
    const lengths: number[] = [];
    for (let c = 0; c < 9; c += 1) lengths.push(drawVeryIrregular(rng));

    const starts: string[] = ['2024-01-01'];
    let cur = '2024-01-01';
    for (let c = 0; c <= 9; c += 1) {
      logs.push(
        {
          date: cur,
          filledFrom: 'live',
          flow: 'medium',
          symptoms: [],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: `${cur}T12:00:00+00:00`,
        },
        {
          date: addDays(cur, 1),
          filledFrom: 'live',
          flow: 'medium',
          symptoms: [],
          danger: [],
          dangerAnswered: true,
          note: '',
          updatedAt: `${addDays(cur, 1)}T12:00:00+00:00`,
        },
      );
      if (c < 9) {
        const len = lengths[c] ?? 42;
        const next = addDays(cur, len);
        // Signal appears 5..9 days before flow in 4 of 5 cycles (or guaranteed on test cycle 9)
        const hasSignal = c === 8 ? true : rng() < 0.8;
        if (hasSignal) {
          const offset = 5 + Math.floor(rng() * 5); // 5..9
          const sigDate = addDays(next, -offset);
          logs.push({
            date: sigDate,
            filledFrom: 'live',
            flow: 'spotting',
            symptoms: [],
            danger: [],
            dangerAnswered: true,
            note: '',
            updatedAt: `${sigDate}T12:00:00+00:00`,
          });
        }
        cur = next;
        starts.push(cur);
      }
    }

    // Check learning rate at 5 cycles
    const t5 = addDays(starts[5] ?? '2024-06-01', 2);
    const logs5 = logs.filter((l) => l.date <= t5);
    const cyc5 = deriveCycles(classifyEpisodes(logs5, [], t5), [], t5);
    if (analyzeLeadInPattern({ today: t5, dayLogs: logs5, cycles: cyc5, resolvedForecasts: [] }).status === 'learned') {
      learned5 += 1;
    }

    // Check learning rate at 8 cycles & evaluate on 9th cycle at signal day
    const t8 = addDays(starts[8] ?? '2024-10-01', 2);
    const logs8 = logs.filter((l) => l.date <= t8);
    const cyc8 = deriveCycles(classifyEpisodes(logs8, [], t8), [], t8);
    const l8 = analyzeLeadInPattern({ today: t8, dayLogs: logs8, cycles: cyc8, resolvedForecasts: [] });
    if (l8.status === 'learned') {
      learned8 += 1;
    }

    // On cycle 9 signal day (before cycle 9 flow start starts[9]):
    const nextRealStart = starts[9] ?? '2025-01-01';
    const sig9 = logs.find((l) => l.date >= addDays(nextRealStart, -10) && l.date < nextRealStart && l.flow === 'spotting');
    if (sig9) {
      const logsAtSig9 = logs.filter((l) => l.date <= sig9.date);
      const cycAtSig9 = deriveCycles(classifyEpisodes(logsAtSig9, [], sig9.date), [], sig9.date);

      // Baseline forecast (cycle-lengths only, without lead-in):
      const liveWithoutLead = computeLivePrediction({
        today: sig9.date,
        profile,
        cycles: cycAtSig9,
        dayLogs: [],
        decisions: [],
        existingForecasts: [],
      });
      const liveWithLead = computeLivePrediction({
        today: sig9.date,
        profile,
        cycles: cycAtSig9,
        dayLogs: logsAtSig9,
        decisions: [],
        existingForecasts: [],
      });

      const basePeak = liveWithoutLead.peak ?? addDays(starts[8] ?? nextRealStart, 42);
      const leadPeak = liveWithLead.peak ?? basePeak;
      baseErrors.push(Math.abs(diffDays(basePeak, nextRealStart)));
      leadErrors.push(Math.abs(diffDays(leadPeak, nextRealStart)));

      if (liveWithLead.basis === 'lead-in-pattern' && liveWithLead.likely) {
        leadTested += 1;
        if (nextRealStart >= liveWithLead.likely[0] && nextRealStart <= liveWithLead.likely[1]) {
          leadLikelyHits += 1;
        }
      }
    }
  }

  // Random signals 1..14 days before flow: must learn <= 10% at every length 4..12
  const randRng = createRng(BASE_SEED + 777);
  const randRuns = 500;
  const falseRatesByLength: Record<number, number> = {};
  let maxFalsePositiveRate4to12 = 0;

  for (let lenCount = 4; lenCount <= 12; lenCount += 1) {
    let falseLearned = 0;
    for (let r = 0; r < randRuns; r += 1) {
      const logs: DayLog[] = [];
      let cur = '2024-01-01';
      for (let c = 0; c <= lenCount; c += 1) {
        logs.push(
          {
            date: cur,
            filledFrom: 'live',
            flow: 'medium',
            symptoms: [],
            danger: [],
            dangerAnswered: true,
            note: '',
            updatedAt: `${cur}T12:00:00+00:00`,
          },
          {
            date: addDays(cur, 1),
            filledFrom: 'live',
            flow: 'medium',
            symptoms: [],
            danger: [],
            dangerAnswered: true,
            note: '',
            updatedAt: `${addDays(cur, 1)}T12:00:00+00:00`,
          },
        );
        if (c < lenCount) {
          const cycLen = 28 + Math.floor(randRng() * 25); // 28..52
          const next = addDays(cur, cycLen);
          const randOffset = 1 + Math.floor(randRng() * 14); // 1..14 uniform
          const sigDate = addDays(next, -randOffset);
          logs.push({
            date: sigDate,
            filledFrom: 'live',
            flow: 'spotting',
            symptoms: [],
            danger: [],
            dangerAnswered: true,
            note: '',
            updatedAt: `${sigDate}T12:00:00+00:00`,
          });
          cur = next;
        }
      }
      const today = addDays(cur, 2);
      const cyc = deriveCycles(classifyEpisodes(logs, [], today), [], today);
      const analysis = analyzeLeadInPattern({
        today,
        dayLogs: logs,
        cycles: cyc,
        resolvedForecasts: [],
      });
      if (analysis.status === 'learned') {
        falseLearned += 1;
      }
    }
    const rate = falseLearned / randRuns;
    falseRatesByLength[lenCount] = rate;
    if (rate > maxFalsePositiveRate4to12) {
      maxFalsePositiveRate4to12 = rate;
    }
  }

  return {
    realPatternLearnedAt5: learned5 / realRuns,
    realPatternLearnedAt8: learned8 / realRuns,
    medianErrBaseline: median(baseErrors),
    medianErrLeadIn: median(leadErrors),
    meanErrBaseline: mean(baseErrors),
    meanErrLeadIn: mean(leadErrors),
    leadInLikelyHeldRate: leadTested > 0 ? leadLikelyHits / leadTested : 0,
    maxFalsePositiveRate4to12,
    falseRatesByLength,
  };
}

function main(): void {
  const regular = simulateGroup('Regular', drawRegular, false, 1);
  const moderate = simulateGroup('Moderately irregular', drawModerate, false, 2);
  const veryIrreg = simulateGroup('Very irregular', drawVeryIrregular, true, 3);
  const lead = simulateLeadIn();

  const groups = [regular, moderate, veryIrreg];

  console.log('\n=== Moonroot Step 3 Simulation Results (n=' + GROUP_SIZE + ' per group, 16 cycles each) ===');
  for (const g of groups) {
    console.log(
      `${g.name}: c0=${g.meanConfByCycle[0]?.toFixed(1)}, c3=${g.meanConfByCycle[3]?.toFixed(1)}, c4=${g.meanConfByCycle[4]?.toFixed(1)}, c5=${g.meanConfByCycle[5]?.toFixed(1)}, c8=${g.meanConfByCycle[8]?.toFixed(1)}, c12=${g.meanConfByCycle[12]?.toFixed(1)} | possHeld=${(g.possibleHoldRateAfter4 * 100).toFixed(1)}% (w8=${g.possibleWidthAt8}d), likeHeld=${(g.likelyHoldRateAfter4 * 100).toFixed(1)}% (w8=${g.likelyWidthAt8}d) | maxMeanJump=${g.maxMeanStepJump.toFixed(1)}`,
    );
  }
  console.log(
    `Lead-in pattern: learned@5=${(lead.realPatternLearnedAt5 * 100).toFixed(1)}%, learned@8=${(lead.realPatternLearnedAt8 * 100).toFixed(1)}% | medianErr: ${lead.medianErrBaseline}d -> ${lead.medianErrLeadIn}d | meanErr: ${lead.meanErrBaseline.toFixed(1)}d -> ${lead.meanErrLeadIn.toFixed(1)}d | likelyHeld=${(lead.leadInLikelyHeldRate * 100).toFixed(1)}%`,
  );
  console.log(
    `Random signals false-positive rates (4..12 cycles): ${Object.entries(lead.falseRatesByLength)
      .map(([k, v]) => `${k}c=${(v * 100).toFixed(1)}%`)
      .join(', ')} (max=${(lead.maxFalsePositiveRate4to12 * 100).toFixed(1)}%)`,
  );

  const failures: string[] = [];

  // Criterion 1: Confidence is exactly 10 with no cycles, and never above 95.
  for (const g of groups) {
    if (g.meanConfByCycle[0] !== 10 || g.minConf < 10) {
      failures.push(`${g.name}: c0 confidence must be 10 (got ${g.meanConfByCycle[0]})`);
    }
    if (g.maxConf > 95) {
      failures.push(`${g.name}: confidence exceeded 95 (got ${g.maxConf})`);
    }
  }

  // Criterion 2: Mean confidence never decreases from 0 to 8 cycles, and never rises > 20 points in one cycle.
  for (const g of groups) {
    for (let k = 1; k <= 8; k += 1) {
      const prev = g.meanConfByCycle[k - 1] ?? 0;
      const cur = g.meanConfByCycle[k] ?? 0;
      if (cur < prev - 1e-6) {
        failures.push(`${g.name}: mean confidence decreased from cycle ${k - 1} (${prev.toFixed(2)}) to ${k} (${cur.toFixed(2)})`);
      }
    }
    if (g.maxMeanStepJump > 20) {
      failures.push(`${g.name}: mean single-cycle confidence jump exceeded 20 (got ${g.maxMeanStepJump.toFixed(2)})`);
    }
  }

  // Criterion 3: At 8 cycles: Regular >= 80, Very Irregular <= 60. From 3 cycles on: Regular > Moderate > Very Irregular.
  if ((regular.meanConfByCycle[8] ?? 0) < 80) {
    failures.push(`Regular at 8 cycles < 80 (${regular.meanConfByCycle[8]?.toFixed(2)})`);
  }
  if ((veryIrreg.meanConfByCycle[8] ?? 100) > 60) {
    failures.push(`Very irregular at 8 cycles > 60 (${veryIrreg.meanConfByCycle[8]?.toFixed(2)})`);
  }
  for (let k = 3; k <= CYCLES_PER_PERSON; k += 1) {
    const r = regular.meanConfByCycle[k] ?? 0;
    const m = moderate.meanConfByCycle[k] ?? 0;
    const v = veryIrreg.meanConfByCycle[k] ?? 0;
    if (!(r > m && m > v)) {
      failures.push(`At cycle ${k}: expected Regular (${r.toFixed(2)}) > Moderate (${m.toFixed(2)}) > Very Irregular (${v.toFixed(2)})`);
    }
  }

  // Criterion 4 & 5: Possible holds 60..90%, Likely holds 35..65% (after >= 4 cycles)
  for (const g of groups) {
    if (g.possibleHoldRateAfter4 < 0.6 || g.possibleHoldRateAfter4 > 0.9) {
      failures.push(`${g.name}: possible hold rate ${(g.possibleHoldRateAfter4 * 100).toFixed(1)}% outside [60%, 90%]`);
    }
    if (g.likelyHoldRateAfter4 < 0.35 || g.likelyHoldRateAfter4 > 0.65) {
      failures.push(`${g.name}: likely hold rate ${(g.likelyHoldRateAfter4 * 100).toFixed(1)}% outside [35%, 65%]`);
    }
  }

  // Criterion 6: Real lead-in halves median error; random signals false pattern <= 10% at every length 4..12
  if (lead.medianErrLeadIn > lead.medianErrBaseline * 0.5) {
    failures.push(`Lead-in median error (${lead.medianErrLeadIn}) did not fall by at least half from baseline (${lead.medianErrBaseline})`);
  }
  if (lead.maxFalsePositiveRate4to12 > 0.1) {
    failures.push(`Random signals false pattern rate exceeded 10% (${(lead.maxFalsePositiveRate4to12 * 100).toFixed(1)}%)`);
  }

  if (failures.length > 0) {
    console.error('\nSimulation acceptance criteria FAILED:');
    for (const err of failures) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('\nAll 6 acceptance criteria PASSED.\n');
}

main();
